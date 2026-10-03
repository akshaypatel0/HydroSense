/**
 * HydroSense – Smart Water Monitor
 * Arduino Authoritative Hardware Firmware (C++)
 * Exact Final Production Release matching Android & Cloud applet specification.
 */

export const ARDUINO_FIRMWARE_SOURCE = `/*
 * ==============================================================================
 * HydroSense – Smart Water Tank Monitor
 * Arduino Uno Final Authoritative Firmware
 * Communication: HC-05 Bluetooth Classic & USB Serial at 9600 baud
 * ==============================================================================
 * 
 * PROTOCOL MESSAGES PRODUCED:
 * 1. Startup:
 *    WATER TANK MONITOR READY
 * 
 * 2. Live Telemetry:
 *    DISTANCE:2.74,LEVEL:97.2
 * 
 * 3. Sensor Unavailable:
 *    SENSOR:ABSENT
 * 
 * 4. Calibration Report (EEPROM Stored):
 *    CALIBRATION:EMPTY=14.00,FULL=2.42
 * 
 * 5. Command Acknowledgements:
 *    ACK:CAL_EMPTY:OK
 *    ACK:CAL_EMPTY:ERROR
 *    ACK:CAL_FULL:OK
 *    ACK:CAL_FULL:ERROR
 * 
 * SUPPORTED INCOMING COMMANDS (newline-terminated '\\n'):
 * - CAL_EMPTY  : Calibrates empty-tank reference distance (0%) and writes to EEPROM
 * - CAL_FULL   : Calibrates full-tank reference distance (100%) and writes to EEPROM
 * - STATUS     : Requests immediate calibration report and status telemetry
 * 
 * BUZZER SAFETY THRESHOLDS:
 * - 0–90%      : Normal or Low-level status (buzzer OFF)
 * - >90% - 95% : High-level warning (buzzer OFF)
 * - >95% - 98.9%: Critical warning (warning buzzer active)
 * - >=98.90%   : Tank full / Immediate attention (continuous buzzer active)
 * - Hysteresis : Continuous buzzer maintains until level drops below 97.50%
 * 
 * HARDWARE CONNECTIONS:
 * 1. HC-SR04 Ultrasonic Distance Sensor:
 *    - VCC  -> 5V
 *    - GND  -> GND
 *    - TRIG -> Pin 9
 *    - ECHO -> Pin 10
 * 
 * 2. HC-05 Bluetooth Classic Module (9600 baud):
 *    - VCC  -> 5V
 *    - GND  -> GND
 *    - TXD  -> Arduino Pin 2 (SoftwareSerial RX)
 *    - RXD  -> Arduino Pin 3 (SoftwareSerial TX, via 1k/2k resistor voltage divider)
 * 
 * 3. Active 5V Piezo Buzzer:
 *    - Positive (+) -> Pin 8
 *    - Negative (-) -> GND
 * 
 * 4. Built-in LED:
 *    - Pin 13 (Heartbeat indicator)
 * ==============================================================================
 */

#include <SoftwareSerial.h>
#include <EEPROM.h>

// --- PIN ASSIGNMENTS ---
const uint8_t PIN_BT_RX  = 2;   // SoftwareSerial RX <- HC-05 TXD
const uint8_t PIN_BT_TX  = 3;   // SoftwareSerial TX -> HC-05 RXD (voltage divider)
const uint8_t PIN_BUZZER = 8;   // Piezo Buzzer
const uint8_t PIN_TRIG   = 9;   // HC-SR04 Trig
const uint8_t PIN_ECHO   = 10;  // HC-SR04 Echo
const uint8_t PIN_LED    = 13;  // Onboard Activity LED

// --- TIMING CONSTANTS ---
const unsigned long TELEMETRY_INTERVAL_MS = 1000; // 1 reading per second
const unsigned long SENSOR_TIMEOUT_MICROS  = 30000;// 30ms (~5 meters range)

// --- EEPROM ADDRESSES ---
const int EEPROM_ADDR_MAGIC     = 0;   // Magic byte 0x48 ('H' for HydroSense)
const int EEPROM_ADDR_CAL_EMPTY = 2;   // float: empty reference distance (cm)
const int EEPROM_ADDR_CAL_FULL  = 6;   // float: full reference distance (cm)

// --- SYSTEM STATE ---
SoftwareSerial btSerial(PIN_BT_RX, PIN_BT_TX);

float calEmptyDistanceCm = 14.00; // Stored EEPROM Empty distance (0%)
float calFullDistanceCm  = 2.42;  // Stored EEPROM Full distance (100%)

float currentDistanceCm  = 0.0;
float currentWaterLevel  = 0.0;
bool  isSensorAbsent     = false;
bool  continuousBuzzer   = false;
bool  buzzerPinState     = false;

unsigned long lastTelemetryTime = 0;
String serialBuffer = "";
String btBuffer     = "";
uint8_t sensorFailCount = 0;

// Function prototypes
void readUltrasonicSensor();
void computeWaterAndBuzzer();
void broadcastLiveTelemetry();
void sendCalibrationReport();
void sendAck(const String &cmd, const String &status);
void processLine(String line);
void loadCalibrationFromEEPROM();
void saveCalibrationToEEPROM();

void setup() {
  Serial.begin(9600);
  while (!Serial && millis() < 800) { ; }

  btSerial.begin(9600);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);

  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, HIGH);

  loadCalibrationFromEEPROM();

  // 1. Emit exact startup banner
  Serial.println(F("WATER TANK MONITOR READY"));
  btSerial.println(F("WATER TANK MONITOR READY"));

  // Initial read and calibration announcement
  readUltrasonicSensor();
  computeWaterAndBuzzer();
  sendCalibrationReport();
  broadcastLiveTelemetry();
}

void loop() {
  unsigned long now = millis();

  // Read USB Serial input line by line
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\\n' || c == '\\r') {
      if (serialBuffer.length() > 0) {
        processLine(serialBuffer);
        serialBuffer = "";
      }
    } else if (serialBuffer.length() < 64) {
      serialBuffer += c;
    }
  }

  // Read Bluetooth HC-05 input line by line
  while (btSerial.available() > 0) {
    char c = (char)btSerial.read();
    if (c == '\\n' || c == '\\r') {
      if (btBuffer.length() > 0) {
        processLine(btBuffer);
        btBuffer = "";
      }
    } else if (btBuffer.length() < 64) {
      btBuffer += c;
    }
  }

  // Periodic Telemetry Loop
  if (now - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = now;
    readUltrasonicSensor();
    computeWaterAndBuzzer();
    broadcastLiveTelemetry();

    // Toggle heartbeat LED
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }
}

void readUltrasonicSensor() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, SENSOR_TIMEOUT_MICROS);

  if (duration == 0) {
    sensorFailCount++;
    if (sensorFailCount >= 3) {
      isSensorAbsent = true;
    }
    return;
  }

  float dist = (float)duration / 58.2;

  // HC-SR04 validity range: 1.5 cm to 400.0 cm
  if (dist < 1.5 || dist > 400.0) {
    sensorFailCount++;
    if (sensorFailCount >= 3) {
      isSensorAbsent = true;
    }
    return;
  }

  sensorFailCount = 0;
  isSensorAbsent  = false;
  currentDistanceCm = dist;
}

void computeWaterAndBuzzer() {
  if (isSensorAbsent) {
    continuousBuzzer = false;
    buzzerPinState   = false;
    digitalWrite(PIN_BUZZER, LOW);
    return;
  }

  float usableHeight = calEmptyDistanceCm - calFullDistanceCm;
  if (usableHeight <= 0.5) {
    currentWaterLevel = 0.0;
  } else {
    float waterDepth = calEmptyDistanceCm - currentDistanceCm;
    float pct = (waterDepth / usableHeight) * 100.0;
    if (pct < 0.0) pct = 0.0;
    if (pct > 100.0) pct = 100.0;
    currentWaterLevel = pct;
  }

  // Continuous Buzzer Hysteresis:
  // Triggers at >= 98.90% and maintains until level falls below 97.50%
  if (currentWaterLevel >= 98.90) {
    continuousBuzzer = true;
  } else if (continuousBuzzer && currentWaterLevel < 97.50) {
    continuousBuzzer = false;
  }

  // Active buzzer when continuous full alarm triggers OR critical level (>95%)
  bool shouldSound = continuousBuzzer || (currentWaterLevel > 95.0);
  buzzerPinState = shouldSound;
  digitalWrite(PIN_BUZZER, shouldSound ? HIGH : LOW);
}

void broadcastLiveTelemetry() {
  if (isSensorAbsent) {
    // Exact Arduino message: SENSOR:ABSENT
    Serial.println(F("SENSOR:ABSENT"));
    btSerial.println(F("SENSOR:ABSENT"));
  } else {
    // Exact Arduino message: DISTANCE:2.74,LEVEL:97.2
    String line = F("DISTANCE:");
    line += String(currentDistanceCm, 2);
    line += F(",LEVEL:");
    line += String(currentWaterLevel, 1);

    Serial.println(line);
    btSerial.println(line);
  }
}

void sendCalibrationReport() {
  // Exact Arduino message: CALIBRATION:EMPTY=14.00,FULL=2.42
  String report = F("CALIBRATION:EMPTY=");
  report += String(calEmptyDistanceCm, 2);
  report += F(",FULL=");
  report += String(calFullDistanceCm, 2);

  Serial.println(report);
  btSerial.println(report);
}

void sendAck(const String &cmd, const String &status) {
  // Exact format: ACK:CAL_EMPTY:OK, ACK:CAL_EMPTY:ERROR, ACK:CAL_FULL:OK, ACK:CAL_FULL:ERROR
  String ack = F("ACK:");
  ack += cmd;
  ack += F(":");
  ack += status;

  Serial.println(ack);
  btSerial.println(ack);
}

void processLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line.equalsIgnoreCase("CAL_EMPTY")) {
    readUltrasonicSensor();
    if (!isSensorAbsent && currentDistanceCm >= 2.0 && currentDistanceCm <= 400.0) {
      calEmptyDistanceCm = currentDistanceCm;
      saveCalibrationToEEPROM();
      computeWaterAndBuzzer();
      sendAck(F("CAL_EMPTY"), F("OK"));
      sendCalibrationReport();
    } else {
      sendAck(F("CAL_EMPTY"), F("ERROR"));
    }
  }
  else if (line.equalsIgnoreCase("CAL_FULL")) {
    readUltrasonicSensor();
    if (!isSensorAbsent && currentDistanceCm >= 1.5 && currentDistanceCm < calEmptyDistanceCm) {
      calFullDistanceCm = currentDistanceCm;
      saveCalibrationToEEPROM();
      computeWaterAndBuzzer();
      sendAck(F("CAL_FULL"), F("OK"));
      sendCalibrationReport();
    } else {
      sendAck(F("CAL_FULL"), F("ERROR"));
    }
  }
  else if (line.equalsIgnoreCase("STATUS")) {
    sendCalibrationReport();
    readUltrasonicSensor();
    computeWaterAndBuzzer();
    broadcastLiveTelemetry();
  }
}

void loadCalibrationFromEEPROM() {
  uint8_t magic = EEPROM.read(EEPROM_ADDR_MAGIC);
  if (magic == 0x48) { // 'H'
    EEPROM.get(EEPROM_ADDR_CAL_EMPTY, calEmptyDistanceCm);
    EEPROM.get(EEPROM_ADDR_CAL_FULL, calFullDistanceCm);

    if (calEmptyDistanceCm < 3.0 || calEmptyDistanceCm > 400.0) calEmptyDistanceCm = 14.00;
    if (calFullDistanceCm < 1.0 || calFullDistanceCm >= calEmptyDistanceCm) calFullDistanceCm = 2.42;
  } else {
    calEmptyDistanceCm = 14.00;
    calFullDistanceCm  = 2.42;
    saveCalibrationToEEPROM();
  }
}

void saveCalibrationToEEPROM() {
  EEPROM.update(EEPROM_ADDR_MAGIC, 0x48);
  EEPROM.put(EEPROM_ADDR_CAL_EMPTY, calEmptyDistanceCm);
  EEPROM.put(EEPROM_ADDR_CAL_FULL, calFullDistanceCm);
}
`;
