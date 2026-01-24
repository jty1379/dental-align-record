"""
数据库检查脚本 - 查看所有数据库和 dental_align 中的数据
"""
from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")

print("=" * 50)
print("所有数据库:")
print("=" * 50)
for db_name in client.list_database_names():
    print(f"  - {db_name}")

print("\n" + "=" * 50)
print("dental_align 数据库内容:")
print("=" * 50)

db = client["dental_align"]

# 列出所有集合
collections = db.list_collection_names()
print(f"\n集合列表: {collections}")

# 查看用户数据
print("\n--- users 集合 ---")
for user in db.users.find():
    print(user)

# 查看计时会话
print("\n--- timer_sessions 集合 ---")
for session in db.timer_sessions.find().limit(10):
    print(session)

# 查看每日记录
print("\n--- daily_records 集合 ---")
for record in db.daily_records.find().limit(10):
    print(record)

print("\n" + "=" * 50)
print("检查完成")
print("=" * 50)
