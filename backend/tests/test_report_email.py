import datetime
import os
import unittest
from unittest.mock import MagicMock, patch

from util.report_email import (
    EmailConfigurationError,
    GmailReportSender,
    InvalidRecipientError,
    mask_email,
    send_report_email,
)


class ReportEmailTest(unittest.TestCase):
    def test_sends_pdf_attachment_with_gmail_ssl(self):
        smtp = MagicMock()
        smtp_ssl = MagicMock(return_value=smtp)
        environment = {
            "GMAIL_EMAIL": "reports@gmail.com",
            "GMAIL_APP_PASSWORD": "abcd efgh ijkl mnop",
            "GMAIL_FROM_NAME": "RepCast",
        }

        with patch.dict(os.environ, environment, clear=True), patch(
            "util.report_email.smtplib.SMTP_SSL", smtp_ssl
        ):
            recipient = send_report_email(
                recipient="member@example.com",
                member_name="김민준",
                report_pdf=b"%PDF-test",
                reference_date=datetime.date(2026, 7, 23),
            )

        self.assertEqual(recipient, "member@example.com")
        smtp_ssl.assert_called_once()
        self.assertEqual(smtp_ssl.call_args.args[:2], ("smtp.gmail.com", 465))
        smtp.login.assert_called_once_with(
            "reports@gmail.com", "abcdefghijklmnop"
        )
        smtp.send_message.assert_called_once()
        smtp.quit.assert_called_once()
        message = smtp.send_message.call_args.args[0]
        attachments = list(message.iter_attachments())
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0].get_content_type(), "application/pdf")
        self.assertEqual(attachments[0].get_payload(decode=True), b"%PDF-test")

    def test_missing_gmail_credentials_is_configuration_error(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(EmailConfigurationError):
                send_report_email(
                    recipient="member@example.com",
                    member_name="김민준",
                    report_pdf=b"%PDF-test",
                    reference_date=datetime.date(2026, 7, 23),
                )

    def test_reuses_one_gmail_connection_for_multiple_members(self):
        smtp = MagicMock()
        smtp_ssl = MagicMock(return_value=smtp)
        environment = {
            "GMAIL_EMAIL": "reports@gmail.com",
            "GMAIL_APP_PASSWORD": "abcdefghijklmnop",
        }

        with patch.dict(os.environ, environment, clear=True), patch(
            "util.report_email.smtplib.SMTP_SSL", smtp_ssl
        ):
            with GmailReportSender() as sender:
                sender.send(
                    "first@example.com",
                    "첫 번째",
                    b"%PDF-first",
                    datetime.date(2026, 7, 23),
                )
                sender.send(
                    "second@example.com",
                    "두 번째",
                    b"%PDF-second",
                    datetime.date(2026, 7, 23),
                )

        smtp_ssl.assert_called_once()
        smtp.login.assert_called_once()
        self.assertEqual(smtp.send_message.call_count, 2)

    def test_invalid_recipient_is_rejected(self):
        environment = {
            "GMAIL_EMAIL": "reports@gmail.com",
            "GMAIL_APP_PASSWORD": "abcdefghijklmnop",
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(InvalidRecipientError):
                send_report_email(
                    recipient="not-an-email",
                    member_name="김민준",
                    report_pdf=b"%PDF-test",
                    reference_date=datetime.date(2026, 7, 23),
                )

    def test_masks_recipient_in_api_response(self):
        self.assertEqual(mask_email("member@example.com"), "me***@example.com")


if __name__ == "__main__":
    unittest.main()
