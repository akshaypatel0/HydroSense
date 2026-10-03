/**
 * Android HC-05 Bluetooth Classic SPP Transport
 *
 * Technical Architecture:
 * - HC-05 uses Bluetooth Classic Serial Port Profile (SPP / RFCOMM with UUID 00001101-0000-1000-8000-00805F9B34FB).
 * - Standard Web Bluetooth (navigator.bluetooth) only supports BLE GATT and CANNOT open RFCOMM sockets to HC-05.
 * - This transport bridges to native Android Bluetooth Classic when running inside an Android container
 *   (via window.AndroidBluetooth / window.AndroidBridge JavascriptInterface), or provides an interactive device picker
 *   and guidance when running in a standard web browser.
 */

import { formatCommand, parseStatusLine, ProtocolStreamAccumulator } from '../protocol/protocolParser';
import { ConnectionState, OutgoingCommand } from '../types';
import { IHardwareTransport, TransportCallbacks } from './types';

// Interface for Android Native WebView JavaScript Bridge
export interface AndroidNativeBridge {
  isNativeApp?(): boolean;
  connect(macAddress?: string): boolean;
  disconnect(): void;
  sendCommand(command: string): boolean;
  isConnected(): boolean;
  getConnectedDeviceName?(): string;
  getPairedDevicesJson?(): string;
  postNotification?(title: string, message: string, tag?: string): boolean;
  requestBluetoothPermissions?(): void;
  requestNotificationPermission?(): void;
  hasBluetoothPermission?(): boolean;
  hasNotificationPermission?(): boolean;
}

export interface PairedBluetoothDevice {
  name: string;
  address: string;
}

declare global {
  interface Window {
    AndroidBluetooth?: AndroidNativeBridge;
    AndroidBridge?: AndroidNativeBridge;
    onAndroidBluetoothData?: (data: string) => void;
    onAndroidBluetoothStatus?: (status: string, message?: string) => void;
    onAndroidPermissionResult?: (type: string, granted: boolean) => void;
  }
}

export class BluetoothSppTransport implements IHardwareTransport {
  private accumulator = new ProtocolStreamAccumulator();
  private callbacks: TransportCallbacks;

  private state: ConnectionState = {
    status: 'disconnected',
    transport: 'bluetooth_spp',
    baudRate: 9600,
    packetsReceived: 0,
    packetsSent: 0,
    bytesReceived: 0,
    lastPacketTime: null,
    lastRawText: undefined,
    lastRawLineTime: null,
    lastValidTelemetryTime: null,
    readerActive: false,
    hasReceivedValidTelemetry: false,
    noDataAlert: false,
  };

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks;
    this.setupNativeBridgeListeners();
  }

  public static isNativeBridgeAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      (Boolean(window.AndroidBluetooth) || Boolean(window.AndroidBridge))
    );
  }

  public static getBridge(): AndroidNativeBridge | null {
    if (typeof window === 'undefined') return null;
    return window.AndroidBluetooth || window.AndroidBridge || null;
  }

  public static getPairedDevices(): PairedBluetoothDevice[] {
    const bridge = BluetoothSppTransport.getBridge();
    if (!bridge || !bridge.getPairedDevicesJson) return [];

    try {
      const json = bridge.getPairedDevicesJson();
      if (!json) return [];
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          name: String(item.name || 'Unknown Device'),
          address: String(item.address || ''),
        }));
      }
    } catch (e) {
      console.error('Error fetching paired Bluetooth devices:', e);
    }
    return [];
  }

  private getBridge(): AndroidNativeBridge | null {
    return BluetoothSppTransport.getBridge();
  }

  private setupNativeBridgeListeners(): void {
    if (typeof window === 'undefined') return;

    // Incoming line from native Android RFCOMM stream
    window.onAndroidBluetoothData = (data: string) => {
      this.state.bytesReceived += data.length;
      const lines = this.accumulator.pushChunk(data.includes('\n') ? data : `${data}\n`);

      for (const line of lines) {
        this.state.lastRawText = line;
        this.state.lastRawLineTime = Date.now();
        this.callbacks.onRawLineReceived(line, 'RX');

        const result = parseStatusLine(line);

        if (result.telemetry) {
          this.state.packetsReceived++;
          this.state.lastPacketTime = Date.now();
          this.state.lastValidTelemetryTime = Date.now();
          this.state.hasReceivedValidTelemetry = true;
          this.callbacks.onTelemetry(result.telemetry);
          this.callbacks.onStatusChange(this.getState());
        } else if (result.calibrationUpdate) {
          this.callbacks.onCalibrationUpdate?.(result.calibrationUpdate);
        }
      }
    };

    // Connection status change from native Android RFCOMM stream
    window.onAndroidBluetoothStatus = (status: string, message?: string) => {
      const lower = status.toLowerCase();
      if (lower === 'connected') {
        this.updateState({
          status: 'connected',
          deviceName: message || 'HC-05 Bluetooth SPP',
          readerActive: true,
          errorMessage: undefined,
        });
      } else if (lower === 'connecting') {
        this.updateState({
          status: 'connecting',
          deviceName: message || 'HC-05',
          errorMessage: undefined,
        });
      } else {
        this.updateState({
          status: 'disconnected',
          readerActive: false,
          errorMessage: message,
        });
        if (message) {
          this.callbacks.onError(message);
        }
      }
    };
  }

  public getState(): ConnectionState {
    return { ...this.state };
  }

  public async connect(macAddress?: string): Promise<boolean> {
    const bridge = this.getBridge();

    // 1. If running inside native Android WebView container
    if (bridge) {
      try {
        this.updateState({
          status: 'connecting',
          errorMessage: undefined,
          bytesReceived: 0,
          packetsReceived: 0,
          readerActive: false,
          hasReceivedValidTelemetry: false,
        });

        this.setupNativeBridgeListeners();
        this.accumulator.reset();
        const success = bridge.connect(macAddress);
        if (!success) {
          const err = 'Failed to initiate HC-05 connection via Android native bridge.';
          this.updateState({ status: 'error', errorMessage: err });
          this.callbacks.onError(err);
          return false;
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.updateState({ status: 'error', errorMessage: msg });
        this.callbacks.onError(`Android Bluetooth Bridge error: ${msg}`);
        return false;
      }
    }

    // 2. Standard Web Browser Environment
    const errorMsg =
      'HC-05 uses Bluetooth Classic SPP (RFCOMM). Standard web browsers (Chrome, Firefox, Safari) only support BLE. Use "Connect USB Serial" for direct connection on Android with USB OTG cable, or launch the native Android APK which has full hardware SPP built in.';

    this.updateState({
      status: 'error',
      errorMessage: errorMsg,
      readerActive: false,
    });
    this.callbacks.onError(errorMsg);
    return false;
  }

  public async disconnect(): Promise<void> {
    const bridge = this.getBridge();
    if (bridge) {
      try {
        bridge.disconnect();
      } catch (_e) {
        // Ignore disconnect error
      }
    }

    this.accumulator.reset();
    this.updateState({
      status: 'disconnected',
      deviceName: undefined,
      errorMessage: undefined,
      readerActive: false,
    });
  }

  public async sendCommand(command: OutgoingCommand | string): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge || !bridge.isConnected()) {
      this.callbacks.onError('Cannot send command: Bluetooth SPP is not connected.');
      return false;
    }

    try {
      const formatted = typeof command === 'string' ? command : formatCommand(command);
      const success = bridge.sendCommand(formatted);
      if (success) {
        this.state.packetsSent++;
        this.callbacks.onRawLineReceived(formatted.trim(), 'TX');
        this.callbacks.onStatusChange(this.getState());
        return true;
      } else {
        this.callbacks.onError('Failed to send command through Android Bluetooth bridge.');
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(`Bluetooth send error: ${msg}`);
      return false;
    }
  }

  private updateState(partial: Partial<ConnectionState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.callbacks.onStatusChange(this.getState());
  }
}
