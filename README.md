# Repcast

## ESP32 메인 모듈 설정

`arduino/main-module/main-module.ino` 상단의 아래 값을 실제 설치 환경에 맞게
변경한 뒤 ESP32에 업로드한다.

- `WIFI_SSID`, `WIFI_PASSWORD`: 장치가 사용할 2.4GHz Wi-Fi
- `GYM_ID`: 백엔드에 등록된 지점 키
- `EQUIPMENT_ID`: 백엔드에 등록된 기구 ID

카드를 태그하면 카드 데이터 블록의 UID로 `/user?uid=...`를 조회한다. 등록된
회원일 때만 `/session/start`로 세션을 만들고, 운동 종료 시 반환받은 `sid`와
누적 반복/세트 수 및 마지막으로 감지한 운동 무게를 `/session/finish`로
전송한다.

## 개인 운동 분석 리포트

회원 UID를 쿼리 파라미터로 전달하면 해당 회원의 최신 완료 운동일을 기준으로
3페이지 PDF 리포트를 내려준다.

```http
GET /report?uid=회원_UID
```

- 응답 형식: `application/pdf`
- 등록되지 않은 UID: `404`
- 월간 방문/볼륨 목표는 각각 `REPORT_MONTHLY_VISIT_GOAL`,
  `REPORT_MONTHLY_VOLUME_GOAL`, 주간 방문 목표는
  `REPORT_WEEKLY_VISIT_GOAL` 환경 변수로 조정할 수 있다.
- 서버에 한글 글꼴이 없다면 `REPORT_FONT_PATH`와
  `REPORT_BOLD_FONT_PATH`에 TTF 파일 경로를 지정할 수 있다.

### 리포트 이메일 발송

DB에 등록된 회원 이메일로 개인화된 PDF를 첨부해 발송한다. 요청에서 별도의
수신 주소는 받지 않는다.

```http
POST /report/email
Content-Type: application/json

{
  "uid": "회원_UID"
}
```

성공하면 다음과 같이 마스킹된 수신 주소를 반환한다.

```json
{
  "status": "sent",
  "uid": "회원_UID",
  "recipient": "me***@example.com"
}
```

Gmail 설정은 [`.env.example`](.env.example)의 `GMAIL_*` 항목을 참고한다.
Google 계정의 2단계 인증을 켠 뒤 발급한 16자리 앱 비밀번호를
`GMAIL_APP_PASSWORD`에 설정한다. 서버는 `smtp.gmail.com:465` SSL 연결을
사용한다. Gmail 설정 누락은 `503`, 발송 실패는 `502`, 회원 이메일 누락 또는
잘못된 주소는 `422`로 응답한다.

회원 관리 화면의 **모든 회원 기록지 보내기** 버튼은 아래 API를 호출한다.
한 번의 Gmail 연결을 재사용하면서 DB의 모든 회원에게 각자의 PDF를 발송한다.

```http
POST /report/email/all
```

응답에는 전체·성공·실패 건수와 UID별 실패 사유가 포함된다.

```json
{
  "status": "partial",
  "total": 3,
  "sent": 2,
  "failed": 1,
  "failures": [
    {
      "uid": "회원_UID",
      "reason": "등록된 이메일 주소가 없습니다."
    }
  ]
}
```

### 시리얼 진단

Arduino IDE의 시리얼 모니터를 `115200 baud`로 연다. 카드 태그 시 `[CARD]`,
`[USER]`, `[WIFI]`, `[HTTP]`, `[SESSION]` 순서로 진단 로그가 출력된다.

- `[HTTP] status=200`: API 요청 성공
- `[HTTP] status=4xx/5xx`: 이어지는 `error response`에서 서버 오류 확인
- `[HTTP] status`가 음수: 이어지는 `transport error`에서 DNS/TLS/연결 오류 확인
- `[USER] result=NOT_FOUND`: 서버에 등록되지 않은 UID
