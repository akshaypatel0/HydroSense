/**
 * HydroSense – Smart Water Monitor
 * Production Mobile-First Smart Water Tank Monitoring System
 * Core Principle: The Arduino firmware is the single source of truth.
 *
 * Dedicated strictly to water-level monitoring, acoustic calibration,
 * safety buzzer alarms, and water usage analysis. (No pump or motor)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActiveTab,
  TopBar,
} from './components/TopBar';
import { BottomNavBar } from './components/BottomNavBar';
import { TankVisualizer } from './components/TankVisualizer';
import { TelemetryCards } from './components/TelemetryCards';
import { WaterUsageSection } from './components/WaterUsageSection';
import { InsightsAndLogs } from './components/InsightsAndLogs';
import { CalibrationAndDiagnostics } from './components/CalibrationAndDiagnostics';
import { AndroidAppGuide } from './components/AndroidAppGuide';
import { TankSettingsModal } from './components/TankSettingsModal';
import {
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
  tankCapacityLiters: 500,
  lowThresholdPercent: 25,
  dailyTargetLiters: 120,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBluetoothModalOpen, setIsBluetoothModalOpen] = useState(false);

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

  // Dark mode effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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

      // Verify pending command acknowledgment against confirmed Arduino status
      setPendingCommand((currentPending) => {
        if (!currentPending) return null;

        let matched = false;
        if (
          currentPending.expectedState.target &&
          newTelem.target === currentPending.expectedState.target
        ) {
          matched = true;
        } else if (
          currentPending.expectedState.cutoff &&
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
              target: 90,
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
  const connectBluetooth = async () => {
    if (transportRef.current) {
      await transportRef.current.disconnect();
    }

    const transport = new BluetoothSppTransport({
      onStatusChange: setConnectionState,
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
              target: 90,
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

    addLog('info', 'SYSTEM', 'Connecting to Android HC-05 Bluetooth SPP...');
    const success = await transport.connect();
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
              target: 90,
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
  const sendCommand = async (command: OutgoingCommand): Promise<boolean> => {
    if (!transportRef.current || connectionState.status !== 'connected') {
      addLog('warning', 'COMMAND', `Cannot send "${command}": No active hardware connection.`);
      return false;
    }

    setLastAttemptedCommand(command);
    addLog('command', 'COMMAND', `Dispatched command: ${command}`);

    const expectedState: PendingCommand['expectedState'] = {};
    if (command.startsWith('TARGET:')) {
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
        onConnectBluetooth={connectBluetooth}
        onConnectTestBench={connectTestBench}
        onDisconnect={disconnectHardware}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        webSerialSupported={isWebSerialSupported}
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
              onClick={() => setActiveTab('calibration')}
              className="text-[11px] font-bold underline hover:opacity-80 shrink-0"
            >
              Hardware Diagnostics →
            </button>
          </div>
        )}

        {/* Tab 1: Live Dashboard — Realistic Physical Tank & Vital Telemetry */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
              
              {/* Realistic Physical Tank Visualizer (5 cols) */}
              <div className="lg:col-span-5">
                <TankVisualizer
                  telemetry={telemetry}
                  connectionStatus={connectionState.status}
                  isStale={isStale}
                  tankConfig={tankConfig}
                  onUpdateConfig={handleSaveConfig}
                  lang={lang}
                />
              </div>

              {/* Vital Telemetry Metrics & Today's Usage Tracking (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <TelemetryCards
                  telemetry={telemetry}
                  connectionState={connectionState}
                  isStale={isStale}
                  secondsSinceLastPacket={secondsSinceLastPacket}
                  tankConfig={tankConfig}
                  onUpdateConfig={handleSaveConfig}
                  lang={lang}
                  onToggleFullscreen={toggleFullscreen}
                  isFullscreen={isFullscreen}
                />
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: Water Usage Analytics (Daily, Monthly, Custom Range) */}
        {activeTab === 'usage' && (
          <div className="animate-fade-in">
            <WaterUsageSection
              tankConfig={tankConfig}
              lang={lang}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onUpdateConfig={handleSaveConfig}
            />
          </div>
        )}

        {/* Tab 3: Insights & Audit Logs */}
        {activeTab === 'insights' && (
          <div className="animate-fade-in">
            <InsightsAndLogs
              logs={logs}
              telemetryHistory={telemetryHistory}
              currentTelemetry={telemetry}
              onClearLogs={() => setLogs([])}
              lang={lang}
            />
          </div>
        )}

        {/* Tab 4: Calibration & Diagnostics (Technical Page) */}
        {activeTab === 'calibration' && (
          <div className="animate-fade-in">
            <CalibrationAndDiagnostics
              telemetry={telemetry}
              connectionState={connectionState}
              serialLines={serialLines}
              onSendCommand={sendCommand}
              onClearSerial={() => setSerialLines([])}
              onInjectFault={(fault) => testBenchRef.current?.injectFault(fault)}
              onSetSimulatedWater={(level: number) => testBenchRef.current?.setWaterLevel(level)}
              onOpenWizard={() => setIsSettingsOpen(true)}
              onSimulateLine={handleSimulateLine}
            />
          </div>
        )}

        {/* Tab 5: Hardware & Wiring Guide */}
        {activeTab === 'hardware' && (
          <div className="animate-fade-in">
            <AndroidAppGuide />
          </div>
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
      />

      {/* Bluetooth Classic SPP Architecture Explanation Modal (Requirement 2) */}
      {isBluetoothModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold text-base">
                <Bluetooth className="h-5 w-5" />
                <span>Android HC-05 Connection Notice</span>
              </div>
              <button
                onClick={() => setIsBluetoothModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                <strong>HC-05 uses Bluetooth Classic SPP (RFCOMM)</strong>. Standard web browsers (Chrome, Firefox, Safari) only support BLE (Bluetooth Low Energy GATT) and cannot open RFCOMM serial sockets directly due to browser security sandbox constraints.
              </p>

              <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-500/20 space-y-2">
                <div className="font-bold text-cyan-900 dark:text-cyan-200 flex items-center gap-1.5">
                  <Cable className="h-4 w-4" />
                  <span>Option 1: USB OTG on Android (Instant)</span>
                </div>
                <p className="text-[11px] text-cyan-800 dark:text-cyan-300">
                  Connect your Arduino Uno to your Android phone via a standard USB OTG cable. Google Chrome for Android supports the Web Serial API directly!
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4" />
                  <span>Option 2: Native Android App Container</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  To stream via HC-05 Bluetooth Classic without cables, run our native Android app with the included RFCOMM SPP background service. Complete Kotlin source code is provided.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  setIsBluetoothModalOpen(false);
                  connectUsb();
                }}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <Cable className="h-4 w-4" />
                <span>Connect via USB Serial (OTG)</span>
              </button>

              <button
                onClick={() => {
                  setIsBluetoothModalOpen(false);
                  setActiveTab('hardware');
                }}
                className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>View Android Kotlin Code & Guide</span>
              </button>

              <button
                onClick={() => setIsBluetoothModalOpen(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
