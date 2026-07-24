import datetime
import io
import math
import os
from collections import defaultdict

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 38
GREEN = colors.HexColor("#18B85B")
GREEN_DARK = colors.HexColor("#08753A")
GREEN_PALE = colors.HexColor("#EDFBF3")
GREEN_BORDER = colors.HexColor("#9AE9BA")
NAVY = colors.HexColor("#10182B")
SLATE = colors.HexColor("#63728A")
LIGHT = colors.HexColor("#F5F7FA")
BORDER = colors.HexColor("#E7ECF2")
BLUE = colors.HexColor("#246BEB")
BLUE_PALE = colors.HexColor("#EEF5FF")
AMBER = colors.HexColor("#A34A00")
AMBER_PALE = colors.HexColor("#FFF9E8")

CATEGORY_LABELS = {
    "lower": "하체",
    "upper-back": "등",
    "upper-chest": "가슴",
    "upper-arm": "팔",
    "upper-shoulder": "어깨",
    "core": "코어",
    "cardio": "유산소",
    "other": "기타",
}
CATEGORY_ORDER = [
    "lower",
    "upper-back",
    "upper-chest",
    "upper-arm",
    "upper-shoulder",
    "core",
]
RECOMMENDATIONS = {
    "lower": ("레그 프레스", "하체 근력과 안정성을 함께 채워보세요."),
    "upper-back": ("시티드 로우", "등의 당기는 힘과 자세 균형을 보완해보세요."),
    "upper-chest": ("체스트 프레스", "가슴의 밀기 동작을 안정적으로 강화해보세요."),
    "upper-arm": ("바이셉 컬", "짧은 세트로 팔 운동 비중을 더해보세요."),
    "upper-shoulder": ("숄더 프레스", "회복 상태를 보며 어깨 자극을 더해보세요."),
    "core": ("플랭크", "짧게라도 코어를 더하면 전신 균형이 좋아져요."),
}
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


def _register_fonts():
    regular_candidates = [
        os.environ.get("REPORT_FONT_PATH"),
        "/Users/sw8744/Library/Fonts/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf",
    ]
    bold_candidates = [
        os.environ.get("REPORT_BOLD_FONT_PATH"),
        "/Users/sw8744/Library/Fonts/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf",
    ]
    regular_path = next((path for path in regular_candidates if path and os.path.isfile(path)), None)
    bold_path = next((path for path in bold_candidates if path and os.path.isfile(path)), None)

    if regular_path:
        pdfmetrics.registerFont(TTFont("RepCast-Regular", regular_path))
        pdfmetrics.registerFont(TTFont("RepCast-Bold", bold_path or regular_path))
        return "RepCast-Regular", "RepCast-Bold"

    available_cid_fonts = []
    for font_name in ("HYSMyeongJo-Medium", "HYGothic-Medium"):
        try:
            pdfmetrics.registerFont(UnicodeCIDFont(font_name))
            available_cid_fonts.append(font_name)
        except KeyError:
            continue

    if not available_cid_fonts:
        raise RuntimeError(
            "사용 가능한 한글 글꼴이 없습니다. "
            "REPORT_FONT_PATH에 한글 TTF 파일 경로를 설정해 주세요."
        )

    regular_font = (
        "HYSMyeongJo-Medium"
        if "HYSMyeongJo-Medium" in available_cid_fonts
        else available_cid_fonts[0]
    )
    bold_font = (
        "HYGothic-Medium"
        if "HYGothic-Medium" in available_cid_fonts
        else regular_font
    )
    return regular_font, bold_font


FONT_REGULAR, FONT_BOLD = _register_fonts()


def _number(value):
    return f"{int(round(value)):,}"


def _volume(session):
    return (
        max(int(session.get("count") or 0), 0)
        * max(int(session.get("sets") or 0), 1)
        * max(int(session.get("weight") or 0), 0)
    )


def _session_date(session):
    start = session.get("start")
    return start.date() if isinstance(start, datetime.datetime) else start


def _percentile(rank, member_count):
    return max(1, min(100, math.ceil(rank / max(member_count, 1) * 100)))


def _format_duration(seconds):
    seconds = max(int(seconds), 0)
    hours, remainder = divmod(seconds, 3600)
    minutes = remainder // 60
    return f"{hours:02d}:{minutes:02d}"


def _build_metrics(source):
    sessions = source["sessions"]
    reference_date = source["reference_date"]
    day_sessions = [s for s in sessions if _session_date(s) == reference_date]
    month_start = reference_date.replace(day=1)
    recent_start = reference_date - datetime.timedelta(days=27)
    week_start = reference_date - datetime.timedelta(days=reference_date.weekday())
    month_sessions = [
        s for s in sessions if month_start <= _session_date(s) <= reference_date
    ]
    recent_sessions = [
        s for s in sessions if recent_start <= _session_date(s) <= reference_date
    ]
    week_sessions = [
        s for s in sessions if week_start <= _session_date(s) <= reference_date
    ]

    day_volume = sum(_volume(s) for s in day_sessions)
    day_sets = sum(max(int(s.get("sets") or 0), 0) for s in day_sessions)
    duration = sum(
        max(int((s["finish"] - s["start"]).total_seconds()), 0)
        for s in day_sessions
        if isinstance(s.get("start"), datetime.datetime)
        and isinstance(s.get("finish"), datetime.datetime)
    )
    visit_dates = {_session_date(s) for s in sessions}
    streak = 0
    cursor = reference_date
    while cursor in visit_dates:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    day_by_equipment = defaultdict(list)
    history_by_equipment = defaultdict(list)
    for session in sessions:
        target = (
            day_by_equipment
            if _session_date(session) == reference_date
            else history_by_equipment
        )
        target[session["equipment_name"]].append(session)

    records = []
    for equipment, current in day_by_equipment.items():
        previous = history_by_equipment[equipment]
        current_weight = max((int(s.get("weight") or 0) for s in current), default=0)
        previous_weight = max((int(s.get("weight") or 0) for s in previous), default=0)
        if current_weight > previous_weight and previous:
            records.append(
                {
                    "equipment": equipment,
                    "headline": f"최고 중량 {current_weight}kg",
                    "detail": f"이전 최고 기록 {previous_weight}kg 대비 +{current_weight - previous_weight}kg",
                    "score": current_weight - previous_weight,
                }
            )
        current_volume = max((_volume(s) for s in current), default=0)
        previous_volume = max((_volume(s) for s in previous), default=0)
        if current_volume > previous_volume and previous:
            records.append(
                {
                    "equipment": equipment,
                    "headline": f"세션 최고 볼륨 {_number(current_volume)}kg",
                    "detail": f"이전 최고 기록 {_number(previous_volume)}kg 대비 +{_number(current_volume - previous_volume)}kg",
                    "score": current_volume - previous_volume,
                }
            )
    records.sort(key=lambda item: item["score"], reverse=True)

    category_volumes = defaultdict(int)
    category_last_date = {}
    for session in recent_sessions:
        category = session.get("category") or "other"
        category_volumes[category] += _volume(session)
        category_last_date[category] = max(
            category_last_date.get(category, recent_start), _session_date(session)
        )
    total_category_volume = sum(category_volumes.values())
    category_shares = {
        category: (
            round(category_volumes[category] / total_category_volume * 100)
            if total_category_volume
            else 0
        )
        for category in CATEGORY_ORDER
    }

    weekly_volumes = []
    for week_index in range(4):
        start = recent_start + datetime.timedelta(days=week_index * 7)
        end = start + datetime.timedelta(days=6)
        weekly_volumes.append(
            sum(
                _volume(s)
                for s in recent_sessions
                if start <= _session_date(s) <= end
            )
        )

    targets = []
    for equipment, items in sorted(
        day_by_equipment.items(),
        key=lambda pair: sum(_volume(s) for s in pair[1]),
        reverse=True,
    )[:4]:
        max_weight = max((int(s.get("weight") or 0) for s in items), default=0)
        average_count = (
            sum(int(s.get("count") or 0) for s in items) / len(items) if items else 0
        )
        current_volume = sum(_volume(s) for s in items)
        if max_weight:
            target_weight = max_weight + 2
            targets.append(
                {
                    "equipment": equipment,
                    "current": f"오늘 {max_weight}kg x {average_count:g}회 평균",
                    "target": f"{target_weight}kg x {max(round(average_count), 10)}회",
                    "badge": "+2kg 도전",
                }
            )
        else:
            target_volume = int(math.ceil(max(current_volume * 1.05, 100) / 100) * 100)
            targets.append(
                {
                    "equipment": equipment,
                    "current": f"오늘 볼륨 {_number(current_volume)}kg",
                    "target": f"{_number(target_volume)}kg",
                    "badge": "볼륨 갱신 도전",
                }
            )

    for category in sorted(CATEGORY_ORDER, key=lambda item: category_shares[item]):
        if len(targets) >= 4:
            break
        exercise, _ = RECOMMENDATIONS[category]
        if any(target["equipment"] == exercise for target in targets):
            continue
        targets.append(
            {
                "equipment": exercise,
                "current": "최근 기록 없음",
                "target": "가볍게 3세트",
                "badge": "새 루틴 도전",
            }
        )

    recommendations = []
    for category in sorted(CATEGORY_ORDER, key=lambda item: category_shares[item]):
        exercise, description = RECOMMENDATIONS[category]
        recommendations.append(
            {
                "exercise": exercise,
                "category": CATEGORY_LABELS[category],
                "share": category_shares[category],
                "description": description,
            }
        )
        if len(recommendations) == 2:
            break

    return {
        "day_sessions": day_sessions,
        "duration": duration,
        "day_volume": day_volume,
        "day_sets": day_sets,
        "day_equipment_count": len(day_by_equipment),
        "records": records[:2],
        "streak": streak,
        "month_visits": len({_session_date(s) for s in month_sessions}),
        "month_volume": sum(_volume(s) for s in month_sessions),
        "week_visits": len({_session_date(s) for s in week_sessions}),
        "category_shares": category_shares,
        "category_last_date": category_last_date,
        "weekly_volumes": weekly_volumes,
        "targets": targets[:4],
        "recommendations": recommendations,
    }


class _Renderer:
    def __init__(self, stream):
        self.canvas = canvas.Canvas(stream, pagesize=A4)

    def text(self, x, y, value, size=9, color=NAVY, bold=False):
        self.canvas.setFillColor(color)
        self.canvas.setFont(FONT_BOLD if bold else FONT_REGULAR, size)
        self.canvas.drawString(x, y, str(value))

    def right_text(self, x, y, value, size=9, color=NAVY, bold=False):
        self.canvas.setFillColor(color)
        self.canvas.setFont(FONT_BOLD if bold else FONT_REGULAR, size)
        self.canvas.drawRightString(x, y, str(value))

    def wrapped(self, x, y, value, width, size=8.5, leading=13, color=SLATE, bold=False, max_lines=3):
        font = FONT_BOLD if bold else FONT_REGULAR
        self.canvas.setFont(font, size)
        self.canvas.setFillColor(color)
        lines = []
        line = ""
        for character in str(value):
            candidate = line + character
            if line and pdfmetrics.stringWidth(candidate, font, size) > width:
                lines.append(line.rstrip())
                line = character.lstrip()
            else:
                line = candidate
        if line:
            lines.append(line.rstrip())
        for index, item in enumerate(lines[:max_lines]):
            self.canvas.drawString(x, y - index * leading, item)
        return y - min(len(lines), max_lines) * leading

    def box(self, x, y, width, height, fill=LIGHT, stroke=BORDER, radius=10):
        self.canvas.setFillColor(fill)
        self.canvas.setStrokeColor(stroke)
        self.canvas.setLineWidth(0.7)
        self.canvas.roundRect(x, y, width, height, radius, fill=1, stroke=1)

    def section(self, y, title):
        self.canvas.setFillColor(GREEN)
        self.canvas.circle(MARGIN + 3, y + 3, 3.2, fill=1, stroke=0)
        self.text(MARGIN + 13, y, title, 11, NAVY, True)

    def progress(self, x, y, width, ratio):
        ratio = max(0, min(float(ratio), 1))
        self.canvas.setFillColor(colors.HexColor("#EDF1F5"))
        self.canvas.roundRect(x, y, width, 7, 3.5, fill=1, stroke=0)
        if ratio:
            self.canvas.setFillColor(GREEN)
            self.canvas.roundRect(x, y, width * ratio, 7, 3.5, fill=1, stroke=0)

    def header(self, page_number, reference_date):
        self.canvas.setFillColor(GREEN)
        self.canvas.roundRect(MARGIN, PAGE_HEIGHT - 57, 19, 19, 5, fill=1, stroke=0)
        self.text(MARGIN + 26, PAGE_HEIGHT - 52, "RepCast", 11, NAVY, True)
        self.text(MARGIN + 75, PAGE_HEIGHT - 52, "운동 분석 리포트", 10, colors.HexColor("#94A3B8"))
        self.right_text(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 52, f"{page_number} / 3", 9, colors.HexColor("#94A3B8"))
        self.canvas.setStrokeColor(BORDER)
        self.canvas.line(MARGIN, 31, PAGE_WIDTH - MARGIN, 31)
        self.right_text(
            PAGE_WIDTH - MARGIN,
            17,
            f"RepCast 운동 분석 리포트 · {reference_date:%Y.%m.%d}",
            7,
            colors.HexColor("#BAC4D2"),
        )

    def new_page(self, page_number, reference_date):
        if page_number > 1:
            self.canvas.showPage()
        self.header(page_number, reference_date)


def _draw_page_one(renderer, source, metrics):
    user = source["user"]
    cohort = source["cohort"]
    date = source["reference_date"]
    name = user["name"]
    member_count = cohort["member_count"]
    weekly_percent = _percentile(cohort["weekly_rank"], member_count)
    volume_percent = _percentile(cohort["volume_rank"], member_count)
    previous_percent = _percentile(cohort["previous_volume_rank"], member_count)
    improvement = max(previous_percent - volume_percent, 0)
    monthly_visit_goal = max(int(os.environ.get("REPORT_MONTHLY_VISIT_GOAL", 20)), 1)
    monthly_volume_goal = max(int(os.environ.get("REPORT_MONTHLY_VOLUME_GOAL", 250000)), 1)

    renderer.new_page(1, date)
    record_count = len(metrics["records"])
    renderer.text(
        MARGIN,
        746,
        f"{name}님, 오늘 개인 기록을 {record_count}개 경신했어요.",
        17,
        NAVY,
        True,
    )
    renderer.text(
        MARGIN,
        725,
        "오늘의 기록과 함께, 한눈에 보기 어려운 변화까지 담았습니다.",
        9,
        SLATE,
    )
    renderer.box(MARGIN, 689, 88, 24, GREEN_PALE, GREEN_BORDER, 12)
    renderer.text(MARGIN + 10, 697, f"{date:%Y.%m.%d} ({WEEKDAYS[date.weekday()]})", 8, GREEN_DARK, True)

    renderer.section(660, "오늘의 운동")
    card_width = (PAGE_WIDTH - MARGIN * 2 - 24) / 4
    cards = [
        (_format_duration(metrics["duration"]), "운동시간"),
        (f"{_number(metrics['day_volume'])}kg", "총 볼륨"),
        (_number(metrics["day_equipment_count"]), "종목"),
        (_number(metrics["day_sets"]), "세트"),
    ]
    for index, (value, label) in enumerate(cards):
        x = MARGIN + index * (card_width + 8)
        renderer.box(x, 606, card_width, 43)
        renderer.text(x + card_width / 2 - pdfmetrics.stringWidth(value, FONT_BOLD, 14) / 2, 628, value, 14, NAVY, True)
        renderer.text(x + card_width / 2 - pdfmetrics.stringWidth(label, FONT_REGULAR, 7.5) / 2, 614, label, 7.5, colors.HexColor("#92A0B5"))

    renderer.section(581, "오늘 경신한 개인 기록")
    records = metrics["records"] or [
        {
            "equipment": "오늘의 운동",
            "headline": "새 기록을 쌓는 중",
            "detail": "운동이 누적되면 개인 최고 기록을 비교해드려요.",
        }
    ]
    record_height = 43 if len(records) > 1 else 51
    for index, record in enumerate(records):
        y = 522 - index * 49
        renderer.box(MARGIN, y, PAGE_WIDTH - MARGIN * 2, record_height, GREEN_PALE, GREEN_BORDER)
        renderer.box(MARGIN + 12, y + 11, 28, 22, GREEN, GREEN, 5)
        renderer.text(MARGIN + 19, y + 18, "PR", 8, colors.white, True)
        renderer.text(MARGIN + 50, y + 27, f"{record['equipment']} · {record['headline']}", 9, GREEN_DARK, True)
        renderer.text(MARGIN + 50, y + 12, record["detail"], 7.8, GREEN_DARK)

    streak_y = 493 if len(records) == 1 else 448
    renderer.section(streak_y, "연속 운동 스트릭")
    renderer.text(MARGIN, streak_y - 30, f"{metrics['streak']}일", 20, NAVY, True)
    renderer.text(MARGIN + 38, streak_y - 26, "연속으로 운동하고 계세요", 8, SLATE, True)
    box_y = streak_y - 72
    weekday_width = (PAGE_WIDTH - MARGIN * 2 - 12) / 7
    current_week_start = date - datetime.timedelta(days=date.weekday())
    visited = {_session_date(s) for s in source["sessions"]}
    for index, weekday in enumerate(WEEKDAYS):
        x = MARGIN + index * (weekday_width + 2)
        day = current_week_start + datetime.timedelta(days=index)
        active = day in visited
        renderer.box(x, box_y, weekday_width, 34, GREEN_PALE if active else LIGHT, GREEN_BORDER if active else BORDER, 6)
        renderer.text(x + weekday_width / 2 - 3, box_y + 21, weekday, 7, GREEN if active else colors.HexColor("#ABB7C7"))
        if active:
            renderer.canvas.setStrokeColor(GREEN)
            renderer.canvas.setLineWidth(1.4)
            center_x = x + weekday_width / 2
            renderer.canvas.line(center_x - 4, box_y + 11, center_x - 1, box_y + 8)
            renderer.canvas.line(center_x - 1, box_y + 8, center_x + 5, box_y + 15)
        else:
            renderer.text(
                x + weekday_width / 2 - 2,
                box_y + 8,
                "-",
                8,
                colors.HexColor("#C6CED8"),
                True,
            )

    rank_y = box_y - 46
    renderer.box(MARGIN, rank_y, PAGE_WIDTH - MARGIN * 2, 36, BLUE_PALE, colors.HexColor("#A8C9FF"), 8)
    renderer.box(MARGIN + 11, rank_y + 8, 22, 22, BLUE, BLUE, 11)
    renderer.text(MARGIN + 14, rank_y + 15, "TOP", 6.5, colors.white, True)
    renderer.text(MARGIN + 42, rank_y + 21, f"전체 회원 {member_count}명 중 상위 {weekly_percent}% ({cohort['weekly_rank']}위)", 8.5, colors.HexColor("#174A9C"), True)
    renderer.text(MARGIN + 42, rank_y + 8, "이번 주 방문 빈도 기준으로 계산했어요.", 7, BLUE)

    goal_y = rank_y - 28
    renderer.section(goal_y, "이번 달 목표 진행률")
    renderer.text(MARGIN, goal_y - 23, "방문 횟수", 8, SLATE, True)
    renderer.right_text(PAGE_WIDTH - MARGIN, goal_y - 23, f"{metrics['month_visits']} / {monthly_visit_goal}회", 8, NAVY, True)
    renderer.progress(MARGIN, goal_y - 37, PAGE_WIDTH - MARGIN * 2, metrics["month_visits"] / monthly_visit_goal)
    renderer.text(MARGIN, goal_y - 57, "누적 볼륨", 8, SLATE, True)
    renderer.right_text(PAGE_WIDTH - MARGIN, goal_y - 57, f"{_number(metrics['month_volume'])} / {_number(monthly_volume_goal)}kg", 8, NAVY, True)
    renderer.progress(MARGIN, goal_y - 71, PAGE_WIDTH - MARGIN * 2, metrics["month_volume"] / monthly_volume_goal)

    volume_rank_y = goal_y - 112
    renderer.box(MARGIN, volume_rank_y, PAGE_WIDTH - MARGIN * 2, 36, BLUE_PALE, colors.HexColor("#A8C9FF"), 8)
    renderer.box(MARGIN + 11, volume_rank_y + 8, 22, 22, BLUE, BLUE, 11)
    renderer.text(MARGIN + 14, volume_rank_y + 15, "TOP", 6.5, colors.white, True)
    renderer.text(MARGIN + 42, volume_rank_y + 21, f"이번 달 누적 볼륨 상위 {volume_percent}% ({cohort['volume_rank']}위 / {member_count}명)", 8.3, colors.HexColor("#174A9C"), True)
    renderer.text(MARGIN + 42, volume_rank_y + 8, f"지난달보다 {improvement}%p 상승한 순위예요." if improvement else "같은 기간 전체 회원과 비교한 순위예요.", 7, BLUE)

    highlight_y = 44
    highlight_height = max(volume_rank_y - highlight_y - 10, 58)
    renderer.box(MARGIN, highlight_y, PAGE_WIDTH - MARGIN * 2, highlight_height, NAVY, NAVY, 12)
    renderer.text(MARGIN + 15, highlight_y + highlight_height - 20, "이주의 하이라이트", 8, colors.HexColor("#4DEB91"), True)
    renderer.wrapped(
        MARGIN + 15,
        highlight_y + highlight_height - 39,
        f"{name}님은 이번 달 {metrics['month_visits']}일 방문해 {_number(metrics['month_volume'])}kg의 볼륨을 쌓았어요. "
        f"최근 기록을 바탕으로 다음 운동 목표와 보완 부위를 정리했습니다.",
        PAGE_WIDTH - MARGIN * 2 - 30,
        7.5,
        11,
        colors.HexColor("#D7DFEA"),
        max_lines=2,
    )
    stat_width = (PAGE_WIDTH - MARGIN * 2 - 46) / 3
    stats = [
        (f"상위 {weekly_percent}%", "방문 빈도"),
        (f"상위 {volume_percent}%", "누적 볼륨"),
        (f"{metrics['streak']}일 연속", "운동 스트릭"),
    ]
    for index, (value, label) in enumerate(stats):
        x = MARGIN + 15 + index * (stat_width + 8)
        renderer.box(
            x,
            highlight_y + 12,
            stat_width,
            36,
            colors.HexColor("#1D273B"),
            colors.HexColor("#1D273B"),
            7,
        )
        value_x = x + stat_width / 2 - pdfmetrics.stringWidth(
            value, FONT_BOLD, 9
        ) / 2
        label_x = x + stat_width / 2 - pdfmetrics.stringWidth(
            label, FONT_REGULAR, 6.5
        ) / 2
        renderer.text(value_x, highlight_y + 33, value, 9, colors.HexColor("#4DEB91"), True)
        renderer.text(label_x, highlight_y + 20, label, 6.5, colors.HexColor("#AAB6C9"))


def _draw_page_two(renderer, source, metrics):
    date = source["reference_date"]
    recent_start = date - datetime.timedelta(days=27)
    renderer.new_page(2, date)
    renderer.text(MARGIN, 746, "최근 4주 밸런스와 회복 상태", 17, NAVY, True)
    renderer.text(MARGIN, 725, "하루가 아니라 최근 몇 주의 흐름으로 봐야 보이는 것들입니다.", 9, SLATE)
    renderer.box(MARGIN, 689, 140, 24, LIGHT, LIGHT, 12)
    renderer.text(MARGIN + 10, 697, f"집계 기간: {recent_start:%Y.%m.%d} - {date:%m.%d}", 8, SLATE, True)

    renderer.section(660, "최근 4주 부위별 운동 비중")
    shares = metrics["category_shares"]
    y = 633
    for category in CATEGORY_ORDER:
        label = CATEGORY_LABELS[category]
        share = shares[category]
        renderer.text(MARGIN, y, label, 8, SLATE, True)
        renderer.right_text(PAGE_WIDTH - MARGIN, y, f"{share}%", 8, NAVY, True)
        renderer.progress(MARGIN, y - 11, PAGE_WIDTH - MARGIN * 2, share / 100)
        y -= 31

    renderer.box(MARGIN, 420, PAGE_WIDTH - MARGIN * 2, 55, GREEN_PALE, GREEN_BORDER, 10)
    top_three = sorted(CATEGORY_ORDER, key=lambda item: shares[item], reverse=True)[:3]
    top_labels = "·".join(CATEGORY_LABELS[item] for item in top_three)
    top_share = sum(shares[item] for item in top_three)
    renderer.text(MARGIN + 12, 452, f"{top_labels} 중심으로 탄탄하게 채워가고 있어요.", 8.5, GREEN_DARK, True)
    renderer.wrapped(MARGIN + 12, 436, f"상위 3개 부위가 전체 비중의 {top_share}%를 차지해요. 비중이 낮은 부위를 다음 목표에 더하면 전신 밸런스를 고르게 만들 수 있어요.", PAGE_WIDTH - MARGIN * 2 - 24, 7.5, 11, GREEN_DARK, max_lines=2)

    renderer.section(394, "최근 4주 볼륨 추이")
    volumes = metrics["weekly_volumes"]
    max_volume = max(volumes) or 1
    chart_x = MARGIN + 18
    chart_width = PAGE_WIDTH - MARGIN * 2 - 36
    bar_width = 70
    gap = (chart_width - bar_width * 4) / 3
    for index, volume in enumerate(volumes):
        x = chart_x + index * (bar_width + gap)
        height = 45 * volume / max_volume
        renderer.canvas.setFillColor(GREEN if index < 3 else colors.HexColor("#0B4931"))
        renderer.canvas.roundRect(x, 326, bar_width, max(height, 2), 5, fill=1, stroke=0)
        renderer.text(x + bar_width / 2 - pdfmetrics.stringWidth(f"{_number(volume)}kg", FONT_BOLD, 7) / 2, 326 + max(height, 2) + 7, f"{_number(volume)}kg", 7, NAVY, True)
        label = f"{index + 1}주차" + ("(이번 주)" if index == 3 else "")
        renderer.text(x + bar_width / 2 - pdfmetrics.stringWidth(label, FONT_REGULAR, 7) / 2, 312, label, 7, colors.HexColor("#8B9AB0"))

    renderer.section(286, "부위별 회복 상태")
    card_width = (PAGE_WIDTH - MARGIN * 2 - 16) / 3
    for index, category in enumerate(CATEGORY_ORDER):
        row, column = divmod(index, 3)
        x = MARGIN + column * (card_width + 8)
        y = 220 - row * 62
        last_date = metrics["category_last_date"].get(category)
        days_ago = (date - last_date).days if last_date else None
        recovered = days_ago is None or days_ago >= 2
        fill = GREEN_PALE if recovered else AMBER_PALE
        stroke = GREEN_BORDER if recovered else colors.HexColor("#FFD269")
        renderer.box(x, y, card_width, 53, fill, stroke, 8)
        renderer.text(x + 9, y + 36, "회복 완료" if recovered else "회복 중", 7, GREEN_DARK if recovered else AMBER, True)
        renderer.text(x + 9, y + 22, CATEGORY_LABELS[category], 9, NAVY, True)
        status = "기록 없음 · 지금 가능" if days_ago is None else (f"{days_ago}일 전 · 지금 가능" if recovered else f"{days_ago}일 전 · 하루 더 회복")
        renderer.text(x + 9, y + 8, status, 6.8, SLATE)

    renderer.section(126, "컨디션 체크")
    renderer.box(MARGIN, 45, PAGE_WIDTH - MARGIN * 2, 65, GREEN_PALE, GREEN_BORDER, 10)
    renderer.box(MARGIN + 13, 72, 22, 22, GREEN, GREEN, 11)
    renderer.canvas.setStrokeColor(colors.white)
    renderer.canvas.setLineWidth(1.8)
    renderer.canvas.line(MARGIN + 19, 82, MARGIN + 23, 78)
    renderer.canvas.line(MARGIN + 23, 78, MARGIN + 29, 87)
    renderer.text(MARGIN + 44, 86, "몸 상태에 맞게 강도를 조절해보세요", 8.5, GREEN_DARK, True)
    renderer.wrapped(MARGIN + 44, 69, "최근 4주 운동 간격과 부위별 회복 상태를 함께 반영했어요. 회복 중인 부위는 가볍게, 회복이 끝난 부위는 다음 목표에 맞춰 강도를 올려보세요.", PAGE_WIDTH - MARGIN * 2 - 58, 7.2, 10.5, GREEN_DARK, max_lines=3)


def _draw_page_three(renderer, source, metrics):
    date = source["reference_date"]
    weekly_goal = max(int(os.environ.get("REPORT_WEEKLY_VISIT_GOAL", 4)), 1)
    renderer.new_page(3, date)
    renderer.text(MARGIN, 746, "다음 운동을 위한 맞춤 목표", 17, NAVY, True)
    renderer.text(MARGIN, 725, "오늘 기록을 기준으로 다음 세션에서 도전해볼 만한 지점입니다.", 9, SLATE)
    renderer.box(MARGIN, 689, 107, 24, LIGHT, LIGHT, 12)
    renderer.text(MARGIN + 10, 697, f"{date:%Y.%m.%d} ({WEEKDAYS[date.weekday()]}) 기준", 8, SLATE, True)

    renderer.section(660, "종목별 다음 목표")
    table_y = 477
    row_height = 43
    renderer.box(MARGIN, table_y, PAGE_WIDTH - MARGIN * 2, row_height * 4, colors.white, BORDER, 10)
    for index, target in enumerate(metrics["targets"][:4]):
        y = table_y + row_height * (3 - index)
        if index % 2:
            renderer.canvas.setFillColor(LIGHT)
            renderer.canvas.rect(MARGIN + 1, y, PAGE_WIDTH - MARGIN * 2 - 2, row_height, fill=1, stroke=0)
        if index:
            renderer.canvas.setStrokeColor(BORDER)
            renderer.canvas.line(MARGIN, y + row_height, PAGE_WIDTH - MARGIN, y + row_height)
        renderer.text(MARGIN + 12, y + 17, target["equipment"], 8.3, NAVY, True)
        renderer.text(MARGIN + 108, y + 17, target["current"], 7.5, SLATE)
        renderer.text(MARGIN + 245, y + 17, "→", 8, colors.HexColor("#9BA8B8"))
        renderer.text(MARGIN + 263, y + 17, target["target"], 8, NAVY, True)
        badge_width = pdfmetrics.stringWidth(target["badge"], FONT_BOLD, 7) + 16
        renderer.box(PAGE_WIDTH - MARGIN - badge_width - 10, y + 10, badge_width, 23, GREEN_PALE, GREEN_BORDER, 11)
        renderer.text(PAGE_WIDTH - MARGIN - badge_width - 2, y + 18, target["badge"], 7, GREEN_DARK, True)

    renderer.section(448, "이번 주 목표")
    renderer.box(MARGIN, 365, PAGE_WIDTH - MARGIN * 2, 65, LIGHT, BORDER, 10)
    renderer.text(MARGIN + 13, 408, "이번 주 방문 목표", 8, SLATE, True)
    renderer.right_text(PAGE_WIDTH - MARGIN - 13, 407, f"{metrics['week_visits']} / {weekly_goal}", 13, GREEN_DARK, True)
    renderer.progress(MARGIN + 13, 388, PAGE_WIDTH - MARGIN * 2 - 26, metrics["week_visits"] / weekly_goal)
    remaining = max(weekly_goal - metrics["week_visits"], 0)
    message = "이번 주 목표를 달성했어요. 다음 운동은 충분히 회복한 뒤 시작하세요." if not remaining else f"{remaining}회만 더 오시면 이번 주 목표를 달성해요."
    renderer.text(MARGIN + 13, 373, message, 7.5, SLATE)

    renderer.section(337, "보완이 필요한 부위 추천 운동")
    recommendation_width = (PAGE_WIDTH - MARGIN * 2 - 10) / 2
    for index, recommendation in enumerate(metrics["recommendations"]):
        x = MARGIN + index * (recommendation_width + 10)
        renderer.box(x, 250, recommendation_width, 70, LIGHT, BORDER, 10)
        renderer.text(x + 12, 301, recommendation["exercise"], 9, NAVY, True)
        renderer.text(x + 12, 286, recommendation["category"], 7, GREEN, True)
        renderer.wrapped(x + 12, 270, f"최근 4주 비중 {recommendation['share']}%. {recommendation['description']}", recommendation_width - 24, 7, 10, SLATE, max_lines=2)

    renderer.box(MARGIN, 132, PAGE_WIDTH - MARGIN * 2, 93, colors.HexColor("#0D2530"), colors.HexColor("#0D2530"), 12)
    renderer.text(MARGIN + 18, 199, '"', 22, colors.HexColor("#56E799"), True)
    renderer.text(MARGIN + 18, 176, "오늘의 땀 한 방울이 내일의 자신감이 됩니다.", 10, colors.white, True)
    renderer.text(MARGIN + 18, 157, "지금 이 페이스라면, 이번 달 목표도 거뜬해요.", 10, colors.white, True)
    renderer.text(MARGIN + 18, 141, f"- RepCast가 {source['user']['name']}님을 응원합니다", 7.5, colors.HexColor("#69EDA4"), True)

    renderer.section(105, "더 많은 운동 콘텐츠")
    renderer.box(MARGIN, 42, PAGE_WIDTH - MARGIN * 2, 50, LIGHT, BORDER, 10)
    qr = QrCodeWidget("https://youtube.com/@repcast_gym")
    bounds = qr.getBounds()
    drawing = Drawing(38, 38, transform=[38 / (bounds[2] - bounds[0]), 0, 0, 38 / (bounds[3] - bounds[1]), 0, 0])
    drawing.add(qr)
    renderPDF.draw(drawing, renderer.canvas, MARGIN + 10, 48)
    renderer.text(MARGIN + 58, 71, "헬스장 유튜브 채널", 8.5, NAVY, True)
    renderer.text(MARGIN + 58, 56, "QR 코드를 스캔하면 운동 팁과 자세 교정 영상을 볼 수 있어요.", 7, SLATE)


def generate_report_pdf(source):
    """Return a three-page RepCast workout report as PDF bytes."""
    metrics = _build_metrics(source)
    stream = io.BytesIO()
    renderer = _Renderer(stream)
    _draw_page_one(renderer, source, metrics)
    _draw_page_two(renderer, source, metrics)
    _draw_page_three(renderer, source, metrics)
    renderer.canvas.save()
    return stream.getvalue()
