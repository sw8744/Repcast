/*
  Arduino Uno 디지털 홀 센서 테스트

  홀 센서 모듈 연결:
    VCC -> 센서 모듈 사양에 맞는 전원(일반적인 모듈은 5V)
    GND -> GND
    DO  -> D2

  별도의 라이브러리는 필요하지 않습니다.
*/

const byte HALL_DIGITAL_PIN = 2;
const unsigned long PRINT_INTERVAL_MS = 200;

unsigned long lastPrintAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(HALL_DIGITAL_PIN, INPUT_PULLUP);

  Serial.println(F("Hall sensor test started"));
  Serial.println(F("Move a magnet close to the sensor."));
  Serial.println(F("FORMAT: HALL,digital,detected"));
}

void loop() {
  if (millis() - lastPrintAt < PRINT_INTERVAL_MS) {
    return;
  }
  lastPrintAt = millis();

  const int digitalValue = digitalRead(HALL_DIGITAL_PIN);

  // 일반적인 홀 센서 모듈의 DO는 자석 감지 시 LOW가 됩니다.
  const bool magnetDetected = (digitalValue == LOW);

  Serial.print(F("HALL,"));
  Serial.print(digitalValue);
  Serial.print(',');
  Serial.println(magnetDetected ? F("DETECTED") : F("IDLE"));
}
