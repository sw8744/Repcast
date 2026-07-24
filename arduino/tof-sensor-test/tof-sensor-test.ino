/*
  Arduino Uno VL53LXX-V2 ToF 센서 테스트

  연결:
    VIN -> 5V
    GND -> GND
    SDA -> A4
    SCL -> A5
    GPIO1, XSHUT -> 연결하지 않음

  VL53LXX-V2 모듈에는 VL53L0X 센서가 사용됩니다.
  Arduino IDE 라이브러리 관리자에서
  "Adafruit VL53L0X" 라이브러리를 설치해야 합니다.
*/

#include <Wire.h>
#include <Adafruit_VL53L0X.h>

const unsigned long MEASUREMENT_INTERVAL_MS = 200;

Adafruit_VL53L0X tofSensor;
unsigned long lastMeasurementAt = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin();

  Serial.println(F("VL53LXX-V2 ToF sensor test started"));
  Serial.println(F("FORMAT: TOF,distance_mm,status"));

  if (!tofSensor.begin()) {
    Serial.println(F("TOF,ERROR,Sensor not found"));
    Serial.println(F("Check VIN, GND, SDA(A4), and SCL(A5)."));

    while (true) {
      delay(1000);
    }
  }

  Serial.println(F("TOF,READY"));
}

void loop() {
  if (millis() - lastMeasurementAt < MEASUREMENT_INTERVAL_MS) {
    return;
  }
  lastMeasurementAt = millis();

  VL53L0X_RangingMeasurementData_t measurement;
  tofSensor.rangingTest(&measurement, false);

  Serial.print(F("TOF,"));

  // RangeStatus 4는 측정 범위를 벗어난 상태입니다.
  if (measurement.RangeStatus != 4) {
    Serial.print(measurement.RangeMilliMeter);
    Serial.println(F(",VALID"));
  } else {
    Serial.println(F("-1,OUT_OF_RANGE"));
  }
}
