from fastapi import APIRouter, HTTPException, Header
from datetime import datetime, timedelta
from bson import ObjectId
from typing import Optional

from database import timer_sessions_collection, daily_records_collection, users_collection
from models import TimerStartRequest, TimerStopRequest, TimerStatusResponse
from routers.auth import verify_token

router = APIRouter(prefix="/timer", tags=["计时"])

# 验证常量
MAX_SESSION_HOURS = 24  # 单次计时最大时长（小时）
MAX_SESSION_SECONDS = MAX_SESSION_HOURS * 3600

def get_user_id(authorization: str = Header(...)) -> str:
    """从Header获取用户ID"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="无效的Authorization头")
    token = authorization[7:]
    return verify_token(token)

def get_today_date() -> str:
    """获取今天的日期字符串"""
    return datetime.now().strftime("%Y-%m-%d")

def get_today_total(user_id: str, date: str) -> int:
    """获取用户今日累计佩戴秒数"""
    record = daily_records_collection.find_one({"user_id": user_id, "date": date})
    return record["total_seconds"] if record else 0

def get_target_seconds(user_id: str) -> int:
    """获取用户目标秒数"""
    try:
        if ObjectId.is_valid(user_id):
            user = users_collection.find_one({"_id": ObjectId(user_id)})
        else:
            user = None
        if user and "plan" in user:
            return int(user["plan"].get("target_hours", 22) * 3600)
    except Exception:
        pass
    return 22 * 3600

def validate_session_duration(start_time: datetime, end_time: datetime) -> int:
    """验证并计算会话时长，防止异常数据"""
    # 移除时区信息
    if hasattr(end_time, 'tzinfo') and end_time.tzinfo is not None:
        end_time = end_time.replace(tzinfo=None)
    if hasattr(start_time, 'tzinfo') and start_time.tzinfo is not None:
        start_time = start_time.replace(tzinfo=None)
    
    duration = int((end_time - start_time).total_seconds())
    
    # 验证：时长不能为负
    if duration < 0:
        raise HTTPException(status_code=400, detail="无效的计时时长：结束时间早于开始时间")
    
    # 验证：单次计时不能超过24小时
    if duration > MAX_SESSION_SECONDS:
        raise HTTPException(
            status_code=400, 
            detail=f"单次计时超过{MAX_SESSION_HOURS}小时限制，请检查是否忘记停止计时"
        )
    
    return duration

def auto_close_expired_sessions(user_id: str):
    """自动关闭超时的会话"""
    # 查找所有未结束且超过24小时的会话
    cutoff_time = datetime.now() - timedelta(hours=MAX_SESSION_HOURS)
    
    expired_sessions = timer_sessions_collection.find({
        "user_id": user_id,
        "end_time": None,
        "start_time": {"$lt": cutoff_time}
    })
    
    for session in expired_sessions:
        # 将超时会话按最大时长结算
        start_time = session["start_time"]
        if hasattr(start_time, 'tzinfo') and start_time.tzinfo is not None:
            start_time = start_time.replace(tzinfo=None)
        
        end_time = start_time + timedelta(hours=MAX_SESSION_HOURS)
        duration = MAX_SESSION_SECONDS
        
        timer_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {
                "end_time": end_time,
                "duration": duration,
                "auto_closed": True  # 标记为自动关闭
            }}
        )
        
        # 更新每日记录
        daily_records_collection.update_one(
            {"user_id": user_id, "date": session["date"]},
            {
                "$inc": {"total_seconds": duration},
                "$setOnInsert": {"user_id": user_id, "date": session["date"]}
            },
            upsert=True
        )

@router.get("/status", response_model=TimerStatusResponse)
async def get_timer_status(authorization: str = Header(...)):
    """获取当前计时状态"""
    user_id = get_user_id(authorization)
    today = get_today_date()
    
    # 自动关闭超时会话
    auto_close_expired_sessions(user_id)
    
    # 查找进行中的计时会话
    active_session = timer_sessions_collection.find_one({
        "user_id": user_id,
        "end_time": None
    })
    
    today_total = get_today_total(user_id, today)
    target_seconds = get_target_seconds(user_id)
    
    # 返回服务器时间，用于前端校准
    server_time = datetime.now()
    
    if active_session:
        start_time = active_session["start_time"]
        if hasattr(start_time, 'tzinfo') and start_time.tzinfo is not None:
            start_time = start_time.replace(tzinfo=None)
        
        return TimerStatusResponse(
            is_wearing=True,
            session_id=str(active_session["_id"]),
            start_time=start_time,
            today_total=today_total,
            target_seconds=target_seconds,
            server_time=server_time
        )
    
    return TimerStatusResponse(
        is_wearing=False,
        today_total=today_total,
        target_seconds=target_seconds,
        server_time=server_time
    )

@router.post("/start")
async def start_timer(
    request: TimerStartRequest = None,
    authorization: str = Header(...)
):
    """开始计时 - 时间由服务器决定，忽略客户端传入的时间"""
    user_id = get_user_id(authorization)
    today = get_today_date()
    
    # 自动关闭超时会话
    auto_close_expired_sessions(user_id)
    
    # 检查是否已有进行中的会话
    active_session = timer_sessions_collection.find_one({
        "user_id": user_id,
        "end_time": None
    })
    
    if active_session:
        raise HTTPException(status_code=400, detail="已有进行中的计时会话")
    
    # 使用服务器时间作为开始时间（忽略客户端传入的时间）
    start_time = datetime.now()
    
    session = {
        "user_id": user_id,
        "start_time": start_time,
        "end_time": None,
        "duration": None,
        "date": today
    }
    
    result = timer_sessions_collection.insert_one(session)
    
    return {
        "session_id": str(result.inserted_id),
        "start_time": start_time,
        "server_time": start_time,  # 返回服务器时间供前端同步
        "status": "started"
    }

@router.post("/stop")
async def stop_timer(
    request: TimerStopRequest,
    authorization: str = Header(...)
):
    """停止计时 - 时间由服务器决定"""
    try:
        user_id = get_user_id(authorization)
        
        # 验证 session_id 格式
        if not ObjectId.is_valid(request.session_id):
            raise HTTPException(status_code=400, detail="无效的会话ID格式")
        
        # 查找会话
        session = timer_sessions_collection.find_one({
            "_id": ObjectId(request.session_id),
            "user_id": user_id
        })
        
        if not session:
            raise HTTPException(status_code=404, detail="计时会话不存在")
        
        if session["end_time"] is not None:
            raise HTTPException(status_code=400, detail="计时会话已结束")
        
        # 使用服务器时间作为结束时间
        end_time = datetime.now()
        start_time = session["start_time"]
        
        # 验证并计算时长
        duration = validate_session_duration(start_time, end_time)
        
        # 更新会话
        timer_sessions_collection.update_one(
            {"_id": ObjectId(request.session_id)},
            {"$set": {
                "end_time": end_time,
                "duration": duration
            }}
        )
        
        # 更新今日记录
        today = session["date"]
        daily_records_collection.update_one(
            {"user_id": user_id, "date": today},
            {
                "$inc": {"total_seconds": duration},
                "$setOnInsert": {"user_id": user_id, "date": today}
            },
            upsert=True
        )
        
        # 获取更新后的今日总时长
        today_total = get_today_total(user_id, today)
        target_seconds = get_target_seconds(user_id)
        
        # 检查是否达标并更新
        completed = today_total >= target_seconds
        daily_records_collection.update_one(
            {"user_id": user_id, "date": today},
            {"$set": {"completed": completed}}
        )
        
        return {
            "session_id": request.session_id,
            "duration": duration,
            "today_total": today_total,
            "completed": completed,
            "status": "stopped",
            "server_time": datetime.now()  # 返回服务器时间
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"stop_timer error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
