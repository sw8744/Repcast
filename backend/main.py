import datetime
import io
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import util.db as db
import hashlib
import bcrypt
import time
import dotenv
import os
from urllib.parse import quote

from util.body import InsertSession, FinishSession, SendReportEmail, UserRegister
from util.maker import idMaker
from util.name import romanize_korean_name
from util.report import generate_report_pdf
from util.report_email import (
    EmailConfigurationError,
    EmailDeliveryError,
    GmailReportSender,
    InvalidRecipientError,
    mask_email,
    send_report_email,
)
from util.report_repository import load_report_source, load_report_user_ids

dotenv.load_dotenv("../.env")

app = FastAPI()
logger = logging.getLogger(__name__)

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
    try:
        if uid:
            query = "SELECT uid, name, tel, email, join_date, expire_date, last_use FROM \"user\".\"user\" WHERE uid=%s"
            params = (uid, )
        else:
            query = "SELECT uid, name, tel, email, join_date, expire_date, last_use FROM \"user\".\"user\" ORDER BY join_date DESC"
            params = ()

        res = db.executeQuery(con, query, params)
    finally:
        con.close()

    return {
        "users": [
            {
                "uid": row[0],
                "name": romanize_korean_name(row[1]) if uid else row[1],
                "tel": row[2],
                "email": row[3],
                "join_date": row[4],
                "expire_date": row[5],
                "last_use": row[6],
            }
            for row in res
        ]
    }

@app.get("/equipment")
def get_equipment():
    con = db.connect()
    try:
        query = """
            SELECT id, name, category, last_used, gym, status
            FROM equipment.list
            ORDER BY category, name
        """
        res = db.executeQuery(con, query)
    finally:
        con.close()

    return {
        "equipment": [
            {
                "id": row[0],
                "name": row[1],
                "category": row[2],
                "last_used": row[3],
                "gym": row[4],
                "status": row[5],
            }
            for row in res
        ]
    }

@app.get("/session")
def get_session():
    con = db.connect()
    try:
        query = """
            SELECT
                s.sid,
                s.uid,
                u.name,
                s.gym,
                g.name,
                s.equipment,
                e.name,
                e.category,
                s.count,
                s."set",
                s.start,
                s.finish,
                s.weight
            FROM equipment.session s
            LEFT JOIN "user"."user" u ON u.uid = s.uid
            LEFT JOIN gym.gym g ON g."key" = s.gym
            LEFT JOIN equipment.list e ON e.id = s.equipment
            ORDER BY s.start DESC
        """
        res = db.executeQuery(con, query)
    finally:
        con.close()

    return {
        "sessions": [
            {
                "sid": row[0],
                "uid": row[1],
                "user_name": row[2],
                "gym": row[3],
                "gym_name": row[4],
                "equipment": row[5],
                "equipment_name": row[6],
                "category": row[7],
                "count": row[8],
                "set": row[9],
                "start": row[10],
                "finish": row[11],
                "weight": row[12],
            }
            for row in res
        ]
    }


@app.get("/report")
def get_report(uid: str):
    source = load_report_source(uid)
    if source is None:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다.")

    report = generate_report_pdf(source)
    safe_name = "".join(
        character
        for character in source["user"]["name"]
        if character not in {'"', "'", "/", "\\", "\r", "\n"}
    ).strip() or "회원"
    filename = f"RepCast_{safe_name}_운동_분석_리포트.pdf"

    return StreamingResponse(
        io.BytesIO(report),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
        },
    )


@app.post("/report/email")
def email_report(request: SendReportEmail):
    source = load_report_source(request.uid)
    if source is None:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다.")

    recipient = source["user"].get("email")
    if not recipient:
        raise HTTPException(
            status_code=422,
            detail="회원에게 등록된 이메일 주소가 없습니다.",
        )

    report = generate_report_pdf(source)
    try:
        normalized_recipient = send_report_email(
            recipient=recipient,
            member_name=source["user"]["name"],
            report_pdf=report,
            reference_date=source["reference_date"],
        )
    except InvalidRecipientError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except EmailConfigurationError as error:
        logger.error("Report email configuration error: %s", error)
        raise HTTPException(
            status_code=503,
            detail="이메일 발송 설정이 완료되지 않았습니다.",
        ) from error
    except EmailDeliveryError as error:
        logger.exception("Report email delivery failed")
        raise HTTPException(
            status_code=502,
            detail="이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        ) from error

    return {
        "status": "sent",
        "uid": request.uid,
        "recipient": mask_email(normalized_recipient),
    }


@app.post("/report/email/all")
def email_all_reports():
    user_ids = load_report_user_ids()
    sent = 0
    failures = []

    try:
        with GmailReportSender() as sender:
            for uid in user_ids:
                try:
                    source = load_report_source(uid)
                    if source is None:
                        failures.append({
                            "uid": uid,
                            "reason": "회원을 찾을 수 없습니다.",
                        })
                        continue

                    recipient = source["user"].get("email")
                    if not recipient:
                        failures.append({
                            "uid": uid,
                            "reason": "등록된 이메일 주소가 없습니다.",
                        })
                        continue

                    report = generate_report_pdf(source)
                    sender.send(
                        recipient=recipient,
                        member_name=source["user"]["name"],
                        report_pdf=report,
                        reference_date=source["reference_date"],
                    )
                    sent += 1
                except InvalidRecipientError:
                    failures.append({
                        "uid": uid,
                        "reason": "이메일 주소가 올바르지 않습니다.",
                    })
                except EmailDeliveryError:
                    logger.exception(
                        "Bulk report email delivery failed for uid=%s", uid
                    )
                    failures.append({
                        "uid": uid,
                        "reason": "Gmail 발송에 실패했습니다.",
                    })
                except Exception:
                    logger.exception(
                        "Bulk report generation failed for uid=%s", uid
                    )
                    failures.append({
                        "uid": uid,
                        "reason": "리포트 생성에 실패했습니다.",
                    })
    except EmailConfigurationError as error:
        logger.error("Gmail configuration error: %s", error)
        raise HTTPException(
            status_code=503,
            detail="Gmail 발송 설정이 완료되지 않았습니다.",
        ) from error
    except EmailDeliveryError as error:
        logger.exception("Gmail connection failed")
        raise HTTPException(
            status_code=502,
            detail="Gmail 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
        ) from error

    failed = len(failures)
    return {
        "status": "sent" if failed == 0 else "partial",
        "total": len(user_ids),
        "sent": sent,
        "failed": failed,
        "failures": failures,
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
def session_finish(session: FinishSession):
    finish = datetime.datetime.now()
    con = db.connect()
    try:
        query = "UPDATE equipment.session SET finish = %s, count = %s, set = %s, weight = %s WHERE sid = %s"
        params = (
            finish,
            session.count,
            session.set,
            session.weight,
            session.sid,
        )
        db.executeQuery(con, query, params)
    finally:
        con.close()

    return {
        "status": "success"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("HOST_PORT")))
