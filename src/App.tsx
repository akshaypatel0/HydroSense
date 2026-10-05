/**
 * HydroSense – Smart Water Monitor
 * Production Mobile-First Smart Water Tank Monitoring System
 * Core Principle: The Arduino firmware is the single source of truth.
 *
 * Dedicated strictly to water-level monitoring, acoustic calibration,
 * safety buzzer alarms, and water usage analysis. (No pump or motor)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { BottomNavBar } from './components/BottomNavBar';
import { HomeScreen } from './components/HomeScreen';
import { ControlScreen } from './components/ControlScreen';
import { UsageScreen } from './components/UsageScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { TankSettingsModal } from './components/TankSettingsModal';
import { BluetoothModal } from './components/BluetoothModal';
import { notificationService, InAppToast } from './services/notificationService';
import {
  ActiveNavTab,
  ConnectionState,
  EventLogItem,
  OutgoingCommand,
  PendingCommand,
  TankConfig,
  TelemetryData,
} from './types';
import { IHardwareTransport } from './transports/types';
import { WebSerialTransport } from './transports/WebSerialTransport';
import { BluetoothSppTransport } from './transports/BluetoothSppTransport';
import { TestBenchTransport } from './transports/TestBenchTransport';
import { parseStatusLine } from './protocol/protocolParser';
import { usageTracker } from './services/usageTracker';
import { Language, TRANSLATIONS } from './i18n/translations';
import {
  AlertTriangle,
  ArrowRight,
  Bluetooth,
  Cable,
  CheckCircle2,
  Droplets,
  ExternalLink,
  Info,
  Radio,
  Smartphone,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';

const DEFAULT_CONFIG: TankConfig = {
  tankCapacityLiters: 1000,
  lowThresholdPercent: 25,
  dailyTargetLiters: 120,
  autoStartLevel: 10,
  autoTargetLevel: 80,
  autoReconnect: true,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('hydrosense_theme');
      if (saved !== null) {
        return saved === 'dark';
      }
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    } catch {
      return true;
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBluetoothModalOpen, setIsBluetoothModalOpen] = useState(false);
  const [toasts, setToasts] = useState<InAppToast[]>([]);

  useEffect(() => {
    const unsub = notificationService.subscribeToToasts((toast) => {
      setToasts((prev) => [...prev.slice(-2), toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    });
    return unsub;
  }, []);

  // Bilingual Language State (English & Gujarati)
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('hydrosense_lang');
      return saved === 'gu' ? 'gu' : 'en';
    } catch {
      return 'en';
    }
  });

  const toggleLanguage = () => {
    setLang((prev) => {
      const next: Language = prev === 'en' ? 'gu' : 'en';
      try {
        localStorage.setItem('hydrosense_lang', next);
      } catch {
        // Ignore local storage error
      }
      return next;
    });
  };

  const t = TRANSLATIONS[lang];

  // Tank configuration (capacity for liters calculation & daily usage targets)
  const [tankConfig, setTankConfig] = useState<TankConfig>(() => {
    try {
      const saved = localStorage.getItem('hydrosense_v3_tank_config');
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  // Telemetry & Hardware Connection State with rich diagnostics
  const [connectionState, setConnectionState] = useState<ConnectionState>({
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
  });

  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [secondsSinceLastPacket, setSecondsSinceLastPacket] = useState<number | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Command Acknowledgment State & Retry Tracker
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [lastAttemptedCommand, setLastAttemptedCommand] = useState<OutgoingCommand | null>(null);
  const [commandAckStatus, setCommandAckStatus] = useState<{
    status: 'idle' | 'pending' | 'success' | 'timeout';
    message: string;
  }>({ status: 'idle', message: '' });

  // Serial Monitor Buffer for Diagnostics
  const [serialLines, setSerialLines] = useState<
    Array<{ id: string; timestamp: number; direction: 'RX' | 'TX'; text: string }>
  >([]);

  // Audit Logs
  const [logs, setLogs] = useState<EventLogItem[]>([
    {
      id: 'init-1',
      timestamp: Date.now(),
      severity: 'info',
      source: 'SYSTEM',
      message: 'HydroSense v3.1 initialized. Dedicated water level monitor with buzzer alarms.',
    },
  ]);

  const [telemetryHistory, setTelemetryHistory] = useState<
    Array<{ timestamp: number; water: number }>
  >([]);

  // Smooth Water Filter Reference (Exponential moving average to eliminate acoustic ripple)
  const filteredWaterRef = useRef<number | null>(null);

  const transportRef = useRef<IHardwareTransport | null>(null);
  const testBenchRef = useRef<TestBenchTransport | null>(null);

  // Theme effect: persist to localStorage and sync document.documentElement, body, and meta theme-color
  useEffect(() => {
    try {
      localStorage.setItem('hydrosense_theme', isDarkMode ? 'dark' : 'light');
    } catch {}

    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isDarkMode ? '#020617' : '#f8fafc');
    }
  }, [isDarkMode]);

  const addLog = useCallback(
    (severity: EventLogItem['severity'], source: EventLogItem['source'], message: string) => {
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          severity,
          source,
          message,
        },
        ...prev.slice(0, 199),
      ]);
    },
    []
  );

  // Dedicated Calibration Promise Tracker
  const calPendingRef = useRef<{
    resolve: (res: { success: boolean; message: string }) => void;
    command: 'CAL_EMPTY' | 'CAL_FULL';
    timer: number;
  } | null>(null);

  const handleRawLine = useCallback(
    (text: string, direction: 'RX' | 'TX') => {
      setSerialLines((prev) => [
        ...prev.slice(-250),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          direction,
          text,
        },
      ]);

      // Check for incoming ACK lines (e.g. ACK:CAL_EMPTY:OK, ACK:TARGET:OK)
      if (direction === 'RX' && text.startsWith('ACK:')) {
        const parsed = parseStatusLine(text);
        if (parsed.ack) {
          const { command, status, reason } = parsed.ack;

          // Check if calibration wizard is waiting for this ACK
          if (calPendingRef.current && (command === 'CAL_EMPTY' || command === 'CAL_FULL')) {
            if (command === calPendingRef.current.command) {
              window.clearTimeout(calPendingRef.current.timer);
              const resolveFn = calPendingRef.current.resolve;
              calPendingRef.current = null;
              if (status === 'OK') {
                resolveFn({
                  success: true,
                  message: `Arduino confirmed and saved ${command} to EEPROM.`,
                });
              } else {
                const msg =
                  reason === 'SENSOR_INVALID'
                    ? 'Sensor reading invalid or out of range. Check ultrasonic sensor alignment.'
                    : reason === 'FULL_MUST_BE_LESS_THAN_EMPTY'
                    ? 'Full tank water surface must be closer to sensor than empty bottom.'
                    : reason
                    ? ` (${reason})`
                    : '';
                resolveFn({
                  success: false,
                  message: `Arduino rejected calibration: ${msg}`,
                });
              }
            }
          }

          if (status === 'OK') {
            setPendingCommand((p) => {
              if (p?.timeoutTimer) window.clearTimeout(p.timeoutTimer);
              return null;
            });
            setCommandAckStatus({
              status: 'success',
              message: `ACK: ${command} confirmed by Arduino`,
            });
            setTimeout(() => {
              setCommandAckStatus((s) => (s.status === 'success' ? { status: 'idle', message: '' } : s));
            }, 3000);
          } else {
            setPendingCommand((p) => {
              if (p?.timeoutTimer) window.clearTimeout(p.timeoutTimer);
              return null;
            });
            const reasonMsg =
              reason === 'SENSOR_INVALID'
                ? 'Ultrasonic sensor returned invalid distance'
                : reason
                ? ` (${reason})`
                : '';
            setCommandAckStatus({
              status: 'timeout',
              message: `Rejected: ${reasonMsg || command}`,
            });
            addLog('warning', 'SAFETY', `Arduino rejected ${command}: ${reasonMsg}`);
          }
        }
      }
    },
    [addLog]
  );

  // Authoritative Telemetry handler: Direct readings without artificial smoothing
  const handleTelemetry = useCallback(
    (newTelem: TelemetryData) => {
      const waterVal = newTelem.water;
      const isUnavailable = Boolean(newTelem.isSensorUnavailable || waterVal === null);

      setTelemetry((prev) => {
        if (prev) {
          if (prev.isSensorUnavailable !== isUnavailable) {
            if (isUnavailable) {
              addLog('critical', 'HARDWARE', 'Sensor unavailable (SENSOR:ABSENT). Reading suspended.');
            } else if (waterVal !== null) {
              addLog('info', 'HARDWARE', `Sensor recovered. Water level: ${waterVal.toFixed(1)}%`);
            }
          } else if (!isUnavailable && waterVal !== null && prev.status !== newTelem.status) {
            addLog(
              newTelem.status === 'CRITICAL'
                ? 'critical'
                : newTelem.status === 'LOW'
                ? 'warning'
                : 'info',
              'HARDWARE',
              `Status transitioned to: ${newTelem.status} (${waterVal.toFixed(1)}%)`
            );
          }
          if (prev.error !== newTelem.error && newTelem.error !== 'NONE') {
            addLog('critical', 'HARDWARE', `Sensor alert reported by Arduino: ${newTelem.error}`);
          }
          if (prev.buzzer !== newTelem.buzzer && newTelem.buzzer === 'ON') {
            addLog('critical', 'SAFETY', 'Safety high-water buzzer alarm active!');
          }
        }
        return newTelem;
      });

      if (!isUnavailable && waterVal !== null) {
        filteredWaterRef.current = waterVal;
        // Feed genuine reading into water consumption tracker
        usageTracker.processWaterReading(waterVal, tankConfig.tankCapacityLiters);

        // Keep short history for trend chart
        setTelemetryHistory((prev) => [
          ...prev.slice(-59),
          {
            timestamp: newTelem.timestamp,
            water: waterVal,
          },
        ]);
      } else {
        filteredWaterRef.current = null;
      }

      // Evaluate for anti-spam useful notifications (target reached, low reserve, cutoff risk)
      notificationService.evaluateTelemetry(newTelem, tankConfig.tankCapacityLiters);

      // Verify pending command acknowledgment against confirmed Arduino status
      setPendingCommand((currentPending) => {
        if (!currentPending) return null;

        let matched = false;
        if (
          currentPending.expectedState?.motor &&
          newTelem.motor === currentPending.expectedState.motor
        ) {
          matched = true;
        } else if (
          currentPending.expectedState?.mode &&
          newTelem.mode === currentPending.expectedState.mode
        ) {
          matched = true;
        } else if (
          currentPending.expectedState?.autoStart !== undefined &&
          newTelem.autoStart === currentPending.expectedState.autoStart
        ) {
          matched = true;
        } else if (
          currentPending.expectedState?.autoTarget !== undefined &&
          newTelem.autoTarget === currentPending.expectedState.autoTarget
        ) {
          matched = true;
        } else if (
          currentPending.expectedState?.target &&
          newTelem.target === currentPending.expectedState.target
        ) {
          matched = true;
        } else if (
          currentPending.expectedState?.cutoff &&
          newTelem.cutoff === currentPending.expectedState.cutoff
        ) {
          matched = true;
        }

        if (matched) {
          if (currentPending.timeoutTimer) window.clearTimeout(currentPending.timeoutTimer);
          setCommandAckStatus({
            status: 'success',
            message: `Command ACK: ${currentPending.command} verified`,
          });
          setTimeout(() => {
            setCommandAckStatus((s) => (s.status === 'success' ? { status: 'idle', message: '' } : s));
          }, 3000);
          return null;
        }

        return currentPending;
      });
    },
    [addLog, tankConfig.tankCapacityLiters]
  );

  // Stale Telemetry Watchdog
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionState.status === 'connected' && connectionState.lastPacketTime) {
        const elapsedSec = (Date.now() - connectionState.lastPacketTime) / 1000;
        setSecondsSinceLastPacket(Math.round(elapsedSec * 10) / 10);

        if (elapsedSec > 4) {
          if (!isStale) {
            setIsStale(true);
            addLog('warning', 'SYSTEM', `Telemetry link stale: no packet for ${elapsedSec.toFixed(1)}s`);
          }
        } else {
          if (isStale) {
            setIsStale(false);
          }
        }
      } else {
        setSecondsSinceLastPacket(null);
        setIsStale(false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [connectionState, isStale, addLog]);

  // Connect USB Serial (Web Serial API for Desktop & Android USB OTG)
  const connectUsb = async () => {
    if (transportRef.current) {
      await transportRef.current.disconnect();
    }

    const transport = new WebSerialTransport({
      onStatusChange: setConnectionState,
      onTelemetry: handleTelemetry,
      onRawLineReceived: handleRawLine,
      onError: (err) => {
        addLog('critical', 'SYSTEM', `USB Serial: ${err}`);
      },
      onCalibrationUpdate: (cal) => {
        addLog(
          'info',
          'HARDWARE',
          `Arduino EEPROM calibration reported: Empty=${cal.calEmpty.toFixed(2)}cm, Full=${cal.calFull.toFixed(2)}cm`
        );
        setTelemetry((prev) => {
          if (!prev) {
            return {
              water: null,
              isSensorUnavailable: false,
              status: 'NORMAL',
              motor: 'OFF',
              mode: 'AUTO',
              autoStart: 10,
              autoTarget: 80,
              target: 80,
              cutoff: 95,
              buzzer: 'OFF',
              continuousBuzzer: false,
              error: 'NONE',
              calStatus: 'OK',
              calEmpty: cal.calEmpty,
              calFull: cal.calFull,
              timestamp: Date.now(),
              rawLine: `CALIBRATION:EMPTY=${cal.calEmpty.toFixed(2)},FULL=${cal.calFull.toFixed(2)}`,
            };
          }
          return {
            ...prev,
            calEmpty: cal.calEmpty,
            calFull: cal.calFull,
            calStatus: 'OK',
          };
        });
      },
    });

    transportRef.current = transport;
    testBenchRef.current = null;

    addLog('info', 'SYSTEM', 'Requesting Web Serial port (9600 baud)...');
    const success = await transport.connect();
    if (success) {
      addLog('info', 'SYSTEM', 'USB Serial connected to Arduino. Querying calibration (STATUS)...');
      setTimeout(() => {
        transport.sendCommand('STATUS');
      }, 300);
    }
  };

  // Connect Android HC-05 Bluetooth SPP
  const connectBluetooth = async (macAddress?: string) => {
    if (transportRef.current) {
      await transportRef.current.disconnect();
    }

    const transport = new BluetoothSppTransport({
      onStatusChange: (status) => {
        setConnectionState(status);
        if (status.status === 'connected') {
          notificationService.handleConnectionState(true, status.deviceName || 'HC-05 Bluetooth');
        } else if (status.status === 'disconnected') {
          notificationService.handleConnectionState(false, 'HC-05');
        }
      },
      onTelemetry: handleTelemetry,
      onRawLineReceived: handleRawLine,
      onError: (err) => {
        addLog('critical', 'SYSTEM', `Bluetooth: ${err}`);
      },
      onCalibrationUpdate: (cal) => {
        addLog(
          'info',
          'HARDWARE',
          `Arduino EEPROM calibration reported: Empty=${cal.calEmpty.toFixed(2)}cm, Full=${cal.calFull.toFixed(2)}cm`
        );
        setTelemetry((prev) => {
          if (!prev) {
            return {
              water: null,
              isSensorUnavailable: false,
              status: 'NORMAL',
              motor: 'OFF',
              mode: 'AUTO',
              autoStart: 10,
              autoTarget: 80,
              target: 80,
              cutoff: 95,
              buzzer: 'OFF',
              continuousBuzzer: false,
              error: 'NONE',
              calStatus: 'OK',
              calEmpty: cal.calEmpty,
              calFull: cal.calFull,
              timestamp: Date.now(),
              rawLine: `CALIBRATION:EMPTY=${cal.calEmpty.toFixed(2)},FULL=${cal.calFull.toFixed(2)}`,
            };
          }
          return {
            ...prev,
            calEmpty: cal.calEmpty,
            calFull: cal.calFull,
            calStatus: 'OK',
          };
        });
      },
    });

    transportRef.current = transport;
    testBenchRef.current = null;

    addLog('info', 'SYSTEM', `Connecting to Android HC-05 Bluetooth SPP ${macAddress ? `(${macAddress})` : ''}...`);
    const success = await transport.connect(macAddress);
    if (!success) {
      setIsBluetoothModalOpen(true);
    } else {
      addLog('info', 'SYSTEM', 'Connected to HC-05 Bluetooth SPP. Querying calibration (STATUS)...');
      setTimeout(() => {
        transport.sendCommand('STATUS');
      }, 300);
    }
  };

  // Connect Test Bench Loopback (Virtual Arduino v3.1)
  const connectTestBench = async () => {
    if (transportRef.current) {
      await transportRef.current.disconnect();
    }

    const tb = new TestBenchTransport({
      onStatusChange: setConnectionState,
      onTelemetry: handleTelemetry,
      onRawLineReceived: handleRawLine,
      onError: (err) => {
        addLog('warning', 'SYSTEM', `Test Bench Error: ${err}`);
      },
      onCalibrationUpdate: (cal) => {
        addLog(
          'info',
          'HARDWARE',
          `Arduino EEPROM calibration reported: Empty=${cal.calEmpty.toFixed(2)}cm, Full=${cal.calFull.toFixed(2)}cm`
        );
        setTelemetry((prev) => {
          if (!prev) {
            return {
              water: null,
              isSensorUnavailable: false,
              status: 'NORMAL',
              motor: 'OFF',
              mode: 'AUTO',
              autoStart: 10,
              autoTarget: 80,
              target: 80,
              cutoff: 95,
              buzzer: 'OFF',
              continuousBuzzer: false,
              error: 'NONE',
              calStatus: 'OK',
              calEmpty: cal.calEmpty,
              calFull: cal.calFull,
              timestamp: Date.now(),
              rawLine: `CALIBRATION:EMPTY=${cal.calEmpty.toFixed(2)},FULL=${cal.calFull.toFixed(2)}`,
            };
          }
          return {
            ...prev,
            calEmpty: cal.calEmpty,
            calFull: cal.calFull,
            calStatus: 'OK',
          };
        });
      },
    });

    transportRef.current = tb;
    testBenchRef.current = tb;

    addLog('info', 'SYSTEM', 'Starting Hardware Test Bench Loopback (v3.1.0)...');
    const success = await tb.connect();
    if (success) {
      addLog('info', 'SYSTEM', 'Test Bench loopback active. Querying calibration (STATUS)...');
      setTimeout(() => {
        tb.sendCommand('STATUS');
      }, 300);
    }
  };

  // Disconnect
  const disconnectHardware = async () => {
    if (transportRef.current) {
      await transportRef.current.disconnect();
      transportRef.current = null;
      testBenchRef.current = null;
    }
    setTelemetry(null);
    filteredWaterRef.current = null;
    setConnectionState((prev) => ({
      ...prev,
      status: 'disconnected',
      deviceName: undefined,
      readerActive: false,
      noDataAlert: false,
    }));
    addLog('info', 'SYSTEM', 'Hardware disconnected.');
  };

  // Send Command to Active Hardware
  const sendCommand = async (command: OutgoingCommand | string): Promise<boolean> => {
    if (!transportRef.current || connectionState.status !== 'connected') {
      addLog('warning', 'COMMAND', `Cannot send "${command}": No active hardware connection.`);
      return false;
    }

    setLastAttemptedCommand(command as OutgoingCommand);
    addLog('command', 'COMMAND', `Dispatched command: ${command}`);

    const expectedState: PendingCommand['expectedState'] = {};
    if (command === 'MOTOR_ON') {
      expectedState.motor = 'ON';
    } else if (command === 'MOTOR_OFF') {
      expectedState.motor = 'OFF';
    } else if (command === 'MODE:AUTO') {
      expectedState.mode = 'AUTO';
    } else if (command === 'MODE:MANUAL') {
      expectedState.mode = 'MANUAL';
    } else if (command.startsWith('AUTO_START:')) {
      expectedState.autoStart = parseInt(command.slice(11), 10);
    } else if (command.startsWith('AUTO_TARGET:')) {
      expectedState.autoTarget = parseInt(command.slice(12), 10);
    } else if (command.startsWith('TARGET:')) {
      expectedState.target = parseInt(command.slice(7), 10);
    } else if (command.startsWith('CUTOFF:')) {
      expectedState.cutoff = parseInt(command.slice(7), 10);
    } else if (command === 'CAL_EMPTY') {
      expectedState.calibration = 'empty';
    } else if (command === 'CAL_FULL') {
      expectedState.calibration = 'full';
    }

    // 5000ms timeout for reliable serial propagation
    const timeoutTimer = window.setTimeout(() => {
      setPendingCommand((p) => {
        if (p && p.command === command) {
          setCommandAckStatus({
            status: 'timeout',
            message: `Command not confirmed: ${command} timed out`,
          });
          addLog('warning', 'HARDWARE', `Command not confirmed by Arduino: ${command}`);
          return null;
        }
        return p;
      });
    }, 5000);

    setPendingCommand({
      id: `${Date.now()}`,
      command,
      sentAt: Date.now(),
      expectedState,
      timeoutTimer,
    });

    setCommandAckStatus({
      status: 'pending',
      message: `Transmitting ${command}...`,
    });

    return await transportRef.current.sendCommand(command);
  };

  // Calibration Wizard Sender (Awaits ACK from Arduino before resolving)
  const handleSendCalibration = useCallback(
    async (command: 'CAL_EMPTY' | 'CAL_FULL'): Promise<{ success: boolean; message: string }> => {
      if (!transportRef.current || connectionState.status !== 'connected') {
        return {
          success: false,
          message: 'Hardware is not connected. Please connect via USB Serial or Android HC-05 first.',
        };
      }

      if (calPendingRef.current) {
        return {
          success: false,
          message: 'A calibration command is already in progress. Please wait.',
        };
      }

      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          if (calPendingRef.current) {
            calPendingRef.current = null;
            addLog(
              'warning',
              'HARDWARE',
              `Calibration timeout: Arduino did not acknowledge ${command} within 5s.`
            );
            resolve({
              success: false,
              message: `Calibration timed out. Arduino did not return ACK:${command}:OK within 5 seconds. Check sensor alignment and wiring.`,
            });
          }
        }, 5000);

        calPendingRef.current = { resolve, command, timer };
        sendCommand(command);
      });
    },
    [connectionState.status, sendCommand, addLog]
  );

  const handleSimulateLine = (line: string) => {
    handleRawLine(line, 'RX');
    const parsed = parseStatusLine(line);
    if (parsed.telemetry) {
      handleTelemetry(parsed.telemetry);
    } else if (parsed.calibrationUpdate) {
      addLog(
        'info',
        'HARDWARE',
        `Simulated calibration: Empty=${parsed.calibrationUpdate.calEmpty}cm, Full=${parsed.calibrationUpdate.calFull}cm`
      );
    }
  };

  const handleSaveConfig = (newConfig: Partial<TankConfig>) => {
    setTankConfig((prev) => {
      const updated: TankConfig = { ...prev, ...newConfig };
      try {
        localStorage.setItem('hydrosense_v3_tank_config', JSON.stringify(updated));
        if (updated.dailyTargetLiters) {
          usageTracker.setDailyTarget(updated.dailyTargetLiters);
        }
        addLog('info', 'SYSTEM', `Tank capacity updated to ${updated.tankCapacityLiters}L.`);
      } catch {
        // Ignore local storage error
      }
      return updated;
    });
  };

  // Fullscreen State & Toggle for wall-mount, kiosk or immersive mobile monitoring
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
          (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (document.documentElement as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
          await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
        }
      }
    } catch (_err) {
      // Ignore user-cancelled fullscreen error
    }
  }, []);

  const isWebSerialSupported = WebSerialTransport.isSupported();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors pb-24 sm:pb-28 md:pb-8">
      
      {/* Top Header */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connectionState={connectionState}
        onConnectUsb={connectUsb}
        onConnectBluetooth={() => setIsBluetoothModalOpen(true)}
        onConnectTestBench={connectTestBench}
        onDisconnect={disconnectHardware}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        lang={lang}
        onToggleLanguage={toggleLanguage}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-3 sm:px-6 py-3 sm:py-6">
        
        {/* Alert Banner: Only shown when there is an active warning (Stale or No Data) */}
        {connectionState.status === 'connected' && (isStale || connectionState.noDataAlert) && (
          <div className="mb-4 flex items-center justify-between gap-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 px-4 text-xs text-amber-900 dark:text-amber-200 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-bold">
                {isStale
                  ? `Telemetry Link Stale: Last data received ${secondsSinceLastPacket?.toFixed(1) ?? '0.0'}s ago`
                  : 'Connected to serial port, awaiting telemetry bytes from Arduino...'}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="text-[11px] font-bold underline hover:opacity-80 shrink-0"
            >
              Hardware Diagnostics →
            </button>
          </div>
        )}

        {/* SECTION 1: HOME (Live Water Level, Tank Animation, Litres & Motor Card) */}
        {activeTab === 'home' && (
          <HomeScreen
            telemetry={telemetry}
            connectionState={connectionState}
            tankConfig={tankConfig}
            onSendCommand={sendCommand}
            onConnectBluetooth={() => setIsBluetoothModalOpen(true)}
            lang={lang}
            onNavigateToControl={() => setActiveTab('control')}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}

        {/* SECTION 2: CONTROL (Manual & AUTO Motor Control, Sliders & Safety Rules) */}
        {activeTab === 'control' && (
          <ControlScreen
            telemetry={telemetry}
            isConnected={connectionState.status === 'connected'}
            tankConfig={tankConfig}
            onUpdateConfig={handleSaveConfig}
            onSendCommand={sendCommand}
            lang={lang}
          />
        )}

        {/* SECTION 3: USAGE (Water Usage Analytics, History Graph & Litres) */}
        {activeTab === 'usage' && (
          <UsageScreen
            telemetry={telemetry}
            isConnected={connectionState.status === 'connected'}
            tankConfig={tankConfig}
            lang={lang}
          />
        )}

        {/* SECTION 4: SETTINGS (Bluetooth, Tank Capacity, Calibration, Auto Settings & Diagnostics) */}
        {activeTab === 'settings' && (
          <SettingsScreen
            telemetry={telemetry}
            connectionState={connectionState}
            tankConfig={tankConfig}
            onUpdateConfig={handleSaveConfig}
            onSendCommand={sendCommand}
            onConnectBluetooth={(mac) => {
              if (mac) {
                connectBluetooth(mac);
              } else {
                setIsBluetoothModalOpen(true);
              }
            }}
            onDisconnect={disconnectHardware}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            lang={lang}
            onToggleLanguage={toggleLanguage}
          />
        )}

      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
      />

      {/* Tank Configuration & 2-Step Calibration Wizard Modal */}
      <TankSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={tankConfig}
        onSaveConfig={handleSaveConfig}
        telemetry={telemetry}
        connectionState={connectionState}
        onSendCalibration={handleSendCalibration}
        lang={lang}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      {/* Bluetooth Connection Manager Modal */}
      <BluetoothModal
        isOpen={isBluetoothModalOpen}
        onClose={() => setIsBluetoothModalOpen(false)}
        connectionState={connectionState}
        onConnectMac={(mac) => connectBluetooth(mac)}
        onDisconnect={disconnectHardware}
        onConnectUsb={connectUsb}
        onConnectTestBench={connectTestBench}
        onSendPing={() => {
          if (transportRef.current) {
            transportRef.current.sendCommand('STATUS');
            addLog('command', 'COMMAND', 'TX: STATUS');
          }
        }}
      />

      {/* Floating System & Anti-Spam Notification Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-16 sm:top-20 right-3 sm:right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`p-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl pointer-events-auto flex items-start gap-2.5 transition-all animate-fade-in ${
                toast.type === 'critical'
                  ? 'bg-rose-950/95 text-rose-100 border-rose-500/50 shadow-rose-950/50'
                  : toast.type === 'warning'
                  ? 'bg-amber-950/95 text-amber-100 border-amber-500/50 shadow-amber-950/50'
                  : toast.type === 'success'
                  ? 'bg-emerald-950/95 text-emerald-100 border-emerald-500/50 shadow-emerald-950/50'
                  : 'bg-slate-900/95 text-slate-100 border-slate-700/60 shadow-slate-950/50'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'critical' && <AlertTriangle className="h-4 w-4 text-rose-400" />}
                {toast.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                {toast.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {toast.type === 'info' && <Info className="h-4 w-4 text-cyan-400" />}
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-bold leading-tight truncate">{toast.title}</div>
                <div className="text-[11px] opacity-90 leading-snug mt-0.5">{toast.message}</div>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="opacity-60 hover:opacity-100 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
