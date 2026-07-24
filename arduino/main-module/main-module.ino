#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_netif.h>

//================================================
// 네트워크 / 장치 설정
//================================================
// 업로드 전에 실제 Wi-Fi 정보와 이 장치가 설치된 지점/기구 ID로 변경
const char *WIFI_SSID = "Seungwon Lee";
const char *WIFI_PASSWORD = "sw8744!!";
const char *API_BASE_URL = "https://api.repcast.site";
const char *GYM_ID = "f696282aa4cd4f614aa995190cf442fe";
const char *EQUIPMENT_ID = "db1a6654814f620bfc877e23fe4629f7";
const IPAddress PRIMARY_DNS(1, 1, 1, 1);
const IPAddress SECONDARY_DNS(8, 8, 8, 8);

const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
unsigned long lastWiFiRetryTime = 0;
bool lastDisplayedWiFiConnected = false;

enum UserLookupResult
{
    USER_LOOKUP_VALID,
    USER_LOOKUP_NOT_FOUND,
    USER_LOOKUP_API_ERROR
};

//================================================
// 핀 설정
//================================================
#define SPI_SCK     18
#define SPI_MISO    19
#define SPI_MOSI    23

// HC-SR04 초음파 센서
// TRIG: ESP32 출력, ECHO: ESP32 입력
#define ULTRASONIC_TRIG 21
#define ULTRASONIC_ECHO 22

#define TFT_CS      15
#define TFT_DC       2
#define TFT_RST      4

#define TOUCH_CS    33

#define RFID_CS      5
#define RFID_RST    27

#define HALL1       32
#define HALL2       25
#define HALL3       26

#define TFT_BL      14   // TFT LED/BL 연결 핀: 항상 HIGH 유지
#define BUZZER_PIN  13   // Passive piezo buzzer: SIG
#define LED_PIN     16   // LED module: S or SIG (active HIGH)
#define LED_ON      HIGH
#define LED_OFF     LOW

// Digital Push Button Module V2.0: 눌렀을 때 HIGH
#define ACTION_BUTTON_PIN 17   // S04: REST, S05: NEXT
#define END_BUTTON_PIN    34   // S05: END
#define BUTTON_PRESSED    HIGH

const byte RFID_DATA_BLOCK = 4;
const byte RFID_BLOCK_SIZE = 16;

//================================================
// 객체
//================================================
Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
XPT2046_Touchscreen ts(TOUCH_CS);
MFRC522 rfid(RFID_CS, RFID_RST);
Preferences prefs;

//================================================
// 화면 상태
//================================================
enum ScreenState
{
    S01_TAPCARD,
    S02_HELLO,
    S03_WEIGHT,
    S04_ACTIVE,
    S05_REST,
    S06_SAVE_SUMMARY
};

ScreenState screen = S01_TAPCARD;

//================================================
// 버튼 영역: 그리는 위치와 터치 판정을 같은 값으로 사용
//================================================
struct ButtonRect
{
    int16_t x;
    int16_t y;
    int16_t w;
    int16_t h;
};

const ButtonRect BTN_REST = {35, 165, 250, 65};
const ButtonRect BTN_NEXT = {10, 165, 145, 65};
const ButtonRect BTN_END  = {165, 165, 145, 65};

//================================================
// 회원 정보
//================================================
String currentUser = "";
String currentUID  = "";
String currentSessionId = "";

//================================================
// 운동 정보
//================================================
int weight    = 0;
int oldWeight = -1;
int repCount  = 0;
int setNum    = 1;

// 현재 회원의 운동 집계
int memberWorkoutWeightKg = 0;  // Hall 센서가 마지막으로 감지한 운동 무게
int memberTotalReps = 0;        // 현재 회원의 전체 반복 횟수
int memberTotalSets = 0;        // 현재 회원이 완료한 전체 세트 수
long memberTotalVolumeKg = 0;   // 각 반복의 무게를 모두 더한 총 운동량

#define MAX_WEIGHTS 3
#define MAX_SETS    20

int repHistory[MAX_WEIGHTS][MAX_SETS];
int weightUsed[MAX_WEIGHTS];

//================================================
// 초음파 센서 상태
//================================================
enum UltrasonicState
{
    ULTRASONIC_READING,
    ULTRASONIC_READY,
    ULTRASONIC_TIMEOUT
};

UltrasonicState ultrasonicState = ULTRASONIC_READING;
bool lifted = false;

int ultrasonicDistanceMm = -1;
const int NEAR_DISTANCE_MM = 240;   // 240mm 이하: 가까움
const int FAR_DISTANCE_MM = 300;    // 300mm 이상: 멀어짐
const int MOVE_CONFIRM_COUNT = 2;
const int RETURN_CONFIRM_COUNT = 2;

int moveConfirmCount = 0;
int returnConfirmCount = 0;
int ultrasonicErrorCount = 0;

unsigned long lastUltrasonicReadTime = 0;
// HC-SR04는 측정 간격을 약 60ms 이상 두는 것이 안정적
const unsigned long ULTRASONIC_READ_INTERVAL_MS = 65;

// pulseIn 최대 대기 시간: 25000us ≒ 약 4.3m
const unsigned long ULTRASONIC_ECHO_TIMEOUT_US = 25000;

unsigned long lastUltrasonicPrintTime = 0;
const unsigned long ULTRASONIC_PRINT_INTERVAL_MS = 200;

//================================================
// S03 -> S04 지연
//================================================
bool waitingS04 = false;
unsigned long weightTime = 0;

//================================================
// S06 -> S01 지연
//================================================
unsigned long summaryStartTime = 0;
const unsigned long SUMMARY_DISPLAY_MS = 5000;

//================================================
// 물리 버튼 상태
//================================================
const unsigned long BUTTON_DEBOUNCE_MS = 50;
bool actionButtonRawState = false;
bool actionButtonStableState = false;
bool endButtonRawState = false;
bool endButtonStableState = false;
unsigned long actionButtonChangedTime = 0;
unsigned long endButtonChangedTime = 0;

//================================================
// 터치 상태
//================================================
const int TOUCH_PRESSURE_MIN = 150;
const unsigned long TOUCH_DEBOUNCE_MS = 250;

unsigned long lastTouchTime = 0;
bool touchLocked = false;

// 터치 보정값
bool touchCalibrated = false;
bool screenXUsesRawX = true;
int rawLeft   = 300;
int rawRight  = 3800;
int rawTop    = 300;
int rawBottom = 3800;

//================================================
// 함수 선언
//================================================
void releaseSPI();
void keepBacklightOn();

bool connectWiFi(unsigned long timeoutMs);
void maintainWiFi();
bool configureWiFiDns();
const char *wifiStatusName(wl_status_t status);
void printWiFiDiagnostics();
UserLookupResult getUserByUid(const String &uid, String &userName);
bool startRemoteSession(const String &uid, String &sid);
bool finishRemoteSession();
bool sendApiRequest(const String &method, const String &url,
                    const String &requestBody, String &responseBody);
bool getJsonString(const String &json, const String &key,
                   int searchFrom, String &value);
String urlEncode(const String &value);
bool isValidStoredUid(const String &uid);

void initUltrasonicSensor();
bool readUltrasonicDistance(int &distanceMm);
void resetRepDetector();

void readRFID();
bool readCardUid(String &cardUid);
void checkHall();
void checkWeightDelay();
void checkRep();
void checkPhysicalButtons();
void checkSummaryDelay();

int weightToIndex(int w);
void resetSession();
void commitSetRep();

void setWorkoutLed(bool enabled);
void beep();
void playCardAlert();
void playInvalidCardAlert();
void playStartAlert();
void playRestAlert();
void playEndAlert();

void drawTapCard();
void drawHello(const String &name);
void drawWeightReady(const String &name, int selectedWeight);
void drawActiveSet(int selectedWeight, int reps, int currentSet);
void drawRestScreen(int completedSet);
void drawSummaryScreen(int totalSets, int totalReps, long totalVolumeKg,
                       bool saved);
void drawStatusMessage(const char *title, const char *message,
                       uint16_t color);
void drawButton(const ButtonRect &button, const char *label);

bool readRawTouchAverage(int &rawX, int &rawY, int &pressure);
bool getTouch(int &screenX, int &screenY);
bool isInsideButton(int x, int y, const ButtonRect &button);
void waitUntilTouchReleased();

void loadTouchCalibration();
void saveTouchCalibration();
void calibrateTouch();
void captureCalibrationPoint(int targetX, int targetY, int &rawX, int &rawY);
void drawCalibrationTarget(int targetX, int targetY, const char *message);
long mapTouchAxis(long value, long inputA, long inputB,
                  long outputA, long outputB);

//================================================
// SPI 버스 공유 안정화
//================================================
void releaseSPI()
{
    digitalWrite(TFT_CS, HIGH);
    digitalWrite(TOUCH_CS, HIGH);
    digitalWrite(RFID_CS, HIGH);
}

// TFT 백라이트가 중간에 꺼지지 않도록 항상 HIGH 유지
void keepBacklightOn()
{
    digitalWrite(TFT_BL, HIGH);
}

const char *wifiStatusName(wl_status_t status)
{
    switch (status)
    {
        case WL_IDLE_STATUS:     return "IDLE";
        case WL_NO_SSID_AVAIL:   return "SSID_NOT_FOUND";
        case WL_SCAN_COMPLETED:  return "SCAN_COMPLETED";
        case WL_CONNECTED:       return "CONNECTED";
        case WL_CONNECT_FAILED:  return "CONNECT_FAILED";
        case WL_CONNECTION_LOST: return "CONNECTION_LOST";
        case WL_DISCONNECTED:    return "DISCONNECTED";
        default:                 return "UNKNOWN";
    }
}

bool configureWiFiDns()
{
    // DHCP가 끝난 뒤 ESP-NETIF의 런타임 DNS 값을 직접 덮어쓴다.
    esp_netif_t *station = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");

    if (station == nullptr)
    {
        Serial.println("[WIFI] runtime DNS config=FAILED (STA netif missing)");
        return false;
    }

    esp_netif_dns_info_t primaryInfo = {};
    primaryInfo.ip.type = IPADDR_TYPE_V4;
    primaryInfo.ip.u_addr.ip4.addr = ESP_IP4TOADDR(1, 1, 1, 1);

    esp_netif_dns_info_t secondaryInfo = {};
    secondaryInfo.ip.type = IPADDR_TYPE_V4;
    secondaryInfo.ip.u_addr.ip4.addr = ESP_IP4TOADDR(8, 8, 8, 8);

    esp_err_t primaryResult = esp_netif_set_dns_info(
        station,
        ESP_NETIF_DNS_MAIN,
        &primaryInfo
    );
    esp_err_t secondaryResult = esp_netif_set_dns_info(
        station,
        ESP_NETIF_DNS_BACKUP,
        &secondaryInfo
    );
    bool configured =
        primaryResult == ESP_OK && secondaryResult == ESP_OK;

    Serial.print("[WIFI] runtime DNS config=");
    Serial.println(configured ? "OK" : "FAILED");
    Serial.print("[WIFI] primary result=");
    Serial.println(static_cast<int>(primaryResult));
    Serial.print("[WIFI] secondary result=");
    Serial.println(static_cast<int>(secondaryResult));
    Serial.print("[WIFI] primary DNS=");
    Serial.println(PRIMARY_DNS);
    Serial.print("[WIFI] secondary DNS=");
    Serial.println(SECONDARY_DNS);
    return configured;
}

void printWiFiDiagnostics()
{
    wl_status_t status = WiFi.status();

    Serial.println("[WIFI] ----------");
    Serial.print("[WIFI] status=");
    Serial.print(wifiStatusName(status));
    Serial.print(" (");
    Serial.print(static_cast<int>(status));
    Serial.println(")");
    Serial.print("[WIFI] ssid=");
    Serial.println(WiFi.SSID());

    if (status != WL_CONNECTED)
        return;

    Serial.print("[WIFI] ip=");
    Serial.println(WiFi.localIP());
    Serial.print("[WIFI] gateway=");
    Serial.println(WiFi.gatewayIP());
    Serial.print("[WIFI] dns=");
    Serial.println(WiFi.dnsIP());
    Serial.print("[WIFI] rssi=");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    IPAddress apiIp;
    int dnsResult = WiFi.hostByName("api.repcast.site", apiIp);
    Serial.print("[WIFI] api.repcast.site DNS=");

    if (dnsResult == 1)
        Serial.println(apiIp);
    else
        Serial.println("FAILED");
}

bool connectWiFi(unsigned long timeoutMs)
{
    if (WiFi.status() == WL_CONNECTED)
    {
        configureWiFiDns();
        IPAddress resolvedIp;

        if (WiFi.hostByName("api.repcast.site", resolvedIp) == 1)
        {
            Serial.print("[WIFI] DNS resolved after runtime override: ");
            Serial.println(resolvedIp);
            return true;
        }

        Serial.println("[WIFI] DNS failed after runtime override");
        return false;
    }

    Serial.print("[WIFI] connecting to ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastWiFiRetryTime = millis();

    unsigned long startedAt = millis();

    while (WiFi.status() != WL_CONNECTED &&
           millis() - startedAt < timeoutMs)
    {
        keepBacklightOn();
        delay(250);
    }

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("[WIFI] connection failed");
        printWiFiDiagnostics();
        return false;
    }

    Serial.println("[WIFI] connection established");
    configureWiFiDns();
    printWiFiDiagnostics();

    IPAddress resolvedIp;

    if (WiFi.hostByName("api.repcast.site", resolvedIp) != 1)
    {
        Serial.println("[WIFI] DNS resolution still failed after runtime override");
        return false;
    }

    return true;
}

void maintainWiFi()
{
    bool connected = WiFi.status() == WL_CONNECTED;

    if (!connected &&
        millis() - lastWiFiRetryTime >= WIFI_RETRY_INTERVAL_MS)
    {
        Serial.println("[WIFI] background reconnect");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        lastWiFiRetryTime = millis();
    }

    connected = WiFi.status() == WL_CONNECTED;

    if (screen == S01_TAPCARD &&
        connected != lastDisplayedWiFiConnected)
    {
        lastDisplayedWiFiConnected = connected;
        drawTapCard();
    }
}

bool sendApiRequest(const String &method, const String &url,
                    const String &requestBody, String &responseBody)
{
    responseBody = "";

    Serial.println();
    Serial.println("========== API REQUEST ==========");
    Serial.print("[API] method=");
    Serial.println(method);
    Serial.print("[API] url=");
    Serial.println(url);

    if (requestBody.length() > 0)
    {
        Serial.print("[API] request body=");
        Serial.println(requestBody);
    }

    printWiFiDiagnostics();

    if (!connectWiFi(WIFI_CONNECT_TIMEOUT_MS))
    {
        Serial.println("[API] aborted: WiFi is not connected");
        Serial.println("=================================");
        return false;
    }

    WiFiClientSecure client;
    // ESP32의 CA 저장소를 별도로 관리하지 않는 구성이다. HTTPS 암호화는
    // 사용하지만 운영 장치에서는 API 인증서의 루트 CA 등록을 권장한다.
    client.setInsecure();

    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(8000);

    if (!http.begin(client, url))
    {
        Serial.println("[HTTP] begin failed");
        Serial.println("=================================");
        return false;
    }

    int statusCode = -1;

    if (method == "GET")
    {
        statusCode = http.GET();
    }
    else
    {
        http.addHeader("Content-Type", "application/json");
        statusCode = http.POST(requestBody);
    }

    if (statusCode > 0)
        responseBody = http.getString();

    Serial.print("[HTTP] status=");
    Serial.println(statusCode);
    Serial.print("[HTTP] response bytes=");
    Serial.println(responseBody.length());

    if (statusCode <= 0)
    {
        Serial.print("[HTTP] transport error=");
        Serial.println(HTTPClient::errorToString(statusCode));
        Serial.println("[HTTP] check DNS/TLS signal above");
    }
    else if (statusCode < 200 || statusCode >= 300)
    {
        Serial.print("[HTTP] error response=");

        if (responseBody.length() > 0)
            Serial.println(responseBody);
        else
            Serial.println("(empty)");
    }
    else
    {
        Serial.println("[HTTP] request succeeded");

        // 회원 조회 성공 응답에는 전화번호/이메일이 포함되므로 전체를
        // 출력하지 않는다. 세션 응답은 진단에 필요한 sid/status만 포함한다.
        if (url.indexOf("/session/") >= 0)
        {
            Serial.print("[HTTP] session response=");
            Serial.println(responseBody);
        }
    }

    http.end();
    Serial.println("=================================");
    return statusCode >= 200 && statusCode < 300;
}

String urlEncode(const String &value)
{
    const char hex[] = "0123456789ABCDEF";
    String encoded = "";

    for (unsigned int i = 0; i < value.length(); i++)
    {
        unsigned char c = static_cast<unsigned char>(value.charAt(i));

        if ((c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') ||
            c == '-' || c == '_' || c == '.' || c == '~')
        {
            encoded += static_cast<char>(c);
        }
        else
        {
            encoded += '%';
            encoded += hex[(c >> 4) & 0x0F];
            encoded += hex[c & 0x0F];
        }
    }

    return encoded;
}

bool isValidStoredUid(const String &uid)
{
    if (uid.length() != RFID_BLOCK_SIZE)
        return false;

    for (unsigned int i = 0; i < uid.length(); i++)
    {
        char c = uid.charAt(i);

        if (!((c >= '0' && c <= '9') ||
              (c >= 'a' && c <= 'f')))
        {
            return false;
        }
    }

    return true;
}

bool getJsonString(const String &json, const String &key,
                   int searchFrom, String &value)
{
    String marker = String("\"") + key + "\"";
    int keyPosition = json.indexOf(marker, searchFrom);

    if (keyPosition < 0)
        return false;

    int colonPosition = json.indexOf(':', keyPosition + marker.length());

    if (colonPosition < 0)
        return false;

    int quoteStart = json.indexOf('"', colonPosition + 1);

    if (quoteStart < 0)
        return false;

    value = "";
    bool escaped = false;

    for (int i = quoteStart + 1; i < static_cast<int>(json.length()); i++)
    {
        char c = json.charAt(i);

        if (escaped)
        {
            // API의 회원명에 일반적으로 필요한 JSON escape를 복원한다.
            if (c == 'n')
                value += '\n';
            else if (c == 'r')
                value += '\r';
            else if (c == 't')
                value += '\t';
            else
                value += c;

            escaped = false;
            continue;
        }

        if (c == '\\')
        {
            escaped = true;
            continue;
        }

        if (c == '"')
            return true;

        value += c;
    }

    value = "";
    return false;
}

UserLookupResult getUserByUid(const String &uid, String &userName)
{
    Serial.println();
    Serial.println("========== USER LOOKUP ==========");
    Serial.print("[USER] card uid=");
    Serial.println(uid);

    String responseBody;
    String url = String(API_BASE_URL) + "/user?uid=" + urlEncode(uid);

    if (!sendApiRequest("GET", url, "", responseBody))
    {
        Serial.println("[USER] result=API_ERROR");
        return USER_LOOKUP_API_ERROR;
    }

    int usersPosition = responseBody.indexOf("\"users\"");
    int arrayStart = responseBody.indexOf('[', usersPosition);
    int arrayEnd = responseBody.indexOf(']', arrayStart);

    if (usersPosition < 0 || arrayStart < 0 || arrayEnd < 0)
    {
        Serial.println("[USER] result=RESPONSE_FORMAT_ERROR");
        return USER_LOOKUP_API_ERROR;
    }

    String usersContent = responseBody.substring(arrayStart + 1, arrayEnd);
    usersContent.trim();

    if (usersContent.length() == 0)
    {
        Serial.println("[USER] result=NOT_FOUND");
        return USER_LOOKUP_NOT_FOUND;
    }

    String returnedUid;

    if (!getJsonString(responseBody, "uid", arrayStart, returnedUid))
    {
        Serial.println("[USER] result=UID_MISSING_IN_RESPONSE");
        return USER_LOOKUP_API_ERROR;
    }

    returnedUid.trim();
    returnedUid.toLowerCase();

    if (returnedUid != uid)
    {
        Serial.print("[USER] result=UID_MISMATCH, returned=");
        Serial.println(returnedUid);
        return USER_LOOKUP_API_ERROR;
    }

    if (!getJsonString(responseBody, "name", arrayStart, userName))
        userName = uid;

    Serial.println("[USER] result=VALID");
    Serial.print("[USER] name=");
    Serial.println(userName);
    return USER_LOOKUP_VALID;
}

bool startRemoteSession(const String &uid, String &sid)
{
    Serial.println();
    Serial.println("========== SESSION START =========");
    Serial.print("[SESSION] uid=");
    Serial.println(uid);
    Serial.print("[SESSION] gym=");
    Serial.println(GYM_ID);
    Serial.print("[SESSION] equipment=");
    Serial.println(EQUIPMENT_ID);

    String requestBody =
        String("{\"uid\":\"") + uid +
        "\",\"gym\":\"" + String(GYM_ID) +
        "\",\"equipment\":\"" + String(EQUIPMENT_ID) + "\"}";
    String responseBody;
    String url = String(API_BASE_URL) + "/session/start";

    if (!sendApiRequest("POST", url, requestBody, responseBody))
    {
        Serial.println("[SESSION] start result=API_ERROR");
        return false;
    }

    if (!getJsonString(responseBody, "sid", 0, sid) ||
        sid.length() == 0)
    {
        Serial.println("[SESSION] start result=SID_MISSING");
        return false;
    }

    Serial.print("[SESSION] start result=SUCCESS, sid=");
    Serial.println(sid);
    return true;
}

bool finishRemoteSession()
{
    Serial.println();
    Serial.println("========= SESSION FINISH =========");

    if (currentSessionId.length() == 0)
    {
        Serial.println("[SESSION] finish result=NO_ACTIVE_SESSION");
        return false;
    }

    String requestBody =
        String("{\"sid\":\"") + currentSessionId +
        "\",\"count\":" + String(memberTotalReps) +
        ",\"set\":" + String(memberTotalSets) +
        ",\"weight\":" + String(memberWorkoutWeightKg) + "}";
    String responseBody;
    String url = String(API_BASE_URL) + "/session/finish";

    Serial.print("[SESSION] sid=");
    Serial.println(currentSessionId);
    Serial.print("[SESSION] total count=");
    Serial.println(memberTotalReps);
    Serial.print("[SESSION] total sets=");
    Serial.println(memberTotalSets);
    Serial.print("[SESSION] weight=");
    Serial.print(memberWorkoutWeightKg);
    Serial.println(" kg");

    bool success = false;

    // finish는 같은 sid에 같은 값을 다시 써도 결과가 같으므로 한 번 재시도한다.
    for (int attempt = 0; attempt < 2 && !success; attempt++)
    {
        success = sendApiRequest("POST", url, requestBody, responseBody);

        if (!success && attempt == 0)
        {
            Serial.println("[SESSION] finish failed; retrying once");
            delay(500);
        }
    }

    if (success)
    {
        Serial.print("[SESSION] finish result=SUCCESS, sid=");
        Serial.println(currentSessionId);
        currentSessionId = "";
    }
    else
    {
        Serial.println("[SESSION] finish result=API_ERROR");
    }

    return success;
}

int weightToIndex(int selectedWeight)
{
    if (selectedWeight == 10) return 0;
    if (selectedWeight == 20) return 1;
    if (selectedWeight == 30) return 2;
    return -1;
}

void resetSession()
{
    for (int i = 0; i < MAX_WEIGHTS; i++)
    {
        weightUsed[i] = 0;

        for (int j = 0; j < MAX_SETS; j++)
            repHistory[i][j] = 0;
    }

    repCount = 0;
    setNum = 1;
    weight = 0;
    oldWeight = -1;
    memberWorkoutWeightKg = 0;
    memberTotalReps = 0;
    memberTotalSets = 0;
    memberTotalVolumeKg = 0;
    currentSessionId = "";
    lifted = false;
    waitingS04 = false;
    resetRepDetector();
}

void commitSetRep()
{
    int weightIndex = weightToIndex(weight);

    if (weightIndex < 0)
        return;

    if (setNum < 1 || setNum > MAX_SETS)
        return;

    repHistory[weightIndex][setNum - 1] = repCount;
    weightUsed[weightIndex] = 1;
}

//================================================
// SETUP
//================================================
void setup()
{
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("=================================");
    Serial.println("       RepCast ESP32 BOOT");
    Serial.println("=================================");
    Serial.println("[BOOT] serial baud=115200");
    Serial.print("[BOOT] API=");
    Serial.println(API_BASE_URL);
    Serial.print("[BOOT] gym=");
    Serial.println(GYM_ID);
    Serial.print("[BOOT] equipment=");
    Serial.println(EQUIPMENT_ID);

    // HC-SR04 핀 초기화
    initUltrasonicSensor();

    SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI);

    pinMode(TFT_CS, OUTPUT);
    pinMode(TOUCH_CS, OUTPUT);
    pinMode(RFID_CS, OUTPUT);
    releaseSPI();

    pinMode(HALL1, INPUT_PULLUP);
    pinMode(HALL2, INPUT_PULLUP);
    pinMode(HALL3, INPUT_PULLUP);
    pinMode(ACTION_BUTTON_PIN, INPUT);
    pinMode(END_BUTTON_PIN, INPUT);

    pinMode(TFT_BL, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(TFT_BL, HIGH);
    digitalWrite(LED_PIN, LED_OFF);
    noTone(BUZZER_PIN);

    // TFT 초기화
    releaseSPI();
    tft.begin();
    tft.setRotation(1);          // 320 x 240 가로 화면
    tft.invertDisplay(false);
    delay(20);
    tft.writeCommand(ILI9341_SLPOUT);
    delay(120);
    tft.writeCommand(ILI9341_DISPON);
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);
    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.println("BOOTING...");
    releaseSPI();

    releaseSPI();
    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);
    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.println("CONNECTING WIFI...");
    releaseSPI();

    connectWiFi(WIFI_CONNECT_TIMEOUT_MS);
    lastDisplayedWiFiConnected = WiFi.status() == WL_CONNECTED;

    // RFID 초기화
    releaseSPI();
    rfid.PCD_Init();
    releaseSPI();

    resetSession();
    drawTapCard();
}

//================================================
// LOOP
//================================================
void loop()
{
    keepBacklightOn();

    maintainWiFi();
    readRFID();
    checkHall();
    checkWeightDelay();
    checkRep();
    checkPhysicalButtons();
    checkSummaryDelay();

    delay(2);
}

//================================================
// HC-SR04 초음파 거리 측정
//================================================
void initUltrasonicSensor()
{
    pinMode(ULTRASONIC_TRIG, OUTPUT);
    pinMode(ULTRASONIC_ECHO, INPUT);

    // 부팅 시 TRIG를 반드시 LOW로 시작
    digitalWrite(ULTRASONIC_TRIG, LOW);
    delay(50);

    ultrasonicState = ULTRASONIC_READING;

    Serial.println();
    Serial.println("========== HC-SR04 INIT ==========");
    Serial.println("TRIG = GPIO21");
    Serial.println("ECHO = GPIO22");
    Serial.println("IMPORTANT: HC-SR04 ECHO is 5V.");
    Serial.println("Use a voltage divider before ESP32 GPIO22.");
    Serial.println("==================================");
}

void resetRepDetector()
{
    lifted = false;
    ultrasonicDistanceMm = -1;
    moveConfirmCount = 0;
    returnConfirmCount = 0;
    ultrasonicErrorCount = 0;
    ultrasonicState = ULTRASONIC_READING;
}

bool readUltrasonicDistance(int &distanceMm)
{
    if (millis() - lastUltrasonicReadTime < ULTRASONIC_READ_INTERVAL_MS)
        return false;

    lastUltrasonicReadTime = millis();

    // HC-SR04 트리거 펄스: LOW 2us -> HIGH 10us -> LOW
    digitalWrite(ULTRASONIC_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(ULTRASONIC_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(ULTRASONIC_TRIG, LOW);

    unsigned long echoTimeUs = pulseIn(
        ULTRASONIC_ECHO,
        HIGH,
        ULTRASONIC_ECHO_TIMEOUT_US
    );

    // 제한 시간 안에 ECHO가 돌아오지 않음
    if (echoTimeUs == 0)
    {
        ultrasonicErrorCount++;
        ultrasonicState = ULTRASONIC_TIMEOUT;

        if (millis() - lastUltrasonicPrintTime >=
            ULTRASONIC_PRINT_INTERVAL_MS)
        {
            lastUltrasonicPrintTime = millis();
            Serial.print("ULTRASONIC TIMEOUT errors=");
            Serial.println(ultrasonicErrorCount);
        }

        return false;
    }

    // 음속 0.343mm/us, 왕복 거리이므로 2로 나눔
    // distance(mm) = echoTimeUs * 343 / 2000
    int value = static_cast<int>(
        (echoTimeUs * 343UL) / 2000UL
    );

    // HC-SR04의 실사용 범위를 벗어난 값은 무시
    if (value < 20 || value > 4000)
    {
        ultrasonicErrorCount++;
        ultrasonicState = ULTRASONIC_TIMEOUT;
        return false;
    }

    ultrasonicErrorCount = 0;
    ultrasonicState = ULTRASONIC_READY;
    distanceMm = value;
    ultrasonicDistanceMm = value;

    if (millis() - lastUltrasonicPrintTime >=
        ULTRASONIC_PRINT_INTERVAL_MS)
    {
        lastUltrasonicPrintTime = millis();

        Serial.print("ULTRASONIC=");
        Serial.print(distanceMm);
        Serial.print(" mm");

        Serial.print(" MOVING=");
        Serial.println(lifted ? "YES" : "NO");
    }

    return true;
}

//================================================
// RFID
//================================================
bool readCardUid(String &cardUid)
{
    MFRC522::MIFARE_Key key;

    for (byte i = 0; i < 6; i++)
        key.keyByte[i] = 0xFF;

    MFRC522::StatusCode status = rfid.PCD_Authenticate(
        MFRC522::PICC_CMD_MF_AUTH_KEY_A,
        RFID_DATA_BLOCK,
        &key,
        &(rfid.uid)
    );

    if (status != MFRC522::STATUS_OK)
    {
        Serial.print("RFID AUTH ERROR: ");
        Serial.println(rfid.GetStatusCodeName(status));
        return false;
    }

    byte buffer[RFID_BLOCK_SIZE + 2];
    byte bufferSize = sizeof(buffer);

    status = rfid.MIFARE_Read(RFID_DATA_BLOCK, buffer, &bufferSize);

    if (status != MFRC522::STATUS_OK)
    {
        Serial.print("RFID READ ERROR: ");
        Serial.println(rfid.GetStatusCodeName(status));
        return false;
    }

    cardUid = "";

    for (byte i = 0; i < RFID_BLOCK_SIZE; i++)
    {
        byte value = buffer[i];

        if (value == '\0')
            break;

        if (value < 32 || value > 126)
        {
            Serial.println("INVALID CARD DATA");
            cardUid = "";
            return false;
        }

        cardUid += static_cast<char>(value);
    }

    cardUid.trim();

    if (cardUid.length() == 0)
    {
        Serial.println("EMPTY CARD UID");
        return false;
    }

    Serial.print("STORED UID: ");
    Serial.println(cardUid);
    return true;
}

void readRFID()
{
    if (screen != S01_TAPCARD)
        return;

    releaseSPI();

    if (!rfid.PICC_IsNewCardPresent())
    {
        releaseSPI();
        return;
    }

    if (!rfid.PICC_ReadCardSerial())
    {
        releaseSPI();
        return;
    }

    Serial.println();
    Serial.println("=========== CARD DETECTED =========");

    String uid = "";

    for (byte i = 0; i < rfid.uid.size; i++)
    {
        if (rfid.uid.uidByte[i] < 0x10)
            uid += "0";

        uid += String(rfid.uid.uidByte[i], HEX);
    }

    uid.toUpperCase();

    Serial.print("[CARD] hardware uid=");
    Serial.println(uid);

    String storedUid = "";
    bool uidReadSuccess = readCardUid(storedUid);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    releaseSPI();

    // RFID 통신을 모두 끝낸 직후 카드 인식 알림음을 낸다.
    playCardAlert();

    if (!uidReadSuccess)
    {
        Serial.println("[CARD] result=DATA_BLOCK_READ_ERROR");
        currentUser = "";
        currentUID = "";
        screen = S01_TAPCARD;
        playInvalidCardAlert();
        drawStatusMessage("CARD ERROR", "UID READ FAILED", ILI9341_RED);
        delay(1500);
        drawTapCard();
        return;
    }

    // 서버에서 발급하는 UID는 16자리 소문자 hex이다. 카드에 대문자로
    // 기록된 경우도 같은 UID로 조회되도록 정규화한다.
    storedUid.trim();
    storedUid.toLowerCase();
    Serial.print("[CARD] normalized stored uid=");
    Serial.println(storedUid);

    if (!isValidStoredUid(storedUid))
    {
        Serial.print("[CARD] result=INVALID_UID_FORMAT, length=");
        Serial.println(storedUid.length());
        currentUser = "";
        currentUID = "";
        currentSessionId = "";
        screen = S01_TAPCARD;
        playInvalidCardAlert();
        drawStatusMessage("INVALID CARD", "INVALID UID FORMAT", ILI9341_RED);
        delay(1800);
        drawTapCard();
        return;
    }

    drawStatusMessage("CHECKING CARD", "PLEASE WAIT", ILI9341_CYAN);

    String userName = "";
    UserLookupResult lookupResult = getUserByUid(storedUid, userName);

    if (lookupResult == USER_LOOKUP_NOT_FOUND)
    {
        Serial.println("[CARD] authorization=DENIED");
        currentUser = "";
        currentUID = "";
        currentSessionId = "";
        screen = S01_TAPCARD;
        playInvalidCardAlert();
        drawStatusMessage("INVALID CARD", "ACCESS DENIED", ILI9341_RED);
        delay(1800);
        drawTapCard();
        return;
    }

    if (lookupResult == USER_LOOKUP_API_ERROR)
    {
        Serial.println("[CARD] authorization=UNKNOWN_DUE_TO_API_ERROR");
        currentUser = "";
        currentUID = "";
        currentSessionId = "";
        screen = S01_TAPCARD;
        drawStatusMessage("API ERROR", "CHECK WIFI / SERVER", ILI9341_RED);
        delay(1800);
        drawTapCard();
        return;
    }

    String sid = "";

    if (!startRemoteSession(storedUid, sid))
    {
        Serial.println("[CARD] session start failed");
        currentUser = "";
        currentUID = "";
        currentSessionId = "";
        screen = S01_TAPCARD;
        drawStatusMessage("API ERROR", "TRY AGAIN", ILI9341_RED);
        delay(1800);
        drawTapCard();
        return;
    }

    currentUser = userName;
    currentUID = storedUid;
    currentSessionId = sid;

    Serial.println("[CARD] authorization=GRANTED");
    screen = S02_HELLO;
    drawHello(currentUser);
}

//================================================
// Hall 센서
//================================================
void checkHall()
{
    if (currentUID.length() == 0)
        return;

    // REST 화면에서는 무게 변화로 화면이 바뀌지 않게 함
    if (screen == S05_REST)
        return;

    int newWeight = 0;

    if (digitalRead(HALL1) == LOW)
        newWeight = 10;
    else if (digitalRead(HALL2) == LOW)
        newWeight = 20;
    else if (digitalRead(HALL3) == LOW)
        newWeight = 30;

    if (newWeight == oldWeight)
        return;

    if (screen == S04_ACTIVE && weight > 0)
        commitSetRep();

    oldWeight = newWeight;
    weight = newWeight;

    // 핀이 빠져서 0 kg이 된 경우 기존 화면을 지우지 않음
    if (weight <= 0)
        return;

    memberWorkoutWeightKg = weight;

    Serial.print("MEMBER WORKOUT WEIGHT = ");
    Serial.print(memberWorkoutWeightKg);
    Serial.println(" kg");

    int weightIndex = weightToIndex(weight);

    if (weightIndex >= 0 && setNum >= 1 && setNum <= MAX_SETS)
        repCount = repHistory[weightIndex][setNum - 1];
    else
        repCount = 0;

    screen = S03_WEIGHT;
    drawWeightReady(currentUser, weight);

    weightTime = millis();
    waitingS04 = true;
}

void checkWeightDelay()
{
    if (!waitingS04)
        return;

    if (millis() - weightTime < 1000)
        return;

    waitingS04 = false;
    resetRepDetector();
    screen = S04_ACTIVE;
    playStartAlert();
    drawActiveSet(memberWorkoutWeightKg, repCount, setNum);
}

//================================================
// 반복 횟수 측정
//================================================
void checkRep()
{
    if (screen != S04_ACTIVE)
        return;

    int distance = 0;

    if (!readUltrasonicDistance(distance))
        return;

    if (!lifted)
    {
        // 300mm 이상 멀어진 상태가 연속으로 확인되면 동작 시작
        if (distance >= FAR_DISTANCE_MM)
        {
            moveConfirmCount++;

            if (moveConfirmCount >= MOVE_CONFIRM_COUNT)
            {
                lifted = true;
                moveConfirmCount = 0;
                returnConfirmCount = 0;
                Serial.println("REP MOVEMENT START");
            }
        }
        else
        {
            moveConfirmCount = 0;
        }
    }
    else
    {
        // 멀어졌다가 240mm 이하로 가까워지면 1회 증가
        if (distance <= NEAR_DISTANCE_MM)
        {
            returnConfirmCount++;

            if (returnConfirmCount >= RETURN_CONFIRM_COUNT)
            {
                lifted = false;
                returnConfirmCount = 0;
                repCount++;
                memberTotalReps++;
                memberTotalVolumeKg += memberWorkoutWeightKg;

                commitSetRep();
                beep();
                drawActiveSet(memberWorkoutWeightKg, repCount, setNum);

                Serial.print("REP COUNT = ");
                Serial.println(repCount);
                Serial.print("MEMBER TOTAL REPS = ");
                Serial.println(memberTotalReps);
                Serial.print("MEMBER TOTAL VOLUME = ");
                Serial.print(memberTotalVolumeKg);
                Serial.println(" kg");
            }
        }
        else
        {
            returnConfirmCount = 0;
        }
    }
}

//================================================
// 화면 그리기
//================================================
void drawTapCard()
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);

    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.print("WiFi");
    tft.setCursor(WiFi.status() == WL_CONNECTED ? 265 : 220, 10);

    if (WiFi.status() == WL_CONNECTED)
    {
        tft.setTextColor(ILI9341_GREEN);
        tft.print("OK");
    }
    else
    {
        tft.setTextColor(ILI9341_RED);
        tft.print("OFFLINE");
    }

    tft.setTextColor(ILI9341_WHITE);

    tft.drawRoundRect(25, 60, 270, 90, 10, ILI9341_WHITE);
    tft.setTextSize(4);
    tft.setCursor(70, 90);
    tft.print("TAP CARD");

    tft.setTextSize(3);
    tft.setCursor(95, 185);
    tft.print("RepCast");

    tft.setTextColor(ILI9341_WHITE);

    releaseSPI();
}

void drawStatusMessage(const char *title, const char *message,
                       uint16_t color)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(color);
    tft.setTextSize(3);
    tft.setCursor(20, 75);
    tft.print(title);

    tft.setTextColor(ILI9341_WHITE);
    tft.setTextSize(2);
    tft.setCursor(20, 135);
    tft.print(message);

    releaseSPI();
}

void drawHello(const String &name)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);

    tft.setTextSize(3);
    tft.setCursor(95, 45);
    tft.print("HELLO");

    tft.setTextSize(5);
    int x = (320 - static_cast<int>(name.length()) * 30) / 2;
    if (x < 0) x = 0;

    tft.setCursor(x, 120);
    tft.print(name);

    releaseSPI();
}

void drawWeightReady(const String &name, int selectedWeight)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);

    tft.setTextSize(2);
    tft.setCursor(15, 10);
    tft.print("MEMBER : ");
    tft.print(name);

    tft.setTextSize(6);
    tft.setCursor(60, 70);
    tft.print(selectedWeight);
    tft.print("kg");

    tft.setTextSize(3);
    tft.setCursor(100, 180);
    tft.print("PIN OK");

    releaseSPI();
}

void drawButton(const ButtonRect &button, const char *label)
{
    tft.drawRoundRect(button.x, button.y, button.w, button.h,
                      10, ILI9341_WHITE);

    int16_t textX1;
    int16_t textY1;
    uint16_t textWidth;
    uint16_t textHeight;

    tft.setTextSize(3);
    tft.getTextBounds(label, 0, 0,
                      &textX1, &textY1, &textWidth, &textHeight);

    int textX = button.x + (button.w - textWidth) / 2;
    int textY = button.y + (button.h - textHeight) / 2 - 2;

    tft.setCursor(textX, textY);
    tft.print(label);
}

void drawActiveSet(int selectedWeight, int reps, int currentSet)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);

    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.print(selectedWeight);
    tft.print("kg");

    tft.setCursor(120, 10);
    tft.print("SET ");
    tft.print(currentSet);

    tft.setTextSize(7);
    tft.setCursor(90, 55);
    tft.print(reps);

    tft.setTextSize(3);
    tft.setCursor(220, 100);
    tft.print("REPS");

    drawButton(BTN_REST, "REST");

    tft.setTextColor(ILI9341_WHITE);
    releaseSPI();
}

void drawRestScreen(int completedSet)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);

    tft.setTextSize(4);
    tft.setCursor(105, 25);
    tft.print("REST");

    // 시간 제한 없음: NEXT 또는 END를 누를 때까지 계속 표시
    tft.setTextSize(3);
    tft.setCursor(65, 100);
    tft.print(completedSet);
    tft.print(" SETS DONE");

    drawButton(BTN_NEXT, "NEXT");
    drawButton(BTN_END, "END");

    releaseSPI();
}

void drawSummaryScreen(int totalSets, int totalReps, long totalVolumeKg,
                       bool savedSuccessfully)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);

    int16_t x1;
    int16_t y1;
    uint16_t textWidth;
    uint16_t textHeight;

    const char *title = "WELL DONE!";
    tft.setTextSize(3);
    tft.getTextBounds(title, 0, 0, &x1, &y1, &textWidth, &textHeight);
    tft.setCursor((320 - textWidth) / 2, 28);
    tft.print(title);

    String totals = "SET: " + String(totalSets) +
                    "  REPS: " + String(totalReps);
    tft.setTextSize(2);
    tft.getTextBounds(totals, 0, 0, &x1, &y1, &textWidth, &textHeight);
    tft.setCursor((320 - textWidth) / 2, 78);
    tft.print(totals);

    String volume = String(totalVolumeKg) + "kg";
    tft.setTextSize(5);
    tft.getTextBounds(volume, 0, 0, &x1, &y1, &textWidth, &textHeight);
    tft.setCursor((320 - textWidth) / 2, 115);
    tft.print(volume);

    const char *saved = savedSuccessfully ? "SAVED" : "SAVE FAILED";
    tft.setTextSize(2);
    tft.getTextBounds(saved, 0, 0, &x1, &y1, &textWidth, &textHeight);
    tft.setCursor((320 - textWidth) / 2, 190);
    tft.setTextColor(savedSuccessfully ? ILI9341_GREEN : ILI9341_RED);
    tft.print(saved);

    tft.setTextColor(ILI9341_WHITE);
    releaseSPI();
}

//================================================
// LED + BUZZER
//================================================
void setWorkoutLed(bool enabled)
{
    digitalWrite(LED_PIN, enabled ? LED_ON : LED_OFF);
}

void beep()
{
    // 운동 중 LED를 잠깐 껐다 켜서 반복 완료를 눈으로도 표시
    digitalWrite(LED_PIN, LED_OFF);
    tone(BUZZER_PIN, 2000);
    delay(100);
    noTone(BUZZER_PIN);
    setWorkoutLed(screen == S04_ACTIVE);
    keepBacklightOn();
}

void playCardAlert()
{
    tone(BUZZER_PIN, 2200);
    delay(100);
    noTone(BUZZER_PIN);
}

void playInvalidCardAlert()
{
    tone(BUZZER_PIN, 450);
    delay(280);
    noTone(BUZZER_PIN);
}

void playStartAlert()
{
    setWorkoutLed(true);

    tone(BUZZER_PIN, 1500);
    delay(80);
    noTone(BUZZER_PIN);
    delay(40);
    tone(BUZZER_PIN, 2000);
    delay(120);
    noTone(BUZZER_PIN);
}

void playRestAlert()
{
    setWorkoutLed(false);

    tone(BUZZER_PIN, 1800);
    delay(100);
    noTone(BUZZER_PIN);
    delay(60);
    tone(BUZZER_PIN, 1200);
    delay(140);
    noTone(BUZZER_PIN);
}

void playEndAlert()
{
    setWorkoutLed(false);

    tone(BUZZER_PIN, 1200);
    delay(120);
    noTone(BUZZER_PIN);
    delay(60);
    tone(BUZZER_PIN, 800);
    delay(220);
    noTone(BUZZER_PIN);
}

//================================================
// 터치 입력 및 버튼 처리
//================================================
bool readRawTouchAverage(int &rawX, int &rawY, int &pressure)
{
    releaseSPI();

    if (!ts.touched())
    {
        releaseSPI();
        return false;
    }

    long sumX = 0;
    long sumY = 0;
    long sumZ = 0;
    int validSamples = 0;

    // 여러 번 평균을 내서 터치 흔들림을 줄임
    for (int i = 0; i < 7; i++)
    {
        releaseSPI();

        if (!ts.touched())
            break;

        TS_Point point = ts.getPoint();
        releaseSPI();

        if (point.z >= TOUCH_PRESSURE_MIN)
        {
            sumX += point.x;
            sumY += point.y;
            sumZ += point.z;
            validSamples++;
        }

        delay(2);
    }

    releaseSPI();

    if (validSamples == 0)
        return false;

    rawX = sumX / validSamples;
    rawY = sumY / validSamples;
    pressure = sumZ / validSamples;
    return true;
}

long mapTouchAxis(long value, long inputA, long inputB,
                  long outputA, long outputB)
{
    long denominator = inputB - inputA;

    if (denominator == 0)
        return outputA;

    return (value - inputA) * (outputB - outputA) /
           denominator + outputA;
}

bool getTouch(int &screenX, int &screenY)
{
    int rawX;
    int rawY;
    int pressure;

    if (!readRawTouchAverage(rawX, rawY, pressure))
    {
        touchLocked = false;
        return false;
    }

    // 손가락을 떼기 전까지 같은 터치를 중복 처리하지 않음
    if (touchLocked)
        return false;

    if (millis() - lastTouchTime < TOUCH_DEBOUNCE_MS)
        return false;

    int xAxisRaw = screenXUsesRawX ? rawX : rawY;
    int yAxisRaw = screenXUsesRawX ? rawY : rawX;

    screenX = static_cast<int>(mapTouchAxis(
        xAxisRaw, rawLeft, rawRight, 20, 300));

    screenY = static_cast<int>(mapTouchAxis(
        yAxisRaw, rawTop, rawBottom, 20, 220));

    screenX = constrain(screenX, 0, 319);
    screenY = constrain(screenY, 0, 239);

    Serial.print("TOUCH x=");
    Serial.print(screenX);
    Serial.print(" y=");
    Serial.print(screenY);
    Serial.print(" rawX=");
    Serial.print(rawX);
    Serial.print(" rawY=");
    Serial.print(rawY);
    Serial.print(" z=");
    Serial.println(pressure);

    touchLocked = true;
    lastTouchTime = millis();
    return true;
}

bool isInsideButton(int x, int y, const ButtonRect &button)
{
    return x >= button.x &&
           x < button.x + button.w &&
           y >= button.y &&
           y < button.y + button.h;
}

void checkPhysicalButtons()
{
    unsigned long now = millis();
    bool actionRaw =
        digitalRead(ACTION_BUTTON_PIN) == BUTTON_PRESSED;
    bool endRaw =
        digitalRead(END_BUTTON_PIN) == BUTTON_PRESSED;

    if (actionRaw != actionButtonRawState)
    {
        actionButtonRawState = actionRaw;
        actionButtonChangedTime = now;
    }

    if (endRaw != endButtonRawState)
    {
        endButtonRawState = endRaw;
        endButtonChangedTime = now;
    }

    bool actionPressedEvent = false;
    bool endPressedEvent = false;

    if (now - actionButtonChangedTime >= BUTTON_DEBOUNCE_MS &&
        actionButtonStableState != actionButtonRawState)
    {
        actionButtonStableState = actionButtonRawState;
        actionPressedEvent = actionButtonStableState;
    }

    if (now - endButtonChangedTime >= BUTTON_DEBOUNCE_MS &&
        endButtonStableState != endButtonRawState)
    {
        endButtonStableState = endButtonRawState;
        endPressedEvent = endButtonStableState;
    }

    // S04에서는 두 버튼 모두 REST -> S05
    if (screen == S04_ACTIVE &&
        (actionPressedEvent || endPressedEvent))
    {
        commitSetRep();
        lifted = false;
        memberTotalSets++;

        screen = S05_REST;
        playRestAlert();
        drawRestScreen(setNum);

        Serial.print("MEMBER TOTAL SETS = ");
        Serial.println(memberTotalSets);
        return;
    }

    if (screen != S05_REST)
        return;

    // 버튼 1: S05의 NEXT -> 다음 세트 S04
    if (actionPressedEvent)
    {
        setNum++;

        if (setNum > MAX_SETS)
            setNum = MAX_SETS;

        repCount = 0;
        resetRepDetector();

        screen = S04_ACTIVE;
        playStartAlert();
        drawActiveSet(memberWorkoutWeightKg, repCount, setNum);
        return;
    }

    // 버튼 2: S05의 END -> S06
    if (endPressedEvent)
    {
        Serial.println("========== MEMBER WORKOUT SUMMARY ==========");
        Serial.print("LAST WEIGHT = ");
        Serial.print(memberWorkoutWeightKg);
        Serial.println(" kg");
        Serial.print("TOTAL REPS = ");
        Serial.println(memberTotalReps);
        Serial.print("TOTAL SETS = ");
        Serial.println(memberTotalSets);
        Serial.print("TOTAL VOLUME = ");
        Serial.print(memberTotalVolumeKg);
        Serial.println(" kg");
        Serial.println("============================================");

        playEndAlert();
        drawStatusMessage("SAVING", "PLEASE WAIT", ILI9341_CYAN);
        bool savedSuccessfully = finishRemoteSession();

        screen = S06_SAVE_SUMMARY;
        drawSummaryScreen(
            memberTotalSets,
            memberTotalReps,
            memberTotalVolumeKg,
            savedSuccessfully
        );
        summaryStartTime = millis();
        return;
    }
}

void checkSummaryDelay()
{
    if (screen != S06_SAVE_SUMMARY)
        return;

    if (millis() - summaryStartTime < SUMMARY_DISPLAY_MS)
        return;

    currentUser = "";
    currentUID = "";
    resetSession();

    screen = S01_TAPCARD;
    drawTapCard();
}

void waitUntilTouchReleased()
{
    while (true)
    {
        releaseSPI();
        bool pressed = ts.touched();
        releaseSPI();

        if (!pressed)
            break;

        keepBacklightOn();
        delay(10);
    }

    delay(150);
}

//================================================
// 터치 보정
//================================================
void loadTouchCalibration()
{
    touchCalibrated = prefs.getBool("tcal", false);

    if (!touchCalibrated)
        return;

    screenXUsesRawX = prefs.getBool("xraw", true);
    rawLeft = prefs.getInt("left", 300);
    rawRight = prefs.getInt("right", 3800);
    rawTop = prefs.getInt("top", 300);
    rawBottom = prefs.getInt("bottom", 3800);

    // 저장값이 비정상적이면 다시 보정
    if (abs(rawRight - rawLeft) < 500 ||
        abs(rawBottom - rawTop) < 500)
    {
        touchCalibrated = false;
    }
}

void saveTouchCalibration()
{
    prefs.putBool("tcal", true);
    prefs.putBool("xraw", screenXUsesRawX);
    prefs.putInt("left", rawLeft);
    prefs.putInt("right", rawRight);
    prefs.putInt("top", rawTop);
    prefs.putInt("bottom", rawBottom);
}

void drawCalibrationTarget(int targetX, int targetY, const char *message)
{
    releaseSPI();
    keepBacklightOn();

    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);
    tft.setTextSize(2);
    tft.setCursor(10, 95);
    tft.print(message);

    tft.drawCircle(targetX, targetY, 12, ILI9341_WHITE);
    tft.drawLine(targetX - 18, targetY,
                 targetX + 18, targetY, ILI9341_WHITE);
    tft.drawLine(targetX, targetY - 18,
                 targetX, targetY + 18, ILI9341_WHITE);

    releaseSPI();
}

void captureCalibrationPoint(int targetX, int targetY,
                             int &capturedRawX, int &capturedRawY)
{
    drawCalibrationTarget(targetX, targetY, "TOUCH THE TARGET");

    while (true)
    {
        int pressure;

        if (readRawTouchAverage(capturedRawX, capturedRawY, pressure))
        {
            if (pressure >= TOUCH_PRESSURE_MIN)
            {
                Serial.print("CAL rawX=");
                Serial.print(capturedRawX);
                Serial.print(" rawY=");
                Serial.println(capturedRawY);

                waitUntilTouchReleased();
                return;
            }
        }

        keepBacklightOn();
        delay(10);
    }
}

void calibrateTouch()
{
    waitUntilTouchReleased();

    int topLeftRawX;
    int topLeftRawY;
    int topRightRawX;
    int topRightRawY;
    int bottomLeftRawX;
    int bottomLeftRawY;

    // 좌상단 -> 우상단 -> 좌하단 순서로 터치
    captureCalibrationPoint(20, 20, topLeftRawX, topLeftRawY);
    captureCalibrationPoint(300, 20, topRightRawX, topRightRawY);
    captureCalibrationPoint(20, 220, bottomLeftRawX, bottomLeftRawY);

    int rawXHorizontalChange = abs(topRightRawX - topLeftRawX);
    int rawYHorizontalChange = abs(topRightRawY - topLeftRawY);

    screenXUsesRawX = rawXHorizontalChange >= rawYHorizontalChange;

    if (screenXUsesRawX)
    {
        rawLeft = topLeftRawX;
        rawRight = topRightRawX;
        rawTop = topLeftRawY;
        rawBottom = bottomLeftRawY;
    }
    else
    {
        rawLeft = topLeftRawY;
        rawRight = topRightRawY;
        rawTop = topLeftRawX;
        rawBottom = bottomLeftRawX;
    }

    touchCalibrated = true;
    saveTouchCalibration();

    releaseSPI();
    keepBacklightOn();
    tft.fillScreen(ILI9341_BLACK);
    tft.setTextColor(ILI9341_WHITE);
    tft.setTextSize(3);
    tft.setCursor(55, 95);
    tft.print("CALIBRATED");
    releaseSPI();

    delay(700);
    touchLocked = false;
}
