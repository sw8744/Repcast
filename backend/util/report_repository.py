import calendar
import datetime

import util.db as db


def _month_start(value: datetime.date) -> datetime.datetime:
    return datetime.datetime.combine(value.replace(day=1), datetime.time.min)


def _previous_month_start(value: datetime.date) -> datetime.datetime:
    if value.month == 1:
        return datetime.datetime(value.year - 1, 12, 1)
    return datetime.datetime(value.year, value.month - 1, 1)


def _rank(values, uid, index):
    current = next((row[index] for row in values if row[0] == uid), 0)
    rank = 1 + sum(1 for row in values if row[index] > current)
    return current, rank


def load_report_user_ids():
    connection = db.connect()
    try:
        rows = db.executeQuery(
            connection,
            """
                SELECT uid
                FROM "user"."user"
                ORDER BY join_date
            """,
        )
        return [row[0] for row in rows]
    finally:
        connection.close()


def load_report_source(uid: str):
    """Load one member's report rows plus anonymized cohort aggregates."""
    connection = db.connect()
    try:
        user_rows = db.executeQuery(
            connection,
            """
                SELECT uid, name, email, join_date, expire_date
                FROM "user"."user"
                WHERE uid = %s
            """,
            (uid,),
        )
        if not user_rows:
            return None

        user_row = user_rows[0]
        session_rows = db.executeQuery(
            connection,
            """
                SELECT
                    s.sid,
                    COALESCE(e.name, '알 수 없는 기구'),
                    COALESCE(e.category, 'other'),
                    COALESCE(s.count, 0),
                    COALESCE(s."set", 0),
                    s.start,
                    s.finish,
                    COALESCE(s.weight, 0)
                FROM equipment.session s
                LEFT JOIN equipment.list e ON e.id = s.equipment
                WHERE s.uid = %s
                  AND s.finish IS NOT NULL
                ORDER BY s.start
            """,
            (uid,),
        )

        starts = [row[5] for row in session_rows if row[5] is not None]
        reference_date = max(starts).date() if starts else datetime.date.today()
        week_start_date = reference_date - datetime.timedelta(
            days=reference_date.weekday()
        )
        week_start = datetime.datetime.combine(week_start_date, datetime.time.min)
        reference_end = datetime.datetime.combine(
            reference_date + datetime.timedelta(days=1), datetime.time.min
        )
        month_start = _month_start(reference_date)
        previous_month_start = _previous_month_start(reference_date)
        range_start = min(week_start, previous_month_start)

        cohort_rows = db.executeQuery(
            connection,
            """
                SELECT
                    u.uid,
                    COUNT(DISTINCT CASE
                        WHEN s.start >= %s AND s.start < %s THEN s.start::date
                    END) AS weekly_visits,
                    COALESCE(SUM(CASE
                        WHEN s.start >= %s AND s.start < %s
                        THEN COALESCE(s.count, 0)::bigint
                           * GREATEST(COALESCE(s."set", 0), 1)::bigint
                           * COALESCE(s.weight, 0)::bigint
                        ELSE 0
                    END), 0) AS monthly_volume,
                    COALESCE(SUM(CASE
                        WHEN s.start >= %s AND s.start < %s
                        THEN COALESCE(s.count, 0)::bigint
                           * GREATEST(COALESCE(s."set", 0), 1)::bigint
                           * COALESCE(s.weight, 0)::bigint
                        ELSE 0
                    END), 0) AS previous_month_volume
                FROM "user"."user" u
                LEFT JOIN equipment.session s
                  ON s.uid = u.uid
                 AND s.finish IS NOT NULL
                 AND s.start >= %s
                 AND s.start < %s
                GROUP BY u.uid
            """,
            (
                week_start,
                reference_end,
                month_start,
                reference_end,
                previous_month_start,
                month_start,
                range_start,
                reference_end,
            ),
        )

        weekly_visits, weekly_rank = _rank(cohort_rows, uid, 1)
        monthly_volume, volume_rank = _rank(cohort_rows, uid, 2)
        previous_volume, previous_volume_rank = _rank(cohort_rows, uid, 3)
        member_count = max(len(cohort_rows), 1)

        return {
            "user": {
                "uid": user_row[0],
                "name": user_row[1] or "회원",
                "email": user_row[2],
                "join_date": user_row[3],
                "expire_date": user_row[4],
            },
            "sessions": [
                {
                    "sid": row[0],
                    "equipment_name": row[1],
                    "category": row[2],
                    "count": row[3],
                    "sets": row[4],
                    "start": row[5],
                    "finish": row[6],
                    "weight": row[7],
                }
                for row in session_rows
            ],
            "cohort": {
                "member_count": member_count,
                "weekly_visits": weekly_visits,
                "weekly_rank": weekly_rank,
                "monthly_volume": monthly_volume,
                "volume_rank": volume_rank,
                "previous_volume": previous_volume,
                "previous_volume_rank": previous_volume_rank,
            },
            "reference_date": reference_date,
            "days_in_month": calendar.monthrange(
                reference_date.year, reference_date.month
            )[1],
        }
    finally:
        connection.close()
