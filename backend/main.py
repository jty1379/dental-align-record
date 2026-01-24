from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import API_PREFIX
from routers import auth_router, timer_router, plan_router, stats_router

app = FastAPI(
    title="牙套佩戴记录 API",
    description="用于记录和管理牙套佩戴时间的后端服务",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境请设置具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(timer_router, prefix=API_PREFIX)
app.include_router(plan_router, prefix=API_PREFIX)
app.include_router(stats_router, prefix=API_PREFIX)

@app.get("/")
async def root():
    return {"message": "牙套佩戴记录 API 服务运行中", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
