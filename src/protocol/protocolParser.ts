/**
 * HydroSense – Arduino Protocol Parser & Stream Accumulator
 *
 * Implements the exact Arduino Uno + HC-05 Bluetooth Classic SPP communication at 9600 baud.
 *
 * 1. Live Telemetry from Arduino:
 *    DISTANCE:13.38,LEVEL:0.0,MOTOR:OFF
 *    DISTANCE:8.25,LEVEL:48.9,MOTOR:OFF
 *    DISTANCE:3.07,LEVEL:93.9,MOTOR:ON
 *
 * 2. Sensor Errors:
 *    SENSOR:ABSENT -> 🔴 SENSOR ERROR: No ultrasonic echo detected.
 *    SENSOR:OUT_OF_RANGE,DISTANCE:24.28 -> ⚠️ SENSOR OUT OF RANGE: Check ultrasonic sensor position.
 *
 * 3. Motor Acknowledgements:
 *    ACK:MOTOR_ON:OK -> Motor started successfully.
 *    ACK:MOTOR_OFF:OK -> Motor stopped.
 *    ACK:CAL_EMPTY:OK / ACK:CAL_EMPTY:ERROR
 *    ACK:CAL_FULL:OK / ACK:CAL_FULL:ERROR
 *
 * 4. Auto Events:
 *    AUTO:MOTOR_ON -> 🟢 AUTO FILLING
 *    AUTO:MOTOR_OFF:TARGET_REACHED -> 🟢 TARGET REACHED
 *    AUTO:MOTOR_OFF:SENSOR_INVALID -> 🔴 MOTOR STOPPED: Sensor invalid.
 *    AUTO:MOTOR_OFF:SAFETY_LIMIT -> ⚠️ SAFETY LIMIT REACHED: Motor stopped.
 *    AUTO:MOTOR_OFF:RUNTIME_TIMEOUT -> ⚠️ MAXIMUM RUNTIME REACHED: Motor stopped.
 *
 * 5. Outgoing Commands (always newline terminated):
 *    MOTOR_ON\n
 *    MOTOR_OFF\n
 *    MODE:AUTO\n
 *    MODE:MANUAL\n
 *    AUTO_START:10\n
 *    AUTO_TARGET:80\n
 *    CAL_EMPTY\n
 *    CAL_FULL\n
 *    STATUS\n
 */

import {
  AlarmState,
  CalibrationStatus,
  ControlMode,
  MotorState,
  OutgoingCommand,
  TelemetryData,
  WaterLevelStatus,
} from '../types';

export interface ParseResult {
  telemetry: TelemetryData | null;
  ack?: {
    command: string;
    status: 'OK' | 'ERROR' | 'REJECTED';
    message?: string;
    reason?: string;
  };
  autoEvent?: {
    type: string;
    message: string;
    motorState?: MotorState;
    severity: 'info' | 'warning' | 'critical';
  };
  calibrationUpdate?: {
    calEmpty: number;
    calFull: number;
  };
  modeUpdate?: ControlMode;
  isSystemNotice?: boolean;
  message?: string;
  error?: string;
  raw: string;
}

/**
 * ProtocolStreamAccumulator
 * Assembles continuous streaming serial/bluetooth byte chunks into complete newline-delimited lines.
 */
export class ProtocolStreamAccumulator {
  private buffer: string = '';
  private readonly maxBufferSize: number = 8192;

  public pushChunk(chunk: string): string[] {
    this.buffer += chunk;

    // Ring-buffer trim if buffer exceeds limit
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(-2048);
    }

    const lines: string[] = [];
    let newlineIndex: number;

    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }

      line = line.trim();
      if (line.length > 0) {
        lines.push(line);
      }
    }

    return lines;
  }

  public reset(): void {
    this.buffer = '';
  }

  public getBufferedRemainder(): string {
    return this.buffer;
  }
}

/**
 * Ensures all outgoing commands strictly end with \n
 */
export function formatCommand(command: OutgoingCommand | string): string {
  const trimmed = command.trim();
  return `${trimmed}\n`;
}

/**
 * Derives status and safety limit indicators from water level
 */
export function deriveWaterStatus(
  water: number | null,
  isSensorUnavailable = false
): {
  status: WaterLevelStatus;
  buzzer: AlarmState;
  isTankFull: boolean;
} {
  if (isSensorUnavailable || water === null) {
    return {
      status: 'SENSOR_ERROR',
      buzzer: 'OFF',
      isTankFull: false,
    };
  }

  const isTankFull = water >= 95.0;
  const buzzer: AlarmState = water >= 95.0 ? 'ON' : 'OFF';

  let status: WaterLevelStatus;
  if (water >= 95.0) {
    status = 'CRITICAL';
  } else if (water > 80.0) {
    status = 'HIGH';
  } else if (water <= 25.0) {
    status = 'LOW';
  } else {
    status = 'NORMAL';
  }

  return {
    status,
    buzzer,
    isTankFull,
  };
}

/**
 * Parses an incoming line string from the Arduino HC-05 stream
 */
export function parseStatusLine(
  rawLine: string,
  lastKnown?: TelemetryData | null
): ParseResult {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return { telemetry: null, raw: rawLine };
  }

  const upper = trimmed.toUpperCase();

  // 1. SENSOR ERRORS
  // "SENSOR:ABSENT"
  if (upper.startsWith('SENSOR:ABSENT')) {
    const errorTelemetry: TelemetryData = {
      water: null,
      isSensorUnavailable: true,
      status: 'SENSOR_ERROR',
      motor: lastKnown?.motor ?? 'OFF',
      mode: lastKnown?.mode ?? 'MANUAL',
      autoStart: lastKnown?.autoStart ?? 10,
      autoTarget: lastKnown?.autoTarget ?? 80,
      target: lastKnown?.target ?? 80,
      cutoff: 95,
      buzzer: 'OFF',
      error: 'SENSOR_ABSENT',
      sensorErrorDetail: 'No ultrasonic echo detected.',
      calStatus: lastKnown?.calStatus ?? 'OK',
      calEmpty: lastKnown?.calEmpty ?? 13.02,
      calFull: lastKnown?.calFull ?? 2.42,
      distance: undefined,
      timestamp: Date.now(),
      rawLine: trimmed,
    };
    return {
      telemetry: errorTelemetry,
      error: '🔴 SENSOR ERROR: No ultrasonic echo detected.',
      raw: trimmed,
    };
  }

  // "SENSOR:OUT_OF_RANGE,DISTANCE:24.28" or "SENSOR:OUT_OF_RANGE"
  if (upper.startsWith('SENSOR:OUT_OF_RANGE')) {
    const distMatch = trimmed.match(/DISTANCE:\s*([+-]?[\d.]+)/i);
    const rawDist = distMatch ? parseFloat(distMatch[1]) : undefined;
    const errorTelemetry: TelemetryData = {
      water: null,
      isSensorUnavailable: true,
      status: 'SENSOR_ERROR',
      motor: lastKnown?.motor ?? 'OFF',
      mode: lastKnown?.mode ?? 'MANUAL',
      autoStart: lastKnown?.autoStart ?? 10,
      autoTarget: lastKnown?.autoTarget ?? 80,
      target: lastKnown?.target ?? 80,
      cutoff: 95,
      buzzer: 'OFF',
      error: 'SENSOR_OUT_OF_RANGE',
      sensorErrorDetail: 'Check ultrasonic sensor position.',
      calStatus: lastKnown?.calStatus ?? 'OK',
      calEmpty: lastKnown?.calEmpty ?? 13.02,
      calFull: lastKnown?.calFull ?? 2.42,
      distance: rawDist,
      timestamp: Date.now(),
      rawLine: trimmed,
    };
    return {
      telemetry: errorTelemetry,
      error: '⚠️ SENSOR OUT OF RANGE: Check ultrasonic sensor position.',
      raw: trimmed,
    };
  }

  // 2. MOTOR ACKNOWLEDGEMENTS
  if (upper.startsWith('ACK:MOTOR_ON:OK')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'ON', timestamp: Date.now() } : null,
      ack: { command: 'MOTOR_ON', status: 'OK', message: 'Motor started successfully.' },
      raw: trimmed,
    };
  }
  if (upper.startsWith('ACK:MOTOR_OFF:OK')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'OFF', timestamp: Date.now() } : null,
      ack: { command: 'MOTOR_OFF', status: 'OK', message: 'Motor stopped.' },
      raw: trimmed,
    };
  }
  if (upper.startsWith('ACK:MOTOR_ON:ERROR') || upper.startsWith('ACK:MOTOR_OFF:ERROR')) {
    const isStart = upper.includes('MOTOR_ON');
    return {
      telemetry: null,
      ack: {
        command: isStart ? 'MOTOR_ON' : 'MOTOR_OFF',
        status: 'ERROR',
        message: isStart ? 'Failed to start motor (safety limit or sensor error).' : 'Failed to stop motor.',
      },
      raw: trimmed,
    };
  }

  // 3. CALIBRATION ACKNOWLEDGEMENTS
  if (upper.startsWith('ACK:CAL_EMPTY:OK')) {
    return {
      telemetry: null,
      ack: { command: 'CAL_EMPTY', status: 'OK', message: 'Empty tank calibration saved to Arduino EEPROM.' },
      raw: trimmed,
    };
  }
  if (upper.startsWith('ACK:CAL_EMPTY:ERROR')) {
    return {
      telemetry: null,
      ack: { command: 'CAL_EMPTY', status: 'ERROR', message: 'Calibration failed. Check sensor position and water level.' },
      raw: trimmed,
    };
  }
  if (upper.startsWith('ACK:CAL_FULL:OK')) {
    return {
      telemetry: null,
      ack: { command: 'CAL_FULL', status: 'OK', message: 'Full tank calibration saved to Arduino EEPROM.' },
      raw: trimmed,
    };
  }
  if (upper.startsWith('ACK:CAL_FULL:ERROR')) {
    return {
      telemetry: null,
      ack: { command: 'CAL_FULL', status: 'ERROR', message: 'Calibration failed. Check sensor position and water level.' },
      raw: trimmed,
    };
  }

  // 4. AUTO EVENTS
  if (upper.startsWith('AUTO:MOTOR_ON')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'ON', mode: 'AUTO', timestamp: Date.now() } : null,
      autoEvent: {
        type: 'AUTO_START',
        message: '🟢 AUTO FILLING',
        motorState: 'ON',
        severity: 'info',
      },
      raw: trimmed,
    };
  }
  if (upper.startsWith('AUTO:MOTOR_OFF:TARGET_REACHED')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'OFF', mode: 'AUTO', timestamp: Date.now() } : null,
      autoEvent: {
        type: 'TARGET_REACHED',
        message: '🟢 TARGET REACHED',
        motorState: 'OFF',
        severity: 'info',
      },
      raw: trimmed,
    };
  }
  if (upper.startsWith('AUTO:MOTOR_OFF:SENSOR_INVALID')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'OFF', timestamp: Date.now() } : null,
      autoEvent: {
        type: 'SENSOR_INVALID',
        message: '🔴 MOTOR STOPPED: Sensor invalid.',
        motorState: 'OFF',
        severity: 'critical',
      },
      raw: trimmed,
    };
  }
  if (upper.startsWith('AUTO:MOTOR_OFF:SAFETY_LIMIT')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'OFF', timestamp: Date.now() } : null,
      autoEvent: {
        type: 'SAFETY_LIMIT',
        message: '⚠️ SAFETY LIMIT REACHED: Motor stopped.',
        motorState: 'OFF',
        severity: 'warning',
      },
      raw: trimmed,
    };
  }
  if (upper.startsWith('AUTO:MOTOR_OFF:RUNTIME_TIMEOUT')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, motor: 'OFF', timestamp: Date.now() } : null,
      autoEvent: {
        type: 'RUNTIME_TIMEOUT',
        message: '⚠️ MAXIMUM RUNTIME REACHED: Motor stopped.',
        motorState: 'OFF',
        severity: 'warning',
      },
      raw: trimmed,
    };
  }

  // 5. CALIBRATION VALUES REPORT (e.g. "CALIBRATION:EMPTY=13.02,FULL=2.42")
  const calRegex = /^CALIBRATION:\s*EMPTY\s*=\s*([\d.]+)\s*,\s*FULL\s*=\s*([\d.]+)/i;
  const calMatch = trimmed.match(calRegex);
  if (calMatch) {
    const calEmpty = parseFloat(calMatch[1]);
    const calFull = parseFloat(calMatch[2]);
    if (!isNaN(calEmpty) && !isNaN(calFull)) {
      return {
        telemetry: null,
        calibrationUpdate: { calEmpty, calFull },
        isSystemNotice: true,
        message: `Calibration reported: Empty=${calEmpty.toFixed(2)} cm, Full=${calFull.toFixed(2)} cm`,
        raw: trimmed,
      };
    }
  }

  // 6. MODE CONFIRMATION (e.g. "MODE:AUTO" or "MODE:MANUAL")
  if (upper === 'MODE:AUTO' || upper.startsWith('MODE:AUTO')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, mode: 'AUTO' } : null,
      modeUpdate: 'AUTO',
      message: 'Mode set to AUTO',
      raw: trimmed,
    };
  }
  if (upper === 'MODE:MANUAL' || upper.startsWith('MODE:MANUAL')) {
    return {
      telemetry: lastKnown ? { ...lastKnown, mode: 'MANUAL' } : null,
      modeUpdate: 'MANUAL',
      message: 'Mode set to MANUAL',
      raw: trimmed,
    };
  }

  // 7. PRIMARY ARDUINO DATA PACKET:
  // e.g.:
  // DISTANCE:13.38,LEVEL:0.0,MOTOR:OFF
  // DISTANCE:8.25,LEVEL:48.9,MOTOR:OFF
  // DISTANCE:3.07,LEVEL:93.9,MOTOR:ON
  const distMatch = trimmed.match(/DISTANCE:\s*([+-]?[\d.]+)/i);
  const levelMatch = trimmed.match(/LEVEL:\s*([+-]?[\d.]+)/i);
  const motorMatch = trimmed.match(/MOTOR:\s*(ON|OFF)/i);
  const modeMatch = trimmed.match(/MODE:\s*(AUTO|MANUAL)/i);
  const startMatch = trimmed.match(/START:\s*([\d.]+)/i);
  const targetMatch = trimmed.match(/TARGET:\s*([\d.]+)/i);

  if (levelMatch) {
    const rawWater = parseFloat(levelMatch[1]);
    const rawDist = distMatch ? parseFloat(distMatch[1]) : undefined;
    const motorStatus: MotorState = motorMatch
      ? (motorMatch[1].toUpperCase() as MotorState)
      : (lastKnown?.motor ?? 'OFF');
    const controlMode: ControlMode = modeMatch
      ? (modeMatch[1].toUpperCase() as ControlMode)
      : (lastKnown?.mode ?? 'AUTO');
    const autoStart = startMatch ? parseFloat(startMatch[1]) : (lastKnown?.autoStart ?? 10);
    const autoTarget = targetMatch ? parseFloat(targetMatch[1]) : (lastKnown?.autoTarget ?? 80);

    if (!isNaN(rawWater) && isFinite(rawWater) && rawWater >= 0 && rawWater <= 100) {
      const water = Math.min(100, Math.max(0, Math.round(rawWater * 10) / 10));
      const distance = rawDist !== undefined && !isNaN(rawDist) ? Math.round(rawDist * 100) / 100 : undefined;
      const evaluated = deriveWaterStatus(water, false);

      const telemetry: TelemetryData = {
        water,
        status: evaluated.status,
        isTankFull: evaluated.isTankFull,
        motor: motorStatus,
        mode: controlMode,
        autoStart,
        autoTarget,
        target: autoTarget,
        cutoff: 95,
        buzzer: evaluated.buzzer,
        error: 'NONE',
        isSensorUnavailable: false,
        calStatus: lastKnown?.calStatus ?? 'OK',
        calEmpty: lastKnown?.calEmpty ?? 13.02,
        calFull: lastKnown?.calFull ?? 2.42,
        distance,
        timestamp: Date.now(),
        rawLine: trimmed,
      };

      return { telemetry, raw: trimmed };
    }
  }

  // 8. Dual-connectivity USB line fallback (e.g. "Distance: 8.25 cm | Water Level: 48.9%")
  const humanUsbRegex = /Distance:\s*([\d.]+)\s*(?:cm)?\s*\|\s*Water\s*Level:\s*([\d.]+)%?/i;
  const humanMatch = trimmed.match(humanUsbRegex);
  if (humanMatch) {
    const rawDist = parseFloat(humanMatch[1]);
    const rawWater = parseFloat(humanMatch[2]);
    if (!isNaN(rawWater) && isFinite(rawWater)) {
      const water = Math.min(100, Math.max(0, Math.round(rawWater * 10) / 10));
      const distance = !isNaN(rawDist) ? Math.round(rawDist * 100) / 100 : undefined;
      const evaluated = deriveWaterStatus(water, false);

      const telemetry: TelemetryData = {
        water,
        status: evaluated.status,
        isTankFull: evaluated.isTankFull,
        motor: lastKnown?.motor ?? 'OFF',
        mode: lastKnown?.mode ?? 'AUTO',
        autoStart: lastKnown?.autoStart ?? 10,
        autoTarget: lastKnown?.autoTarget ?? 80,
        target: lastKnown?.target ?? 80,
        cutoff: 95,
        buzzer: evaluated.buzzer,
        error: 'NONE',
        isSensorUnavailable: false,
        calStatus: lastKnown?.calStatus ?? 'OK',
        calEmpty: lastKnown?.calEmpty ?? 13.02,
        calFull: lastKnown?.calFull ?? 2.42,
        distance,
        timestamp: Date.now(),
        rawLine: trimmed,
      };

      return { telemetry, raw: trimmed };
    }
  }

  return { telemetry: null, raw: trimmed };
}

export interface ProtocolTestResult {
  name: string;
  passed: boolean;
  actual: string;
  inputDescription?: string;
}

export function runProtocolSelfTests(): ProtocolTestResult[] {
  const results: ProtocolTestResult[] = [];

  // Test 1: Standard Bluetooth SPP packet
  const t1 = parseStatusLine('DISTANCE:8.25,LEVEL:48.9,MOTOR:OFF');
  results.push({
    name: 'SPP Live Telemetry: 48.9%, Motor OFF',
    passed: t1.telemetry?.water === 48.9 && t1.telemetry?.motor === 'OFF' && t1.telemetry?.distance === 8.25,
    actual: `water=${t1.telemetry?.water}%, motor=${t1.telemetry?.motor}, dist=${t1.telemetry?.distance}cm`,
  });

  // Test 2: Motor ON telemetry
  const t2 = parseStatusLine('DISTANCE:3.07,LEVEL:93.9,MOTOR:ON');
  results.push({
    name: 'Motor ON packet: 93.9%',
    passed: t2.telemetry?.water === 93.9 && t2.telemetry?.motor === 'ON',
    actual: `water=${t2.telemetry?.water}%, motor=${t2.telemetry?.motor}`,
  });

  // Test 3: Sensor Absent Error
  const t3 = parseStatusLine('SENSOR:ABSENT');
  results.push({
    name: 'Sensor Absent: Flagged Unavailable',
    passed: t3.telemetry?.isSensorUnavailable === true && t3.telemetry?.water === null,
    actual: `isUnavailable=${t3.telemetry?.isSensorUnavailable}, water=${t3.telemetry?.water}`,
  });

  // Test 4: Sensor Out of Range
  const t4 = parseStatusLine('SENSOR:OUT_OF_RANGE,DISTANCE:24.28');
  results.push({
    name: 'Sensor Out of Range',
    passed: t4.telemetry?.isSensorUnavailable === true && t4.telemetry?.distance === 24.28,
    actual: `isUnavailable=${t4.telemetry?.isSensorUnavailable}, dist=${t4.telemetry?.distance}cm`,
  });

  // Test 5: Motor Acknowledgment
  const t5 = parseStatusLine('ACK:MOTOR_ON:OK');
  results.push({
    name: 'Motor ON Acknowledgement',
    passed: t5.ack?.command === 'MOTOR_ON' && t5.ack?.status === 'OK',
    actual: `ack=${t5.ack?.command}:${t5.ack?.status}`,
  });

  // Test 6: Auto Event Target Reached
  const t6 = parseStatusLine('AUTO:MOTOR_OFF:TARGET_REACHED');
  results.push({
    name: 'Auto Event Target Reached',
    passed: t6.autoEvent?.type === 'TARGET_REACHED' && t6.autoEvent?.motorState === 'OFF',
    actual: `event=${t6.autoEvent?.type}, motor=${t6.autoEvent?.motorState}`,
  });

  return results;
}
