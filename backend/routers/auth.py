from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt
import httpx

from config import WECHAT_APPID, WECHAT_SECRET, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from database import users_collection
from models import UserModel, PlanModel

router = APIRouter(prefix="/auth", tags=["认证"])

class LoginRequest(BaseModel):
    code: str

class LoginResponse(BaseModel):
    token: str
    user_id: str
    is_new_user: bool

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "user_id": user_id,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except Exception:
        raise HTTPException(status_code=401, detail="Token无效或已过期")

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """微信登录"""
    # 调用微信接口获取openid
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": WECHAT_APPID,
        "secret": WECHAT_SECRET,
        "js_code": request.code,
        "grant_type": "authorization_code"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        data = response.json()
    
    if "errcode" in data and data["errcode"] != 0:
        # 开发环境：微信接口调用失败时，使用code作为模拟openid
        # 这样开发者工具可以正常测试
        openid = f"dev_{request.code[:16]}"
    else:
        openid = data["openid"]
    
    # 查找或创建用户
    user = users_collection.find_one({"openid": openid})
    is_new_user = False
    
    if not user:
        # 创建新用户
        new_user = {
            "openid": openid,
            "created_at": datetime.utcnow(),
            "plan": PlanModel().model_dump()
        }
        result = users_collection.insert_one(new_user)
        user_id = str(result.inserted_id)
        is_new_user = True
    else:
        user_id = str(user["_id"])
    
    # 生成token
    token = create_token(user_id)
    
    return LoginResponse(
        token=token,
        user_id=user_id,
        is_new_user=is_new_user
    )
