import psycopg2
import os
import dotenv

dotenv.load_dotenv("../../.env")

def connect():
    connection = psycopg2.connect(
        host=os.environ.get("DB_HOST"),
        database=os.environ.get("DB_DATABASE"),
        port=os.environ.get("DB_PORT"),
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASSWORD")
    )
    return connection


def executeQuery(connect, query, params=None):
    cur = connect.cursor()

    if params:
        cur.execute(query, params)
    else:
        cur.execute(query)

    if query.strip().upper().startswith("SELECT"):
        result = cur.fetchall()
        return result
    else:
        connect.commit()
        return None