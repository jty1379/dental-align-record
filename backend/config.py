import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB配置
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "dental_align")

# 微信小程序配置
WECHAT_APPID = os.getenv("WECHAT_APPID", "your_appid_here")
WECHAT_SECRET = os.getenv("WECHAT_SECRET", "your_secret_here")

# JWT配置
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 7  # 7天过期

# 服务器配置
API_PREFIX = "/api"
