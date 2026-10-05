/**
 * Hardware Transport Interface
 */

import { ConnectionState, OutgoingCommand, TelemetryData } from '../types';

export interface TransportCallbacks {
  onStatusChange: (state: ConnectionState) => void;
  onTelemetry: (telemetry: TelemetryData) => void;
  onRawLineReceived: (line: string, direction: 'RX' | 'TX') => void;
  onError: (error: string) => void;
  onCalibrationUpdate?: (cal: { calEmpty: number; calFull: number }) => void;
  onAck?: (ack: { command: string; status: 'OK' | 'ERROR' | 'REJECTED'; message?: string }) => void;
  onAutoEvent?: (event: { type: string; message: string; motorState?: string; severity: 'info' | 'warning' | 'critical' }) => void;
}

export interface IHardwareTransport {
  connect(macAddress?: string): Promise<boolean>;
  disconnect(): Promise<void>;
  sendCommand(command: OutgoingCommand | string): Promise<boolean>;
  getState(): ConnectionState;
}
