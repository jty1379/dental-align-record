from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class PlanModel(BaseModel):
    total_sets: int = Field(default=30, description="牙套总副数")
    days_per_set: int = Field(default=14, description="每副佩戴天数")
    current_set: int = Field(default=1, description="当前第几副")
    target_hours: float = Field(default=22.0, description="每天目标佩戴小时数")
    night_start_time: str = Field(default="22:00", description="夜间理想开始时间")
    night_end_time: str = Field(default="07:00", description="夜间理想结束时间")
    start_date: Optional[str] = Field(default=None, description="开始佩戴日期")

class UserModel(BaseModel):
    openid: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    plan: PlanModel = Field(default_factory=PlanModel)

class UserInDB(UserModel):
    id: str = Field(alias="_id")
