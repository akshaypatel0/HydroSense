/*
 * ==============================================================================
 * HydroSense – Smart Water Monitor
 * Arduino Authoritative Hardware Firmware
 * Firmware Version: 3.1.0 (Dedicated Water Monitoring Release)
 * Target Hardware: Arduino Uno / Nano / Mega 2560
 * Baud Rate: 9600 baud
 * ==============================================================================
 * 
 * CORE PRINCIPLE:
 * Arduino is the single source of truth. All calibration, water percentage,
 * safety cutoffs, buzzer alarms, and operational statuses (EMPTY, LOW, NORMAL,
 * TARGET REACHED, HIGH, CRITICAL) are calculated directly on this microcontroller.
 * 
 * NOTE: The water pump/motor has been completely removed. This firmware is
 * dedicated strictly to water-level monitoring, acoustic calibration, and
 * safety buzzer alarms.
 * 
 * SUPPORTED COMMANDS (newline-terminated '\n'):
 * - TARGET:n         : Set target water percentage (10 - 95%)
 * - CUTOFF:n         : Set safety buzzer cutoff percentage (50 - 100%)
 * - CAL_EMPTY        : Calibrate 0% empty point from current sensor distance
 * - CAL_FULL         : Calibrate 100% full point from current sensor distance
 * - STATUS           : Request immediate status telemetry packet
 * 
 * TELEMETRY FORMAT:
 * STATUS,water=45.2,status=NORMAL,target=80,cutoff=90,buzzer=OFF,error=NONE,cal=OK,empty=12.8,full=2.1,distance=7.45
 * 
 * ACK FORMAT:
 * ACK:CAL_EMPTY:OK | ACK:CAL_FULL:OK | ACK:TARGET:OK | ACK:CUTOFF:OK
 * 
 * HARDWARE PIN CONNECTIONS:
 * 1. HC-SR04 Ultrasonic Distance Sensor:
 *    - VCC  -> Arduino 5V
 *    - GND  -> Arduino GND
 *    - TRIG -> Pin 9
 *    - ECHO -> Pin 10
 * 
 * 2. HC-05 Bluetooth Classic Module:
 *    - VCC  -> Arduino 5V
 *    - GND  -> Arduino GND
 *    - TXD  -> Arduino Pin 2 (SoftwareSerial RX)
 *    - RXD  -> Arduino Pin 3 (SoftwareSerial TX, via 1k/2k resistor divider)
 * 
 * 3. Active Alarm Buzzer:
 *    - POS (+) -> Pin 8
 *    - NEG (-) -> Arduino GND
 * 
 * 4. Heartbeat Status LED:
 *    - Pin 13 (Built-in LED)
 * ==============================================================================
 */

#include <SoftwareSerial.h>
#include <EEPROM.h>

// --- PIN DEFINITIONS ---
const uint8_t PIN_BT_RX   = 2;   // Connect to HC-05 TXD
const uint8_t PIN_BT_TX   = 3;   // Connect to HC-05 RXD (via resistor divider)
const uint8_t PIN_BUZZER  = 8;   // Audio Alarm Buzzer
const uint8_t PIN_TRIG    = 9;   // Ultrasonic Trigger
const uint8_t PIN_ECHO    = 10;  // Ultrasonic Echo
const uint8_t PIN_LED     = 13;  // Onboard Heartbeat LED

// --- CONFIGURATION CONSTANTS ---
const unsigned long TELEMETRY_INTERVAL_MS = 1000; // Broadcast state every 1 sec
const unsigned long SENSOR_TIMEOUT_MICROS  = 30000;// 30ms timeout (~5m max distance)

// EEPROM Storage Addresses
const int EEPROM_ADDR_MAGIC     = 0;  // Magic byte 0x4A ('J' for v3.1)
const int EEPROM_ADDR_TARGET    = 1;  // Stored target percentage (0-100)
const int EEPROM_ADDR_CUTOFF    = 2;  // Stored cutoff percentage (0-100)
const int EEPROM_ADDR_CAL_EMPTY = 10; // Stored float: Empty distance (cm)
const int EEPROM_ADDR_CAL_FULL  = 14; // Stored float: Full distance (cm)

// --- SYSTEM STATE ---
SoftwareSerial btSerial(PIN_BT_RX, PIN_BT_TX);

// Calibrated distances (loaded from EEPROM or defaults: 12.8 cm empty, 2.1 cm full)
float calEmptyDistanceCm = 12.8;
float calFullDistanceCm  = 2.1;

float currentDistanceCm = 12.8;
float currentWaterLevel = 0.0;
int   targetLevel       = 80;    // Target water %
int   cutoffLevel       = 90;    // Safety buzzer cutoff %
bool  buzzerActive      = false;
String lastErrorCode    = "NONE";
String waterStatus      = "EMPTY"; // EMPTY, LOW, NORMAL, TARGET REACHED, HIGH, CRITICAL

unsigned long lastTelemetryTime = 0;
String serialBuffer = "";
String btBuffer = "";
uint8_t consecutiveErrors = 0;

// Forward Declarations
void readSensors();
void calculateWaterMetrics();
void evaluateSafetyLogic();
void broadcastStatus();
void processCommand(String cmd, Stream &replyStream);
void setBuzzer(bool state);
void sendAck(const String &cmd, const String &status, const String &reason = "");
void loadSettings();
void saveSettings();

void setup() {
  // Initialize Hardware USB Serial
  Serial.begin(9600);
  while (!Serial && millis() < 1000) { ; } // Brief wait for Leonardo / Micro if used

  // Initialize SoftwareSerial for HC-05 Bluetooth
  btSerial.begin(9600);

  // Initialize GPIO Pins
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);

  digitalWrite(PIN_TRIG, LOW);
  setBuzzer(false);
  digitalWrite(PIN_LED, HIGH);

  // Load Calibration & Configuration from EEPROM
  loadSettings();

  // Initial sensor warm-up
  readSensors();
  calculateWaterMetrics();
  evaluateSafetyLogic();

  // Startup indication (short chirp)
  setBuzzer(true);
  delay(60);
  setBuzzer(false);

  // Broadcast initial boot status
  broadcastStatus();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Process Hardware USB Serial Commands
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        processCommand(serialBuffer, Serial);
        serialBuffer = "";
      }
    } else if (serialBuffer.length() < 60) {
      serialBuffer += c;
    }
  }

  // 2. Process Bluetooth HC-05 Serial Commands
  while (btSerial.available() > 0) {
    char c = (char)btSerial.read();
    if (c == '\n' || c == '\r') {
      if (btBuffer.length() > 0) {
        processCommand(btBuffer, btSerial);
        btBuffer = "";
      }
    } else if (btBuffer.length() < 60) {
      btBuffer += c;
    }
  }

  // 3. Periodic Sensor Reading & Telemetry Broadcast (every 1000ms)
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;

    readSensors();
    calculateWaterMetrics();
    evaluateSafetyLogic();
    broadcastStatus();

    // Toggle Heartbeat LED
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }
}

// --- SENSOR ACQUISITION ---
void readSensors() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, SENSOR_TIMEOUT_MICROS);

  if (duration == 0) {
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      lastErrorCode = "SENSOR_TIMEOUT";
    }
    return;
  }

  float rawDist = (float)duration / 58.2;

  if (rawDist < 1.0 || rawDist > 400.0) {
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      lastErrorCode = "OUT_OF_BOUNDS";
    }
    return;
  }

  consecutiveErrors = 0;
  lastErrorCode = "NONE";
  currentDistanceCm = rawDist;
}

// --- ARDUINO IS AUTHORITATIVE: WATER & STATUS CALCULATION ---
void calculateWaterMetrics() {
  // Usable height range: Empty Distance - Full Distance
  float usableHeight = calEmptyDistanceCm - calFullDistanceCm;
  if (usableHeight <= 0.5) usableHeight = 10.7; // Safety default fallback (12.8 - 2.1 = 10.7)

  // Effective water height from bottom
  float effectiveWaterHeight = calEmptyDistanceCm - currentDistanceCm;

  float pct = (effectiveWaterHeight / usableHeight) * 100.0;
  if (pct < 0.0) pct = 0.0;
  if (pct > 100.0) pct = 100.0;
  currentWaterLevel = pct;

  // Authoritative Status Category
  if (lastErrorCode != "NONE") {
    waterStatus = "SENSOR_ERROR";
  } else if (currentWaterLevel <= 10.0) {
    waterStatus = "EMPTY";
  } else if (currentWaterLevel <= 25.0) {
    waterStatus = "LOW";
  } else if (currentWaterLevel >= cutoffLevel) {
    waterStatus = "CRITICAL";
  } else if (currentWaterLevel >= (cutoffLevel - 5.0)) {
    waterStatus = "HIGH";
  } else if (currentWaterLevel >= targetLevel) {
    waterStatus = "TARGET REACHED";
  } else {
    waterStatus = "NORMAL";
  }
}

// --- SAFETY BUZZER INTERLOCK ---
void evaluateSafetyLogic() {
  // CRITICAL HIGH-WATER OVERFLOW ALARM:
  if (lastErrorCode == "NONE" && currentWaterLevel >= cutoffLevel) {
    setBuzzer(true);
  } else {
    if (buzzerActive && currentWaterLevel < cutoffLevel) {
      setBuzzer(false);
    }
  }
}

// --- COMMAND PROCESSOR ---
void processCommand(String cmd, Stream &replyStream) {
  cmd.trim();
  if (cmd.length() == 0) return;

  // 1. TARGET WATER LEVEL (TARGET:n)
  if (cmd.startsWith("TARGET:") || cmd.startsWith("target:")) {
    int val = cmd.substring(7).toInt();
    if (val >= 10 && val <= 95) {
      targetLevel = val;
      saveSettings();
      sendAck("TARGET", "OK");
    } else {
      sendAck("TARGET", "REJECTED", "RANGE_10_95");
    }
    broadcastStatus();
  }

  // 2. CUTOFF LEVEL (CUTOFF:n)
  else if (cmd.startsWith("CUTOFF:") || cmd.startsWith("cutoff:")) {
    int val = cmd.substring(7).toInt();
    if (val >= 50 && val <= 100) {
      cutoffLevel = val;
      saveSettings();
      sendAck("CUTOFF", "OK");
    } else {
      sendAck("CUTOFF", "REJECTED", "RANGE_50_100");
    }
    broadcastStatus();
  }

  // 3. CALIBRATE EMPTY POINT (CAL_EMPTY)
  // Takes current sensor distance as the 0% empty calibration point
  else if (cmd.equalsIgnoreCase("CAL_EMPTY")) {
    readSensors();
    if (lastErrorCode == "NONE" && currentDistanceCm >= 2.0 && currentDistanceCm <= 400.0) {
      calEmptyDistanceCm = currentDistanceCm;
      saveSettings();
      calculateWaterMetrics();
      sendAck("CAL_EMPTY", "OK");
    } else {
      sendAck("CAL_EMPTY", "REJECTED", "SENSOR_INVALID");
    }
    broadcastStatus();
  }

  // 4. CALIBRATE FULL POINT (CAL_FULL)
  // Takes current sensor distance as the 100% full calibration point
  else if (cmd.equalsIgnoreCase("CAL_FULL")) {
    readSensors();
    if (lastErrorCode == "NONE" && currentDistanceCm >= 1.0 && currentDistanceCm < calEmptyDistanceCm) {
      calFullDistanceCm = currentDistanceCm;
      saveSettings();
      calculateWaterMetrics();
      sendAck("CAL_FULL", "OK");
    } else {
      String reason = (currentDistanceCm >= calEmptyDistanceCm) ? "FULL_MUST_BE_LESS_THAN_EMPTY" : "SENSOR_INVALID";
      sendAck("CAL_FULL", "REJECTED", reason);
    }
    broadcastStatus();
  }

  // 5. STATUS QUERY
  else if (cmd.equalsIgnoreCase("STATUS")) {
    broadcastStatus();
  }
}

void setBuzzer(bool state) {
  buzzerActive = state;
  digitalWrite(PIN_BUZZER, state ? HIGH : LOW);
}

// --- ACK SENDER ---
void sendAck(const String &cmd, const String &status, const String &reason) {
  String out = F("ACK:");
  out += cmd;
  out += F(":");
  out += status;
  if (reason.length() > 0) {
    out += F(":");
    out += reason;
  }
  Serial.println(out);
  btSerial.println(out);
}

// --- TELEMETRY BROADCAST ---
void broadcastStatus() {
  String out = F("STATUS,water=");
  out += String(currentWaterLevel, 1);
  out += F(",status=");
  out += waterStatus;
  out += F(",target=");
  out += String(targetLevel);
  out += F(",cutoff=");
  out += String(cutoffLevel);
  out += F(",buzzer=");
  out += buzzerActive ? F("ON") : F("OFF");
  out += F(",error=");
  out += lastErrorCode;
  out += F(",cal=OK");
  out += F(",empty=");
  out += String(calEmptyDistanceCm, 1);
  out += F(",full=");
  out += String(calFullDistanceCm, 1);
  out += F(",distance=");
  out += String(currentDistanceCm, 2);

  Serial.println(out);
  btSerial.println(out);
}

// --- EEPROM PERSISTENCE ---
void loadSettings() {
  uint8_t magic = EEPROM.read(EEPROM_ADDR_MAGIC);
  if (magic == 0x4A) { // 'J'
    targetLevel = EEPROM.read(EEPROM_ADDR_TARGET);
    cutoffLevel = EEPROM.read(EEPROM_ADDR_CUTOFF);
    EEPROM.get(EEPROM_ADDR_CAL_EMPTY, calEmptyDistanceCm);
    EEPROM.get(EEPROM_ADDR_CAL_FULL, calFullDistanceCm);

    // Sanity bounds check on loaded calibration
    if (targetLevel < 10 || targetLevel > 95) targetLevel = 80;
    if (cutoffLevel < 50 || cutoffLevel > 100) cutoffLevel = 90;
    if (calEmptyDistanceCm < 3.0 || calEmptyDistanceCm > 300.0) calEmptyDistanceCm = 12.8;
    if (calFullDistanceCm < 0.5 || calFullDistanceCm >= calEmptyDistanceCm) calFullDistanceCm = 2.1;
  } else {
    // Factory defaults
    targetLevel = 80;
    cutoffLevel = 90;
    calEmptyDistanceCm = 12.8;
    calFullDistanceCm = 2.1;
    saveSettings();
  }
}

void saveSettings() {
  EEPROM.update(EEPROM_ADDR_MAGIC, 0x4A);
  EEPROM.update(EEPROM_ADDR_TARGET, (uint8_t)targetLevel);
  EEPROM.update(EEPROM_ADDR_CUTOFF, (uint8_t)cutoffLevel);
  EEPROM.put(EEPROM_ADDR_CAL_EMPTY, calEmptyDistanceCm);
  EEPROM.put(EEPROM_ADDR_CAL_FULL, calFullDistanceCm);
}
