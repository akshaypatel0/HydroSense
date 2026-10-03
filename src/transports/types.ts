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
}

export interface IHardwareTransport {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  sendCommand(command: OutgoingCommand): Promise<boolean>;
  getState(): ConnectionState;
}
