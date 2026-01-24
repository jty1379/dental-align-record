from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class TimerSession(BaseModel):
    user_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: Optional[int] = None  # 秒
    date: str  # 所属日期 YYYY-MM-DD

class TimerStartRequest(BaseModel):
    start_time: Optional[datetime] = None

class TimerStopRequest(BaseModel):
    session_id: str
    end_time: Optional[datetime] = None

class TimerStatusResponse(BaseModel):
    is_wearing: bool
    session_id: Optional[str] = None
    start_time: Optional[datetime] = None
    today_total: int = 0  # 今日累计秒数
    target_seconds: int = 79200  # 目标秒数 (22小时)
