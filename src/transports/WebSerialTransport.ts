/**
 * Web Serial API Transport
 * Connects desktop web browsers (Chrome, Edge, Opera) and Android USB OTG directly to Arduino at 9600 baud.
 */

import { formatCommand, parseStatusLine, ProtocolStreamAccumulator } from '../protocol/protocolParser';
import { ConnectionState, OutgoingCommand } from '../types';
import { IHardwareTransport, TransportCallbacks } from './types';

// Web Serial types
interface SerialPort {
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    bufferSize?: number;
  }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

interface SerialNavigator {
  serial: {
    requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
    addEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void;
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void;
  };
}

export class WebSerialTransport implements IHardwareTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private accumulator = new ProtocolStreamAccumulator();
  private keepReading = false;
  private noDataCheckTimer: number | null = null;

  private state: ConnectionState = {
    status: 'disconnected',
    transport: 'usb_serial',
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

  private callbacks: TransportCallbacks;

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks;
    this.setupHardwareDisconnectListener();
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public static isSecureContext(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext === true;
  }

  private setupHardwareDisconnectListener(): void {
    if (WebSerialTransport.isSupported()) {
      try {
        const serialNav = navigator as unknown as SerialNavigator;
        serialNav.serial.addEventListener('disconnect', (event) => {
          const disconnectedPort = (event as unknown as { port: SerialPort }).port;
          if (this.port === disconnectedPort) {
            this.handleUnexpectedDisconnect('Hardware disconnected (USB cable unplugged)');
          }
        });
      } catch (_e) {
        // Ignore listener error if unsupported
      }
    }
  }

  public getState(): ConnectionState {
    return { ...this.state };
  }

  public async connect(): Promise<boolean> {
    if (!WebSerialTransport.isSupported()) {
      const err =
        'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera (Desktop or Android with USB OTG).';
      this.updateState({ status: 'error', errorMessage: err });
      this.callbacks.onError(err);
      return false;
    }

    if (!WebSerialTransport.isSecureContext()) {
      const err = 'Web Serial requires a Secure Context (HTTPS or localhost).';
      this.updateState({ status: 'error', errorMessage: err });
      this.callbacks.onError(err);
      return false;
    }

    try {
      this.updateState({
        status: 'connecting',
        errorMessage: undefined,
        bytesReceived: 0,
        packetsReceived: 0,
        readerActive: false,
        hasReceivedValidTelemetry: false,
        noDataAlert: false,
      });

      const serialNav = navigator as unknown as SerialNavigator;

      // Prompt user to select Arduino COM port
      const selectedPort = await serialNav.serial.requestPort();
      this.port = selectedPort;

      // Open at 9600 baud (standard Arduino speed)
      await selectedPort.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 4096,
      });

      const info = selectedPort.getInfo();
      const devName = info.usbVendorId
        ? `Arduino [VID: 0x${info.usbVendorId.toString(16).padStart(4, '0')}]`
        : 'Arduino USB Serial Port';

      this.accumulator.reset();
      this.keepReading = true;

      this.updateState({
        status: 'connected',
        deviceName: devName,
        errorMessage: undefined,
        readerActive: true,
      });

      // Start continuous background stream reader
      this.startReadingStream();

      // Start watchdog timer: If after 5 seconds 0 bytes arrive, notify user
      if (this.noDataCheckTimer) window.clearTimeout(this.noDataCheckTimer);
      this.noDataCheckTimer = window.setTimeout(() => {
        if (this.state.status === 'connected' && this.state.bytesReceived === 0) {
          this.updateState({ noDataAlert: true });
          this.callbacks.onError(
            'USB port opened at 9600 baud, but no data received yet. Ensure Arduino is running and sending data.'
          );
        }
      }, 5000);

      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      let friendlyError = errorMsg;

      if (errorMsg.includes('Failed to open serial port') || errorMsg.includes('Access denied')) {
        friendlyError =
          'Port is busy or locked. Close the Arduino IDE Serial Monitor or other serial terminals and retry.';
      } else if (errorMsg.includes('No port selected') || errorMsg.includes('User cancelled')) {
        friendlyError = 'Port selection cancelled by user.';
      }

      this.updateState({
        status: 'error',
        errorMessage: friendlyError,
        readerActive: false,
      });
      this.callbacks.onError(friendlyError);
      return false;
    }
  }

  private async startReadingStream(): Promise<void> {
    if (!this.port || !this.port.readable) return;

    const decoder = new TextDecoder();

    try {
      this.reader = this.port.readable.getReader();
      this.updateState({ readerActive: true });

      while (this.keepReading && this.port && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }

        if (value && value.length > 0) {
          this.state.bytesReceived += value.length;
          this.state.noDataAlert = false;

          const chunk = decoder.decode(value, { stream: true });
          const extractedLines = this.accumulator.pushChunk(chunk);

          for (const line of extractedLines) {
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
        }
      }
    } catch (readErr: unknown) {
      if (this.keepReading) {
        const msg = readErr instanceof Error ? readErr.message : 'Serial read stream error';
        this.handleUnexpectedDisconnect(msg);
      }
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch (_releaseErr) {
          // Ignore release error
        }
        this.reader = null;
      }
      this.updateState({ readerActive: false });
    }
  }

  public async sendCommand(command: OutgoingCommand): Promise<boolean> {
    if (this.state.status !== 'connected' || !this.port || !this.port.writable) {
      this.callbacks.onError('Cannot send command: Serial port is not connected.');
      return false;
    }

    try {
      const formatted = formatCommand(command);
      const encoder = new TextEncoder();
      const payload = encoder.encode(formatted);

      this.writer = this.port.writable.getWriter();
      await this.writer.write(payload);
      this.writer.releaseLock();
      this.writer = null;

      this.state.packetsSent++;
      this.callbacks.onRawLineReceived(formatted.trim(), 'TX');
      this.callbacks.onStatusChange(this.getState());
      return true;
    } catch (writeErr: unknown) {
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (_) {}
        this.writer = null;
      }
      const msg = writeErr instanceof Error ? writeErr.message : 'Serial transmission error';
      this.callbacks.onError(`Send failed: ${msg}`);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.keepReading = false;

    if (this.noDataCheckTimer) {
      window.clearTimeout(this.noDataCheckTimer);
      this.noDataCheckTimer = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (_) {}
      try {
        this.reader.releaseLock();
      } catch (_) {}
      this.reader = null;
    }

    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (_) {}
      this.writer = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (closeErr) {
        console.warn('Error closing serial port', closeErr);
      }
      this.port = null;
    }

    this.accumulator.reset();

    this.updateState({
      status: 'disconnected',
      deviceName: undefined,
      errorMessage: undefined,
      readerActive: false,
      noDataAlert: false,
    });
  }

  private handleUnexpectedDisconnect(reason: string): void {
    this.keepReading = false;
    this.port = null;
    this.reader = null;
    this.writer = null;

    if (this.noDataCheckTimer) {
      window.clearTimeout(this.noDataCheckTimer);
      this.noDataCheckTimer = null;
    }

    this.updateState({
      status: 'disconnected',
      errorMessage: reason,
      readerActive: false,
    });
    this.callbacks.onError(reason);
  }

  private updateState(partial: Partial<ConnectionState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.callbacks.onStatusChange(this.getState());
  }
}
