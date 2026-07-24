#include <SPI.h>
#include <MFRC522.h>
#include <string.h>

#define RST_PIN 9
#define SS_PIN 10

const byte DATA_BLOCK = 4;       // 섹터 1의 첫 번째 데이터 블록
const byte BLOCK_SIZE = 16;
const byte COMMAND_SIZE = 64;

enum Mode {
  READ_MODE,
  WRITE_MODE
};

MFRC522 mfrc522(SS_PIN, RST_PIN);
Mode mode = READ_MODE;
char writeValue[BLOCK_SIZE + 1] = "";
char commandBuffer[COMMAND_SIZE];
byte commandLength = 0;
bool discardCommand = false;

void printUid() {
  Serial.print(F("Card UID:"));
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    Serial.print(mfrc522.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(mfrc522.uid.uidByte[i], HEX);
  }
  Serial.println();
}

void stopCard() {
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

bool authenticateBlock(MFRC522::MIFARE_Key *key) {
  MFRC522::StatusCode status = mfrc522.PCD_Authenticate(
    MFRC522::PICC_CMD_MF_AUTH_KEY_A,
    DATA_BLOCK,
    key,
    &(mfrc522.uid)
  );

  if (status != MFRC522::STATUS_OK) {
    Serial.print(F("ERR,AUTH,"));
    Serial.println(mfrc522.GetStatusCodeName(status));
    return false;
  }
  return true;
}

void writeBlock() {
  byte data[BLOCK_SIZE];
  memset(data, ' ', sizeof(data));
  memcpy(data, writeValue, strlen(writeValue));

  MFRC522::StatusCode status =
    mfrc522.MIFARE_Write(DATA_BLOCK, data, BLOCK_SIZE);

  if (status == MFRC522::STATUS_OK) {
    Serial.print(F("OK,W,"));
    Serial.println(writeValue);
  } else {
    Serial.print(F("ERR,WRITE,"));
    Serial.println(mfrc522.GetStatusCodeName(status));
  }
}

void readBlock() {
  // MIFARE_Read()에는 데이터 16바이트와 CRC 2바이트를 담을 공간이 필요하다.
  byte data[BLOCK_SIZE + 2];
  byte size = sizeof(data);
  MFRC522::StatusCode status =
    mfrc522.MIFARE_Read(DATA_BLOCK, data, &size);

  if (status != MFRC522::STATUS_OK) {
    Serial.print(F("ERR,READ,"));
    Serial.println(mfrc522.GetStatusCodeName(status));
    return;
  }

  Serial.print(F("OK,R,"));
  byte valueLength = BLOCK_SIZE;
  while (valueLength > 0 &&
         (data[valueLength - 1] == ' ' || data[valueLength - 1] == '\0')) {
    valueLength--;
  }
  for (byte i = 0; i < valueLength; i++) {
    Serial.write(data[i]);
  }
  Serial.println();
}

void handleCommand(char *command) {
  if (strcmp(command, "R") == 0) {
    mode = READ_MODE;
    Serial.println(F("OK,MODE,R"));
    return;
  }

  if (strncmp(command, "W,", 2) == 0) {
    const char *value = command + 2;
    size_t valueLength = strlen(value);

    if (valueLength > BLOCK_SIZE) {
      Serial.println(F("ERR,VALUE_TOO_LONG,MAX_16_BYTES"));
      return;
    }

    strcpy(writeValue, value);
    mode = WRITE_MODE;
    Serial.print(F("OK,MODE,W,"));
    Serial.println(writeValue);
    return;
  }

  Serial.println(F("ERR,COMMAND,USE_R_OR_W_VALUE"));
}

void readSerialCommand() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();

    if (incoming == '\r' || incoming == '\n') {
      if (!discardCommand && commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand(commandBuffer);
      }
      commandLength = 0;
      discardCommand = false;
      continue;
    }

    if (discardCommand) {
      continue;
    }

    if (commandLength < COMMAND_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      discardCommand = true;
      Serial.println(F("ERR,COMMAND_TOO_LONG"));
    }
  }
}

void setup() {
  Serial.begin(9600);
  SPI.begin();
  mfrc522.PCD_Init();
  Serial.println(F("READY,MODE,R"));
}

void loop() {
  readSerialCommand();

  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }

  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  printUid();

  MFRC522::MIFARE_Key key;
  for (byte i = 0; i < 6; i++) {
    key.keyByte[i] = 0xFF;
  }

  if (authenticateBlock(&key)) {
    if (mode == WRITE_MODE) {
      writeBlock();
    } else {
      readBlock();
    }
  }

  stopCard();
}
