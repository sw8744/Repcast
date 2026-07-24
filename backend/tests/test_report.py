import datetime
import io
import unittest
from unittest.mock import MagicMock, patch

from pypdf import PdfReader

from util.report import _build_metrics, _register_fonts, generate_report_pdf


def sample_source():
    reference_date = datetime.date(2026, 7, 23)

    def session(day, equipment, category, weight, count=10, sets=3):
        start = datetime.datetime.combine(day, datetime.time(18, 0))
        return {
            "sid": f"{day}-{equipment}",
            "equipment_name": equipment,
            "category": category,
            "count": count,
            "sets": sets,
            "start": start,
            "finish": start + datetime.timedelta(minutes=35),
            "weight": weight,
        }

    sessions = [
        session(datetime.date(2026, 7, 1), "랫 풀다운", "upper-back", 35),
        session(datetime.date(2026, 7, 21), "레그 프레스", "lower", 80),
        session(datetime.date(2026, 7, 22), "체스트 프레스", "upper-chest", 40),
        session(reference_date, "랫 풀다운", "upper-back", 40, 11, 4),
        session(reference_date, "레그 프레스", "lower", 90, 12, 4),
    ]
    return {
        "user": {
            "uid": "member-1",
            "name": "김민준",
            "email": "minjun@example.com",
            "join_date": datetime.datetime(2026, 1, 1),
            "expire_date": datetime.datetime(2026, 12, 31),
        },
        "sessions": sessions,
        "cohort": {
            "member_count": 100,
            "weekly_visits": 3,
            "weekly_rank": 8,
            "monthly_volume": sum(
                item["count"] * item["sets"] * item["weight"] for item in sessions
            ),
            "volume_rank": 15,
            "previous_volume": 1000,
            "previous_volume_rank": 20,
        },
        "reference_date": reference_date,
        "days_in_month": 31,
    }


class ReportTest(unittest.TestCase):
    def test_font_fallback_reuses_available_korean_cid_font(self):
        def cid_font(name):
            if name == "HYGothic-Medium":
                raise KeyError(name)
            return MagicMock()

        with patch("util.report.os.path.isfile", return_value=False), patch(
            "util.report.UnicodeCIDFont", side_effect=cid_font
        ), patch("util.report.pdfmetrics.registerFont"):
            regular, bold = _register_fonts()

        self.assertEqual(regular, "HYSMyeongJo-Medium")
        self.assertEqual(bold, "HYSMyeongJo-Medium")

    def test_metrics_are_personalized_from_sessions(self):
        metrics = _build_metrics(sample_source())

        self.assertEqual(metrics["streak"], 3)
        self.assertEqual(metrics["day_equipment_count"], 2)
        self.assertEqual(metrics["day_sets"], 8)
        self.assertGreater(metrics["day_volume"], 0)
        self.assertTrue(metrics["records"])

    def test_generated_report_is_three_page_pdf(self):
        report = generate_report_pdf(sample_source())

        self.assertTrue(report.startswith(b"%PDF"))
        reader = PdfReader(io.BytesIO(report))
        self.assertEqual(len(reader.pages), 3)
        self.assertIn("김민준", reader.pages[0].extract_text())


if __name__ == "__main__":
    unittest.main()
