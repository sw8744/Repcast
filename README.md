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

### 시리얼 진단

Arduino IDE의 시리얼 모니터를 `115200 baud`로 연다. 카드 태그 시 `[CARD]`,
`[USER]`, `[WIFI]`, `[HTTP]`, `[SESSION]` 순서로 진단 로그가 출력된다.

- `[HTTP] status=200`: API 요청 성공
- `[HTTP] status=4xx/5xx`: 이어지는 `error response`에서 서버 오류 확인
- `[HTTP] status`가 음수: 이어지는 `transport error`에서 DNS/TLS/연결 오류 확인
- `[USER] result=NOT_FOUND`: 서버에 등록되지 않은 UID
