from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class DailyRecord(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    total_seconds: int = 0
    completed: bool = False

class WeeklyStats(BaseModel):
    week_data: List[dict]  # [{date, hours, completed}, ...]
    avg_hours: float
    completion_rate: float  # 完成率百分比
    current_streak: int  # 当前连续完成天数
    longest_streak: int  # 历史最长连续天数
    total_completed_days: int
    suggestions: List[str]  # 智能建议
