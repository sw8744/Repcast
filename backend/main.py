import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import util.db as db
import hashlib
import bcrypt
import time
import dotenv
import os

from util.body import InsertSession, FinishSession
from util.maker import idMaker

dotenv.load_dotenv("../.env")

app = FastAPI()

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