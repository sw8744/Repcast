import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import util.db as db
import hashlib
import bcrypt
import time
import dotenv
import os

from util.body import InsertSession, FinishSession, UserRegister
from util.maker import idMaker

dotenv.load_dotenv("../.env")

app = FastAPI()

def calculate_expire_date(join_date: datetime.datetime, months: int) -> datetime.datetime:
    # 가입 월에서 이용권 개월 수만큼 이동한 목표 월을 구한다.
    target_month_index = join_date.year * 12 + (join_date.month - 1) + months

    # 목표 월의 다음 달 1일에서 1마이크로초를 빼면 목표 월의 마지막 순간이다.
    next_month_index = target_month_index + 1
    next_year, next_month_zero_based = divmod(next_month_index, 12)
    next_month_start = join_date.replace(
        year=next_year,
        month=next_month_zero_based + 1,
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    return next_month_start - datetime.timedelta(microseconds=1)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://repcast.site",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/')
def test():
    raise HTTPException(404, "Hi")

@app.post("/user/register")
def user_register(user: UserRegister):
    # MIFARE Classic 데이터 블록은 16바이트이므로 회원 UID도 16자로 제한한다.
    uid = idMaker()[:16]
    join_date = datetime.datetime.now()
    expire_date = calculate_expire_date(join_date, user.expire)
    con = db.connect()
    query = "INSERT INTO \"user\".\"user\" (uid, name, tel, email, join_date, expire_date) VALUES (%s, %s, %s, %s, %s, %s)"
    params = (uid, user.name, user.tel, user.email, join_date, expire_date)
    db.executeQuery(con, query, params)

    return {
        "uid": uid
    }

@app.get("/user")
def get_user(uid: str = ""):
    con = db.connect()
    if uid:
        query = "SELECT uid, name, tel, email, join_date, expire_date, last_use FROM \"user\".\"user\" WHERE uid=%s"
        params = (uid, )
    else:
        query = "SELECT uid, name, tel, email, join_date, expire_date, last_use FROM \"user\".\"user\" ORDER BY join_date DESC"
        params = ()

    res = db.executeQuery(con, query, params)
    return {
        "users": [
            {
                "uid": row[0],
                "name": row[1],
                "tel": row[2],
                "email": row[3],
                "join_date": row[4],
                "expire_date": row[5],
                "last_use": row[6],
            }
            for row in res
        ]
    }

@app.post("/session/start")
def session_start(session: InsertSession):
    sid = idMaker()
    start = datetime.datetime.now()
    con = db.connect()
    query = "INSERT INTO equipment.session (sid, uid, gym, equipment, count, set, start) VALUES (%s, %s, %s, %s, %s, %s, %s)"
    params = (sid, session.uid, session.gym, session.equipment, 0, 1, start)
    db.executeQuery(con, query, params)

    return {
        "sid": sid
    }

@app.post("/session/finish")
def session_start(session: FinishSession):
    finish = datetime.datetime.now()
    con = db.connect()
    query = "UPDATE equipment.session SET finish = %s, count = %s, set = %s WHERE sid = %s"
    params = (finish, session.count, session.set, session.sid)
    db.executeQuery(con, query, params)

    db.executeQuery(con, query, params)

    return {
        "status": "success"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("HOST_PORT")))
