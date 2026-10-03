/**
 * HydroSense Shared Protocol Parser & Stream Accumulator
 *
 * Implements the exact final Arduino Uno hardware protocol at 9600 baud:
 *
 * 1. Live telemetry:
 *    DISTANCE:2.74,LEVEL:97.2
 *
 * 2. Sensor unavailable:
 *    SENSOR:ABSENT
 *
 * 3. Startup:
 *    WATER TANK MONITOR READY
 *
 * 4. Calibration report:
 *    CALIBRATION:EMPTY=14.00,FULL=2.42
 *
 * 5. Command acknowledgements:
 *    ACK:CAL_EMPTY:OK
 *    ACK:CAL_EMPTY:ERROR
 *    ACK:CAL_FULL:OK
 *    ACK:CAL_FULL:ERROR
 *
 * 6. Dual-connectivity USB line (human-readable):
 *    Distance: 8.25 cm | Water Level: 48.9%
 */

import { AlarmState, CalibrationStatus, OutgoingCommand, TelemetryData, WaterLevelStatus } from '../types';

export interface ParseResult {
  telemetry: TelemetryData | null;
  ack?: {
    command: string;
    status: 'OK' | 'ERROR' | 'REJECTED';
    reason?: string;
  };
  calibrationUpdate?: {
    calEmpty: number;
    calFull: number;
  };
  isSystemNotice?: boolean;
  message?: string;
  error?: string;
  raw: string;
}

/**
 * ProtocolStreamAccumulator
 * Assembles continuous streaming serial/bluetooth byte chunks into complete newline-delimited lines.
 * Robust against fragmentation across chunk boundaries, multiple lines per chunk,
 * and CRLF / LF line delimiters.
 */
export class ProtocolStreamAccumulator {
  private buffer: string = '';
  private readonly maxBufferSize: number = 8192;

  public pushChunk(chunk: string): string[] {
    this.buffer += chunk;

    // Safety ring-trim if buffer grows excessively without newlines
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(-2048);
    }

    const lines: string[] = [];
    let newlineIndex: number;

    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      // Strip optional carriage return '\r'
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
 * Derive authoritative status and buzzer states matching final Arduino Uno firmware:
 * - 0–90%: Normal or low-level status as appropriate (<= 25% Low, 25-90% Normal).
 * - Above 90% through 95%: High-level warning.
 * - Above 95% and below 98.90%: Critical warning.
 * - At or above 98.90%: Tank full / immediate attention.
 * - If continuous buzzer was activated, Arduino maintains it until measured level falls below 97.50%.
 */
export function deriveWaterStatus(
  water: number | null,
  isSensorUnavailable = false,
  prevContinuousOrBuzzer: boolean | AlarmState = false
): {
  status: WaterLevelStatus;
  buzzer: AlarmState;
  continuousBuzzer: boolean;
  isTankFull: boolean;
} {
  if (isSensorUnavailable || water === null) {
    return {
      status: 'SENSOR_ABSENT',
      buzzer: 'OFF',
      continuousBuzzer: false,
      isTankFull: false,
    };
  }

  const isTankFull = water >= 98.90;
  const wasContinuousActive =
    prevContinuousOrBuzzer === true || prevContinuousOrBuzzer === 'ON';

  // Hysteresis buzzer behavior:
  // Continuous buzzer triggers at >= 98.90% and remains active until level falls below 97.50%
  let continuousBuzzer = false;
  if (water >= 98.90) {
    continuousBuzzer = true;
  } else if (wasContinuousActive && water >= 97.50) {
    continuousBuzzer = true;
  } else {
    continuousBuzzer = false;
  }

  // Active buzzer when continuous full alarm triggers OR critical level (>95%)
  const buzzer: AlarmState = continuousBuzzer || water > 95.0 ? 'ON' : 'OFF';

  let status: WaterLevelStatus;
  if (water >= 98.90) {
    status = 'CRITICAL';
  } else if (water > 95.0) {
    status = 'CRITICAL';
  } else if (water > 90.0) {
    status = 'HIGH';
  } else if (water <= 25.0) {
    status = 'LOW';
  } else {
    status = 'NORMAL';
  }

  return {
    status,
    buzzer,
    continuousBuzzer,
    isTankFull,
  };
}

/**
 * Parses a single line string into Telemetry, ACK, Calibration, or System Event.
 * Ignores startup and diagnostic messages that are not relevant to dashboard.
 * Never interprets malformed data as a valid reading.
 */
export function parseStatusLine(
  rawLine: string,
  lastKnownTelemetry?: TelemetryData | null
): ParseResult {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return { telemetry: null, raw: rawLine };
  }

  // 1. SENSOR UNAVAILABLE (exact Arduino format: "SENSOR:ABSENT")
  if (trimmed.toUpperCase() === 'SENSOR:ABSENT' || trimmed.toUpperCase().startsWith('SENSOR:ABSENT')) {
    const errorTelemetry: TelemetryData = {
      water: null,
      isSensorUnavailable: true,
      status: 'SENSOR_ABSENT',
      isTankFull: false,
      target: 90,
      cutoff: 95,
      buzzer: 'OFF',
      continuousBuzzer: false,
      error: 'SENSOR:ABSENT',
      calStatus: 'OK',
      calEmpty: lastKnownTelemetry?.calEmpty ?? 14.00,
      calFull: lastKnownTelemetry?.calFull ?? 2.42,
      distance: undefined,
      timestamp: Date.now(),
      rawLine: trimmed,
    };
    return {
      telemetry: errorTelemetry,
      message: 'Sensor unavailable (SENSOR:ABSENT)',
      raw: trimmed,
    };
  }

  // 2. STARTUP MESSAGE (exact Arduino format: "WATER TANK MONITOR READY")
  if (trimmed.toUpperCase().includes('WATER TANK MONITOR READY')) {
    return {
      telemetry: null,
      isSystemNotice: true,
      message: 'WATER TANK MONITOR READY',
      raw: trimmed,
    };
  }

  // 3. CALIBRATION REPORT (exact Arduino format: "CALIBRATION:EMPTY=14.00,FULL=2.42")
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
        message: `Arduino EEPROM calibration reported: Empty = ${calEmpty.toFixed(2)} cm, Full = ${calFull.toFixed(2)} cm`,
        raw: trimmed,
      };
    }
  }

  // 4. COMMAND ACKNOWLEDGEMENTS (exact Arduino format: "ACK:CAL_EMPTY:OK", "ACK:CAL_EMPTY:ERROR", "ACK:CAL_FULL:OK", "ACK:CAL_FULL:ERROR")
  if (trimmed.startsWith('ACK:')) {
    const parts = trimmed.split(':');
    const command = parts[1] ? parts[1].toUpperCase().trim() : 'UNKNOWN';
    const statusPart = parts[2]?.toUpperCase().trim();
    const status: 'OK' | 'ERROR' | 'REJECTED' = statusPart === 'OK' ? 'OK' : 'ERROR';
    const reason = parts[3] ? parts.slice(3).join(':').trim() : undefined;

    return {
      telemetry: null,
      ack: { command, status, reason },
      raw: trimmed,
    };
  }

  // 5. LIVE DATA (exact Arduino format: "DISTANCE:2.74,LEVEL:97.2" or "LEVEL:97.2,DISTANCE:2.74")
  const btDistMatch = trimmed.match(/DISTANCE:\s*([+-]?[\d.]+)/i);
  const btLevelMatch = trimmed.match(/LEVEL:\s*([+-]?[\d.]+)/i);

  // If line claims to be distance/level telemetry, verify neither token has malformed invalid syntax
  if (trimmed.toUpperCase().includes('LEVEL:') || trimmed.toUpperCase().includes('DISTANCE:')) {
    if (btLevelMatch) {
      const rawWater = parseFloat(btLevelMatch[1]);
      const rawDist = btDistMatch ? parseFloat(btDistMatch[1]) : undefined;

      // Strict numerical validation: Never interpret malformed or out-of-range data as valid
      if (
        !isNaN(rawWater) &&
        isFinite(rawWater) &&
        rawWater >= 0 &&
        rawWater <= 100 &&
        (rawDist === undefined || (!isNaN(rawDist) && isFinite(rawDist) && rawDist >= 0))
      ) {
        const water = Math.min(100, Math.max(0, Math.round(rawWater * 10) / 10));
        const distance = rawDist !== undefined ? Math.round(rawDist * 100) / 100 : undefined;

        const prevContinuous =
          lastKnownTelemetry?.continuousBuzzer ?? (lastKnownTelemetry?.buzzer === 'ON');
        const evaluated = deriveWaterStatus(water, false, prevContinuous);

        const calEmpty = lastKnownTelemetry?.calEmpty ?? 14.00;
        const calFull = lastKnownTelemetry?.calFull ?? 2.42;

        const telemetry: TelemetryData = {
          water,
          status: evaluated.status,
          isTankFull: evaluated.isTankFull,
          target: 90,
          cutoff: 95,
          buzzer: evaluated.buzzer,
          continuousBuzzer: evaluated.continuousBuzzer,
          error: 'NONE',
          isSensorUnavailable: false,
          calStatus: 'OK',
          calEmpty,
          calFull,
          distance,
          timestamp: Date.now(),
          rawLine: trimmed,
        };

        return { telemetry, raw: trimmed };
      }
    }
  }

  // 6. USB SERIAL OUTPUT (human-readable format for dual-connectivity: "Distance: 8.25 cm | Water Level: 48.9%")
  const humanUsbRegex = /Distance:\s*([\d.]+)\s*(?:cm)?\s*\|\s*Water\s*Level:\s*([\d.]+)%?/i;
  const humanMatch = trimmed.match(humanUsbRegex);

  if (humanMatch) {
    const rawDist = parseFloat(humanMatch[1]);
    const rawWater = parseFloat(humanMatch[2]);

    if (!isNaN(rawWater) && isFinite(rawWater)) {
      const water = Math.min(100, Math.max(0, Math.round(rawWater * 10) / 10));
      const distance = !isNaN(rawDist) && isFinite(rawDist) ? rawDist : undefined;

      const prevBuzzer = lastKnownTelemetry?.buzzer ?? 'OFF';
      const evaluated = deriveWaterStatus(water, false, prevBuzzer);

      const calEmpty = lastKnownTelemetry?.calEmpty ?? 14.00;
      const calFull = lastKnownTelemetry?.calFull ?? 2.42;

      const telemetry: TelemetryData = {
        water,
        status: evaluated.status,
        isTankFull: evaluated.isTankFull,
        target: 90,
        cutoff: 95,
        buzzer: evaluated.buzzer,
        continuousBuzzer: evaluated.continuousBuzzer,
        error: 'NONE',
        isSensorUnavailable: false,
        calStatus: 'OK',
        calEmpty,
        calFull,
        distance,
        timestamp: Date.now(),
        rawLine: trimmed,
      };

      return { telemetry, raw: trimmed };
    }
  }

  // 7. KEY-VALUE TELEMETRY FALLBACK (e.g. "STATUS,water=48.9,status=NORMAL...")
  if (trimmed.includes('water=') || trimmed.toUpperCase().startsWith('STATUS,')) {
    const tokens = trimmed.toUpperCase().startsWith('STATUS,')
      ? trimmed.split(',').slice(1)
      : trimmed.split(',');

    const dict: Record<string, string> = {};
    for (const token of tokens) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const key = token.slice(0, eqIdx).trim().toLowerCase();
        const val = token.slice(eqIdx + 1).trim();
        dict[key] = val;
      }
    }

    if (dict['water'] !== undefined) {
      const rawWater = parseFloat(dict['water']);
      if (!isNaN(rawWater) && isFinite(rawWater)) {
        const water = Math.min(100, Math.max(0, Math.round(rawWater * 10) / 10));
        const prevBuzzer = lastKnownTelemetry?.buzzer ?? 'OFF';
        const evaluated = deriveWaterStatus(water, false, prevBuzzer);
        const distance = dict['distance'] !== undefined ? parseFloat(dict['distance']) : undefined;
        const calEmpty = parseFloat(dict['empty'] ?? '14.00') || 14.00;
        const calFull = parseFloat(dict['full'] ?? '2.42') || 2.42;

        const telemetry: TelemetryData = {
          water,
          status: evaluated.status,
          isTankFull: evaluated.isTankFull,
          target: 90,
          cutoff: 95,
          buzzer: evaluated.buzzer,
          continuousBuzzer: evaluated.continuousBuzzer,
          error: 'NONE',
          isSensorUnavailable: false,
          calStatus: 'OK',
          calEmpty,
          calFull,
          distance,
          timestamp: Date.now(),
          rawLine: trimmed,
        };

        return { telemetry, raw: trimmed };
      }
    }
  }

  // Malformed or irrelevant diagnostic line: Do NOT interpret as valid telemetry!
  return {
    telemetry: null,
    error: `Ignored non-telemetry line: '${trimmed.slice(0, 45)}'`,
    raw: trimmed,
  };
}

/**
 * Formats a command string with newline delimiter '\n' for 9600 baud transmission.
 */
export function formatCommand(command: OutgoingCommand): string {
  return `${command}\n`;
}

/**
 * Protocol Self-Test Suite
 * Rigorously verifies all supported final Arduino Uno packet formats,
 * missing sensor handling, calibration acknowledgements, and rejection of malformed data.
 */
export interface ProtocolTestResult {
  name: string;
  passed: boolean;
  inputDescription: string;
  expected: string;
  actual: string;
}

export function runProtocolSelfTests(): ProtocolTestResult[] {
  const results: ProtocolTestResult[] = [];

  // Test 1: Live data DISTANCE:2.74,LEVEL:97.2
  const r1 = parseStatusLine('DISTANCE:2.74,LEVEL:97.2');
  results.push({
    name: 'Live data parsing (DISTANCE:2.74,LEVEL:97.2)',
    passed: r1.telemetry !== null && r1.telemetry.water === 97.2 && r1.telemetry.distance === 2.74 && r1.telemetry.status === 'CRITICAL',
    inputDescription: 'DISTANCE:2.74,LEVEL:97.2',
    expected: 'water=97.2%, distance=2.74cm, status=CRITICAL',
    actual: r1.telemetry
      ? `water=${r1.telemetry.water}%, distance=${r1.telemetry.distance}cm, status=${r1.telemetry.status}`
      : 'Failed to parse',
  });

  // Test 2: Sensor unavailable SENSOR:ABSENT
  const r2 = parseStatusLine('SENSOR:ABSENT');
  results.push({
    name: 'Sensor unavailable handling (SENSOR:ABSENT)',
    passed: r2.telemetry !== null && r2.telemetry.isSensorUnavailable === true && r2.telemetry.water === null && r2.telemetry.status === 'SENSOR_ABSENT',
    inputDescription: 'SENSOR:ABSENT',
    expected: 'isSensorUnavailable=true, water=null, status=SENSOR_ABSENT',
    actual: r2.telemetry
      ? `isSensorUnavailable=${r2.telemetry.isSensorUnavailable}, water=${r2.telemetry.water}, status=${r2.telemetry.status}`
      : 'Failed to parse',
  });

  // Test 3: Startup WATER TANK MONITOR READY
  const r3 = parseStatusLine('WATER TANK MONITOR READY');
  results.push({
    name: 'Startup announcement (WATER TANK MONITOR READY)',
    passed: r3.telemetry === null && r3.isSystemNotice === true,
    inputDescription: 'WATER TANK MONITOR READY',
    expected: 'telemetry=null, isSystemNotice=true',
    actual: `telemetry=${r3.telemetry}, isSystemNotice=${r3.isSystemNotice}`,
  });

  // Test 4: Calibration report CALIBRATION:EMPTY=14.00,FULL=2.42
  const r4 = parseStatusLine('CALIBRATION:EMPTY=14.00,FULL=2.42');
  results.push({
    name: 'Calibration report (CALIBRATION:EMPTY=14.00,FULL=2.42)',
    passed:
      r4.calibrationUpdate !== undefined &&
      r4.calibrationUpdate.calEmpty === 14.0 &&
      r4.calibrationUpdate.calFull === 2.42,
    inputDescription: 'CALIBRATION:EMPTY=14.00,FULL=2.42',
    expected: 'calEmpty=14.00, calFull=2.42',
    actual: r4.calibrationUpdate
      ? `calEmpty=${r4.calibrationUpdate.calEmpty}, calFull=${r4.calibrationUpdate.calFull}`
      : 'Failed to parse',
  });

  // Test 5: Command ACK:CAL_EMPTY:OK and ACK:CAL_EMPTY:ERROR
  const r5a = parseStatusLine('ACK:CAL_EMPTY:OK');
  const r5b = parseStatusLine('ACK:CAL_EMPTY:ERROR');
  results.push({
    name: 'Command ACK CAL_EMPTY (OK & ERROR)',
    passed: r5a.ack?.command === 'CAL_EMPTY' && r5a.ack?.status === 'OK' && r5b.ack?.status === 'ERROR',
    inputDescription: 'ACK:CAL_EMPTY:OK and ACK:CAL_EMPTY:ERROR',
    expected: 'ACK:CAL_EMPTY:OK and ACK:CAL_EMPTY:ERROR',
    actual: `r5a=${r5a.ack?.command}:${r5a.ack?.status}, r5b=${r5b.ack?.command}:${r5b.ack?.status}`,
  });

  // Test 6: Command ACK:CAL_FULL:OK and ACK:CAL_FULL:ERROR
  const r6a = parseStatusLine('ACK:CAL_FULL:OK');
  const r6b = parseStatusLine('ACK:CAL_FULL:ERROR');
  results.push({
    name: 'Command ACK CAL_FULL (OK & ERROR)',
    passed: r6a.ack?.command === 'CAL_FULL' && r6a.ack?.status === 'OK' && r6b.ack?.status === 'ERROR',
    inputDescription: 'ACK:CAL_FULL:OK and ACK:CAL_FULL:ERROR',
    expected: 'ACK:CAL_FULL:OK and ACK:CAL_FULL:ERROR',
    actual: `r6a=${r6a.ack?.command}:${r6a.ack?.status}, r6b=${r6b.ack?.command}:${r6b.ack?.status}`,
  });

  // Test 7: Tank Full and continuous buzzer hysteresis (LEVEL:99.1)
  const r7 = parseStatusLine('DISTANCE:2.42,LEVEL:99.1');
  const buzzerActiveState = r7.telemetry?.buzzer === 'ON' && r7.telemetry?.continuousBuzzer === true && r7.telemetry?.isTankFull === true;
  results.push({
    name: 'Tank Full and continuous buzzer (LEVEL:99.1 >= 98.90%)',
    passed: r7.telemetry !== null && buzzerActiveState,
    inputDescription: 'DISTANCE:2.42,LEVEL:99.1',
    expected: 'buzzer=ON, continuousBuzzer=true, isTankFull=true',
    actual: r7.telemetry
      ? `buzzer=${r7.telemetry.buzzer}, continuousBuzzer=${r7.telemetry.continuousBuzzer}, isTankFull=${r7.telemetry.isTankFull}`
      : 'Failed',
  });

  // Test 8: Buzzer hysteresis deactivation below 97.50%
  // Level is 97.2% with previous buzzer active: maintains buzzer
  const r8a = parseStatusLine('DISTANCE:2.74,LEVEL:97.6', r7.telemetry);
  const r8b = parseStatusLine('DISTANCE:2.74,LEVEL:97.2', r7.telemetry);
  results.push({
    name: 'Buzzer hysteresis drop below 97.50%',
    passed: r8a.telemetry?.continuousBuzzer === true && r8b.telemetry?.continuousBuzzer === false,
    inputDescription: 'Level 97.6% (maintains) vs 97.2% (falls below 97.5%)',
    expected: '97.6% maintained (ON), 97.2% deactivated (OFF)',
    actual: `at 97.6%: ${r8a.telemetry?.continuousBuzzer}, at 97.2%: ${r8b.telemetry?.continuousBuzzer}`,
  });

  // Test 9: Malformed data rejection
  const r9 = parseStatusLine('DISTANCE:invalid,LEVEL:corrupted');
  results.push({
    name: 'Rejection of malformed data',
    passed: r9.telemetry === null,
    inputDescription: 'DISTANCE:invalid,LEVEL:corrupted',
    expected: 'telemetry=null',
    actual: `telemetry=${r9.telemetry}`,
  });

  // Test 10: Stream Accumulator with fragmented chunks
  const accumulator = new ProtocolStreamAccumulator();
  const chunk1Lines = accumulator.pushChunk('DISTANCE:2.74,');
  const chunk2Lines = accumulator.pushChunk('LEVEL:97.2\nWATER TANK MONITOR ');
  const chunk3Lines = accumulator.pushChunk('READY\r\n');

  const accumulatedLines = [...chunk1Lines, ...chunk2Lines, ...chunk3Lines];
  results.push({
    name: 'ProtocolStreamAccumulator chunk reassembly',
    passed: accumulatedLines.length === 2 && accumulatedLines[0] === 'DISTANCE:2.74,LEVEL:97.2' && accumulatedLines[1] === 'WATER TANK MONITOR READY',
    inputDescription: 'Fragmented streaming chunks',
    expected: '2 complete lines reassembled across 3 fragments',
    actual: `${accumulatedLines.length} lines: ${JSON.stringify(accumulatedLines)}`,
  });

  return results;
}
