import os
import smtplib
import ssl
from html import escape
from email.message import EmailMessage
from email.utils import formataddr, parseaddr


class EmailConfigurationError(RuntimeError):
    pass


class EmailDeliveryError(RuntimeError):
    pass


class InvalidRecipientError(ValueError):
    pass


def _gmail_settings():
    email = (
        os.environ.get("GMAIL_EMAIL")
        or os.environ.get("SMTP_USERNAME")
        or ""
    ).strip()
    app_password = (
        os.environ.get("GMAIL_APP_PASSWORD")
        or os.environ.get("SMTP_PASSWORD")
        or ""
    ).replace(" ", "")

    if not email:
        raise EmailConfigurationError(
            "GMAIL_EMAIL 환경 변수가 필요합니다."
        )
    if not app_password:
        raise EmailConfigurationError(
            "GMAIL_APP_PASSWORD 환경 변수가 필요합니다."
        )

    from_display_name, from_address = parseaddr(email)
    if (
        from_display_name
        or from_address != email
        or "@" not in from_address
        or from_address.startswith("@")
        or from_address.endswith("@")
    ):
        raise EmailConfigurationError("GMAIL_EMAIL 주소가 올바르지 않습니다.")

    try:
        timeout = float(os.environ.get("GMAIL_TIMEOUT_SECONDS", "20"))
    except ValueError as error:
        raise EmailConfigurationError(
            "GMAIL_TIMEOUT_SECONDS는 숫자여야 합니다."
        ) from error

    return {
        "email": from_address,
        "app_password": app_password,
        "from_name": os.environ.get("GMAIL_FROM_NAME", "RepCast"),
        "timeout": timeout,
    }


def _validate_email(value):
    display_name, address = parseaddr((value or "").strip())
    if (
        display_name
        or address != (value or "").strip()
        or not address
        or "@" not in address
        or address.startswith("@")
        or address.endswith("@")
        or "\r" in address
        or "\n" in address
    ):
        raise InvalidRecipientError("회원 이메일 주소가 올바르지 않습니다.")
    return address


def _build_report_message(
    settings, recipient, member_name, report_pdf, reference_date
):
    recipient = _validate_email(recipient)
    member_name = "".join(
        character
        for character in str(member_name or "")
        if character not in {'"', "'", "/", "\\", "\r", "\n"}
    ).strip() or "회원"
    html_member_name = escape(member_name)
    filename = f"RepCast_{member_name}_운동_분석_리포트.pdf"

    message = EmailMessage()
    message["Subject"] = f"[RepCast] {member_name}님의 운동 분석 리포트"
    message["From"] = formataddr(
        (settings["from_name"], settings["email"])
    )
    message["To"] = recipient
    message.set_content(
        f"""{member_name}님, 안녕하세요.

{reference_date:%Y.%m.%d} 기준 개인 운동 분석 리포트를 보내드립니다.
첨부된 PDF에서 최근 운동 기록과 다음 운동 목표를 확인해보세요.

RepCast 드림
"""
    )
    message.add_alternative(
        f"""\
<html>
  <body style="font-family: sans-serif; color: #10182b;">
    <h2 style="color: #18b85b;">RepCast 운동 분석 리포트</h2>
    <p>{html_member_name}님, 안녕하세요.</p>
    <p><strong>{reference_date:%Y.%m.%d}</strong> 기준 개인 운동 분석 리포트를
    보내드립니다.</p>
    <p>첨부된 PDF에서 최근 운동 기록과 다음 운동 목표를 확인해보세요.</p>
    <p>RepCast 드림</p>
  </body>
</html>
""",
        subtype="html",
    )
    message.add_attachment(
        report_pdf,
        maintype="application",
        subtype="pdf",
        filename=filename,
    )
    return message, recipient


class GmailReportSender:
    """Reuse one authenticated Gmail SSL connection for report delivery."""

    def __init__(self):
        self.settings = _gmail_settings()
        self.smtp = None

    def __enter__(self):
        try:
            self.smtp = smtplib.SMTP_SSL(
                "smtp.gmail.com",
                465,
                timeout=self.settings["timeout"],
                context=ssl.create_default_context(),
            )
            self.smtp.login(
                self.settings["email"],
                self.settings["app_password"],
            )
        except (OSError, smtplib.SMTPException) as error:
            if self.smtp is not None:
                try:
                    self.smtp.close()
                except OSError:
                    pass
            raise EmailDeliveryError(
                "Gmail 로그인 또는 연결에 실패했습니다."
            ) from error
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if self.smtp is not None:
            try:
                self.smtp.quit()
            except (OSError, smtplib.SMTPException):
                self.smtp.close()
        self.smtp = None

    def send(self, recipient, member_name, report_pdf, reference_date):
        if self.smtp is None:
            raise EmailDeliveryError("Gmail 연결이 열려 있지 않습니다.")
        message, normalized_recipient = _build_report_message(
            self.settings,
            recipient,
            member_name,
            report_pdf,
            reference_date,
        )
        try:
            self.smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as error:
            raise EmailDeliveryError(
                "Gmail이 이메일 발송을 완료하지 못했습니다."
            ) from error
        return normalized_recipient


def send_report_email(recipient, member_name, report_pdf, reference_date):
    """Send one personalized PDF using a Gmail app password."""
    _validate_email(recipient)
    with GmailReportSender() as sender:
        return sender.send(
            recipient,
            member_name,
            report_pdf,
            reference_date,
        )


def mask_email(value):
    local, separator, domain = value.partition("@")
    if not separator:
        return "***"
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}***@{domain}"
