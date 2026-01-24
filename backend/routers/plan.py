from fastapi import APIRouter, HTTPException, Header
from bson import ObjectId
from datetime import datetime

from database import users_collection
from models import PlanModel
from routers.auth import verify_token

router = APIRouter(prefix="/plan", tags=["计划"])

def get_user_id(authorization: str = Header(...)) -> str:
    """从Header获取用户ID"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="无效的Authorization头")
    token = authorization[7:]
    return verify_token(token)

@router.get("")
async def get_plan(authorization: str = Header(...)):
    """获取用户计划"""
    user_id = get_user_id(authorization)
    
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    plan = user.get("plan", PlanModel().model_dump())
    
    # 计算已佩戴天数
    if plan.get("start_date"):
        start = datetime.strptime(plan["start_date"], "%Y-%m-%d")
        days_worn = (datetime.now() - start).days + 1
    else:
        days_worn = 0
    
    # 计算当前副应该佩戴的天数
    current_set_day = days_worn % plan.get("days_per_set", 14)
    if current_set_day == 0:
        current_set_day = plan.get("days_per_set", 14)
    
    return {
        **plan,
        "days_worn": days_worn,
        "current_set_day": current_set_day
    }

@router.put("")
async def update_plan(
    plan: PlanModel,
    authorization: str = Header(...)
):
    """更新用户计划"""
    user_id = get_user_id(authorization)
    
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"plan": plan.model_dump()}}
    )
    
    return {"success": True, "message": "计划已更新"}

@router.post("/next-set")
async def advance_to_next_set(authorization: str = Header(...)):
    """切换到下一副牙套"""
    user_id = get_user_id(authorization)
    
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    plan = user.get("plan", {})
    current_set = plan.get("current_set", 1)
    total_sets = plan.get("total_sets", 30)
    
    if current_set >= total_sets:
        raise HTTPException(status_code=400, detail="已经是最后一副牙套")
    
    users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"plan.current_set": current_set + 1}}
    )
    
    return {"success": True, "current_set": current_set + 1}
