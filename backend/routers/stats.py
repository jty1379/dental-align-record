from fastapi import APIRouter, HTTPException, Header, Query
from bson import ObjectId
from datetime import datetime, timedelta
from typing import List, Optional

from database import daily_records_collection, users_collection
from models import WeeklyStats
from routers.auth import verify_token

router = APIRouter(prefix="/stats", tags=["统计"])

def get_user_id(authorization: str = Header(...)) -> str:
    """从Header获取用户ID"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="无效的Authorization头")
    token = authorization[7:]
    return verify_token(token)

def calculate_streak(records: List[dict]) -> tuple:
    """计算连续完成天数"""
    if not records:
        return 0, 0
    
    # 按日期排序（降序，最新的在前）
    sorted_records = sorted(records, key=lambda x: x["date"], reverse=True)
    
    current_streak = 0
    longest_streak = 0
    temp_streak = 0
    
    for record in sorted_records:
        if record.get("completed", False):
            temp_streak += 1
            if temp_streak > longest_streak:
                longest_streak = temp_streak
        else:
            if temp_streak > 0 and current_streak == 0:
                current_streak = temp_streak
            temp_streak = 0
    
    # 如果一直都是完成的
    if current_streak == 0 and temp_streak > 0:
        current_streak = temp_streak
    
    if temp_streak > longest_streak:
        longest_streak = temp_streak
    
    return current_streak, longest_streak

def generate_suggestions(week_data: List[dict], target_hours: float) -> List[str]:
    """生成智能建议"""
    suggestions = []
    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    
    if not week_data:
        suggestions.append("开始记录你的佩戴时间吧！")
        return suggestions
    
    # 找出佩戴时间最短的一天
    min_day = min(week_data, key=lambda x: x.get("hours", 0))
    if min_day.get("hours", 0) < target_hours * 0.8:
        date_obj = datetime.strptime(min_day["date"], "%Y-%m-%d")
        weekday = weekday_names[date_obj.weekday()]
        suggestions.append(f"{weekday}的佩戴时间较短，建议加强")
    
    # 检查连续未达标
    uncompleted_days = [d for d in week_data if not d.get("completed", False)]
    if len(uncompleted_days) >= 3:
        suggestions.append("最近多天未达标，需要加油哦～")
    
    # 计算工作日和周末的平均
    weekday_hours = []
    weekend_hours = []
    for d in week_data:
        date_obj = datetime.strptime(d["date"], "%Y-%m-%d")
        if date_obj.weekday() < 5:
            weekday_hours.append(d.get("hours", 0))
        else:
            weekend_hours.append(d.get("hours", 0))
    
    if weekday_hours and weekend_hours:
        avg_weekday = sum(weekday_hours) / len(weekday_hours)
        avg_weekend = sum(weekend_hours) / len(weekend_hours)
        if avg_weekend > avg_weekday * 1.2:
            suggestions.append("周末佩戴情况更好，工作日要坚持！")
    
    # 如果全部达标
    completed_days = [d for d in week_data if d.get("completed", False)]
    if len(completed_days) == len(week_data) and len(week_data) >= 7:
        suggestions.append("太棒了！本周完美达成目标！")
    
    if not suggestions:
        suggestions.append("继续保持，你做得很好！")
    
    return suggestions

@router.get("/weekly", response_model=WeeklyStats)
async def get_weekly_stats(
    authorization: str = Header(...),
    week_offset: int = Query(default=0, description="周偏移量，0表示本周，-1表示上周")
):
    """获取周统计数据"""
    user_id = get_user_id(authorization)
    
    # 获取用户目标
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    target_hours = 22.0
    if user and "plan" in user:
        target_hours = user["plan"].get("target_hours", 22.0)
    
    # 计算本周的日期范围
    today = datetime.now()
    # 找到本周一
    monday = today - timedelta(days=today.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 应用周偏移
    monday = monday + timedelta(weeks=week_offset)
    sunday = monday + timedelta(days=6)
    
    start_date = monday.strftime("%Y-%m-%d")
    end_date = sunday.strftime("%Y-%m-%d")
    
    # 查询这一周的记录
    records = list(daily_records_collection.find({
        "user_id": user_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }))
    
    # 构建周数据（确保7天都有数据）
    week_data = []
    current_date = monday
    total_hours = 0
    completed_count = 0
    
    for i in range(7):
        date_str = current_date.strftime("%Y-%m-%d")
        record = next((r for r in records if r["date"] == date_str), None)
        
        if record:
            hours = record["total_seconds"] / 3600
            completed = record.get("completed", hours >= target_hours)
        else:
            hours = 0
            completed = False
        
        week_data.append({
            "date": date_str,
            "hours": round(hours, 1),
            "completed": completed
        })
        
        total_hours += hours
        if completed:
            completed_count += 1
        
        current_date += timedelta(days=1)
    
    # 计算平均和完成率
    avg_hours = round(total_hours / 7, 1) if week_data else 0
    completion_rate = round(completed_count / 7 * 100, 1)
    
    # 获取所有记录计算连续天数
    all_records = list(daily_records_collection.find({"user_id": user_id}))
    current_streak, longest_streak = calculate_streak(all_records)
    total_completed_days = sum(1 for r in all_records if r.get("completed", False))
    
    # 生成建议
    suggestions = generate_suggestions(week_data, target_hours)
    
    return WeeklyStats(
        week_data=week_data,
        avg_hours=avg_hours,
        completion_rate=completion_rate,
        current_streak=current_streak,
        longest_streak=longest_streak,
        total_completed_days=total_completed_days,
        suggestions=suggestions
    )

@router.get("/records")
async def get_records(
    authorization: str = Header(...),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    limit: int = Query(default=30, le=100)
):
    """获取佩戴记录"""
    user_id = get_user_id(authorization)
    
    query = {"user_id": user_id}
    
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    
    records = list(daily_records_collection.find(
        query,
        {"_id": 0}
    ).sort("date", -1).limit(limit))
    
    return records

@router.get("/achievements")
async def get_achievements(authorization: str = Header(...)):
    """获取成就数据"""
    user_id = get_user_id(authorization)
    
    all_records = list(daily_records_collection.find({"user_id": user_id}))
    current_streak, longest_streak = calculate_streak(all_records)
    total_completed_days = sum(1 for r in all_records if r.get("completed", False))
    total_days = len(all_records)
    total_seconds = sum(r.get("total_seconds", 0) for r in all_records)
    completion_rate = round(total_completed_days / total_days * 100) if total_days > 0 else 0
    
    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_completed_days": total_completed_days,
        "total_days": total_days,
        "total_seconds": total_seconds,
        "completion_rate": completion_rate
    }
