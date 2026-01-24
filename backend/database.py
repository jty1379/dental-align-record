from pymongo import MongoClient
from config import MONGODB_URL, DATABASE_NAME

client = MongoClient(MONGODB_URL)
db = client[DATABASE_NAME]

# 集合
users_collection = db["users"]
timer_sessions_collection = db["timer_sessions"]
daily_records_collection = db["daily_records"]

# 创建索引
users_collection.create_index("openid", unique=True)
timer_sessions_collection.create_index([("user_id", 1), ("date", 1)])
daily_records_collection.create_index([("user_id", 1), ("date", 1)], unique=True)
