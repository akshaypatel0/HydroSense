import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bug,
  Cable,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  HelpCircle,
  Play,
  Radio,
  RotateCcw,
  Send,
  Sliders,
  Terminal,
  Trash2,
  Wifi,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { parseStatusLine, ProtocolTestResult, runProtocolSelfTests } from '../protocol/protocolParser';
import { ConnectionState, OutgoingCommand, TelemetryData } from '../types';

interface SerialLine {
  id: string;
  timestamp: number;
  direction: 'RX' | 'TX';
  text: string;
}

interface CalibrationAndDiagnosticsProps {
  telemetry: TelemetryData | null;
  connectionState: ConnectionState;
  serialLines: SerialLine[];
  onSendCommand: (cmd: OutgoingCommand) => Promise<boolean>;
  onClearSerial: () => void;
  onInjectFault?: (
    fault:
      | 'SENSOR:ABSENT'
      | 'HIGH_92'
      | 'CRITICAL_96'
      | 'TANK_FULL_99'
      | 'HYSTERESIS_97'
      | 'CLEAR'
  ) => void;
  onSetSimulatedWater?: (level: number) => void;
  onOpenWizard?: () => void;
  onSimulateLine?: (line: string) => void;
}

export const CalibrationAndDiagnostics: React.FC<CalibrationAndDiagnosticsProps> = ({
  telemetry,
  connectionState,
  serialLines,
  onSendCommand,
  onClearSerial,
  onInjectFault,
  onSetSimulatedWater,
  onOpenWizard,
  onSimulateLine,
}) => {
  const [manualCmd, setManualCmd] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [testResults, setTestResults] = useState<ProtocolTestResult[] | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [calibratingType, setCalibratingType] = useState<'empty' | 'full' | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serialLines, autoScroll]);

  const handleSendManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCmd.trim()) return;
    onSendCommand(manualCmd.trim() as OutgoingCommand);
    setManualCmd('');
  };

  const [requestingStatus, setRequestingStatus] = useState(false);

  const handleRequestStatus = async () => {
    setRequestingStatus(true);
    await onSendCommand('STATUS');
    setTimeout(() => setRequestingStatus(false), 1200);
  };

  const handleCalibrateEmpty = async () => {
    setCalibratingType('empty');
    await onSendCommand('CAL_EMPTY');
    setTimeout(() => setCalibratingType(null), 1500);
  };

  const handleCalibrateFull = async () => {
    setCalibratingType('full');
    await onSendCommand('CAL_FULL');
    setTimeout(() => setCalibratingType(null), 1500);
  };

  const handleRunSelfTests = () => {
    setTestRunning(true);
    setTimeout(() => {
      const results = runProtocolSelfTests();
      setTestResults(results);
      setTestRunning(false);
    }, 200);
  };

  const isConnected = connectionState.status === 'connected';
  const calEmpty = telemetry?.calEmpty ?? 12.8;
  const calFull = telemetry?.calFull ?? 2.1;
  const usableDepth = Math.max(0.1, Math.round((calEmpty - calFull) * 10) / 10);

  // Time calculations
  const formatTimeAgo = (ts?: number | null) => {
    if (!ts) return 'Never';
    const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s ago`;
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100 animate-fade-in">
      
      {/* 1. Live Connection & Streaming Diagnostics Panel (Requirement 5) */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Hardware Connection Diagnostics
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time transport health, reader stream state, and raw byte telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 ${
                connectionState.status === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                  : connectionState.status === 'connecting'
                  ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 animate-pulse'
                  : connectionState.status === 'error'
                  ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState.status === 'connected'
                    ? 'bg-emerald-500'
                    : connectionState.status === 'connecting'
                    ? 'bg-amber-500'
                    : connectionState.status === 'error'
                    ? 'bg-rose-500'
                    : 'bg-slate-400'
                }`}
              />
              {connectionState.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Diagnostic Key-Value Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
          
          {/* Metric 1: Transport Method */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
              Connection Method
            </span>
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1 text-sm">
              {connectionState.transport === 'usb_serial' ? (
                <>
                  <Cable className="h-4 w-4 text-cyan-500" /> USB Serial
                </>
              ) : connectionState.transport === 'bluetooth_spp' ? (
                <>
                  <Wifi className="h-4 w-4 text-blue-500" /> HC-05 Bluetooth
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4 text-indigo-500" /> Virtual Bench
                </>
              )}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              9600 Baud · 8N1
            </span>
          </div>

          {/* Metric 2: Stream Reader State */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
              Active Reader Stream
            </span>
            <span
              className={`font-bold flex items-center gap-1 text-sm ${
                connectionState.readerActive
                  ? 'text-emerald-800 dark:text-emerald-400'
                  : 'text-slate-500'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState.readerActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                }`}
              />
              {connectionState.readerActive ? 'LISTENING' : 'IDLE'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              {connectionState.bytesReceived || 0} bytes in
            </span>
          </div>

          {/* Metric 3: Valid Telemetry Timestamp */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
              Valid Telemetry Time
            </span>
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1 text-sm">
              <Clock className="h-3.5 w-3.5 text-cyan-500" />
              {formatTimeAgo(connectionState.lastValidTelemetryTime)}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              {connectionState.packetsReceived || 0} packets parsed
            </span>
          </div>

          {/* Metric 4: Live Water Level */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
              Parsed Water Level
            </span>
            <span className="font-mono font-black text-slate-900 dark:text-white text-base">
              {telemetry?.isSensorUnavailable
                ? 'Unavailable'
                : telemetry?.water !== null && telemetry?.water !== undefined
                ? `${telemetry.water.toFixed(1)}%`
                : '—'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              Dist: {telemetry?.distance !== undefined ? `${telemetry.distance.toFixed(1)} cm` : '—'}
            </span>
          </div>

        </div>

        {/* Last Raw Text Box */}
        <div className="rounded-2xl bg-slate-950 p-3.5 border border-slate-800 text-xs font-mono">
          <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center justify-between">
            <span>Last Received Raw String from Arduino</span>
            <span className="text-slate-500">
              {connectionState.lastRawLineTime ? formatTimeAgo(connectionState.lastRawLineTime) : 'None'}
            </span>
          </div>
          <div className="text-emerald-400 break-all select-all font-semibold">
            {connectionState.lastRawText ?? '(No raw bytes received yet from hardware port)'}
          </div>
        </div>

        {/* Warning Alert if No Bytes or Error */}
        {connectionState.noDataAlert && (
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <span className="font-bold block">Connected, but no bytes arriving:</span>
              Port was opened at 9600 baud, but 0 bytes have been transmitted by the Arduino. Check that your Arduino Uno is powered, the sketch is running, and the USB cable supports data transfer (not charge-only).
            </div>
          </div>
        )}

        {connectionState.errorMessage && (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
            <div>
              <span className="font-bold block">Connection Issue:</span>
              {connectionState.errorMessage}
            </div>
          </div>
        )}

      </div>

      {/* 2. Interactive Packet Simulation & Verification (Requirement 7) */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Play className="h-4 w-4 text-cyan-500" />
              Arduino Protocol Packet Simulator
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inject real Arduino Uno sample strings to verify parser behavior immediately
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          
          {/* Option A: Real USB Serial string */}
          <button
            type="button"
            onClick={() => onSimulateLine?.('Distance: 8.25 cm | Water Level: 48.9%')}
            className="p-3 rounded-2xl border border-cyan-500/30 bg-cyan-50/50 hover:bg-cyan-100/70 dark:bg-cyan-950/30 dark:hover:bg-cyan-900/40 text-left transition-colors"
          >
            <div className="font-bold text-cyan-900 dark:text-cyan-200 flex items-center justify-between">
              <span>Simulate USB Serial Packet</span>
              <Cable className="h-3.5 w-3.5" />
            </div>
            <div className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300 mt-1">
              "Distance: 8.25 cm | Water Level: 48.9%"
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Tests human-readable formatted stream
            </div>
          </button>

          {/* Option B: Real Bluetooth HC-05 string */}
          <button
            type="button"
            onClick={() => onSimulateLine?.('DISTANCE:8.25,LEVEL:48.9')}
            className="p-3 rounded-2xl border border-blue-500/30 bg-blue-50/50 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-left transition-colors"
          >
            <div className="font-bold text-blue-900 dark:text-blue-200 flex items-center justify-between">
              <span>Simulate Bluetooth HC-05 Packet</span>
              <Wifi className="h-3.5 w-3.5" />
            </div>
            <div className="font-mono text-[11px] text-blue-700 dark:text-blue-300 mt-1">
              "DISTANCE:8.25,LEVEL:48.9"
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Tests machine-readable key-value stream
            </div>
          </button>

        </div>
      </div>

      {/* 3. Sensor Calibration & EEPROM Information */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800/80 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Hardware Sensor Calibration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Arduino EEPROM Calibrated Empty and Full Points
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onOpenWizard && (
              <button
                onClick={onOpenWizard}
                className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Launch Calibration Wizard</span>
              </button>
            )}
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              EEPROM: <strong className="text-emerald-800 dark:text-emerald-400">{telemetry?.calStatus ?? 'OK'}</strong>
            </div>
          </div>
        </div>

        {/* Calibration Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[11px] text-slate-500 block uppercase font-medium">Empty Point (0%)</span>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
              {calEmpty.toFixed(1)} <span className="text-xs font-sans text-slate-500">cm</span>
            </div>
            <span className="text-[10px] text-slate-400">Stored in Arduino EEPROM</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[11px] text-slate-500 block uppercase font-medium">Full Point (100%)</span>
            <div className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-0.5">
              {calFull.toFixed(1)} <span className="text-xs font-sans text-slate-500">cm</span>
            </div>
            <span className="text-[10px] text-slate-400">Stored in Arduino EEPROM</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60">
            <span className="text-[11px] text-slate-500 block uppercase font-medium">Total Usable Height</span>
            <div className="text-xl font-bold font-mono text-emerald-800 dark:text-emerald-400 mt-0.5">
              {usableDepth.toFixed(1)} <span className="text-xs font-sans text-slate-500">cm</span>
            </div>
            <span className="text-[10px] text-slate-400">Empty distance - Full distance</span>
          </div>
        </div>

        {/* Live Distance from Sensor */}
        <div className="p-4 rounded-2xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Current Sensor Distance (Raw HC-SR04)
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Live ultrasonic acoustic echo reflection time divided by sound speed
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black font-mono text-cyan-700 dark:text-cyan-300">
              {telemetry?.distance !== undefined ? `${telemetry.distance.toFixed(2)} cm` : '—'}
            </div>
            <span className="text-[10px] text-slate-400">Sensor to water surface</span>
          </div>
        </div>

        {/* Direct Hardware Calibration & STATUS Query */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-bold block">
                Direct Hardware EEPROM Calibration & Status:
              </span>
              <span className="text-[11px] text-slate-500">
                Arduino is the source of truth. Send commands followed by newline and receive verified ACKs.
              </span>
            </div>

            <button
              onClick={handleRequestStatus}
              disabled={!isConnected || requestingStatus}
              className="px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-50/70 hover:bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 active:scale-[0.98] text-xs font-bold disabled:opacity-40 transition-all text-center flex items-center justify-center gap-1.5 shrink-0"
              title="Send STATUS\n to query Arduino EEPROM stored calibration"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${requestingStatus ? 'animate-spin' : ''}`} />
              <span>{requestingStatus ? 'Querying...' : 'Request Stored Values (STATUS)'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white">1. Calibrate Empty (0%)</span>
                <span className="font-mono text-[10px] text-slate-400">CAL_EMPTY\n</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Place sensor at the empty-tank reference position pointing to dry bottom floor, then trigger:
              </p>
              <button
                onClick={handleCalibrateEmpty}
                disabled={!isConnected || calibratingType !== null}
                className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] text-xs font-bold disabled:opacity-40 transition-all text-center text-slate-900 dark:text-white"
              >
                {calibratingType === 'empty' ? 'Waiting for ACK:CAL_EMPTY:OK...' : 'Send CAL_EMPTY'}
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white">2. Calibrate Full (100%)</span>
                <span className="font-mono text-[10px] text-slate-400">CAL_FULL\n</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Place sensor at the full-tank reference position pointing to maximum water line, then trigger:
              </p>
              <button
                onClick={handleCalibrateFull}
                disabled={!isConnected || calibratingType !== null}
                className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] text-xs font-bold disabled:opacity-40 transition-all text-center text-slate-900 dark:text-white"
              >
                {calibratingType === 'full' ? 'Waiting for ACK:CAL_FULL:OK...' : 'Send CAL_FULL'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Serial Stream Monitor & Protocol Unit Test Suite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        
        {/* Serial Terminal (7 cols) */}
        <div className="lg:col-span-7 rounded-3xl border border-slate-200/80 bg-white/70 p-4 sm:p-5 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-500" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Live Serial Stream Monitor
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1 cursor-pointer text-slate-500 text-[11px]">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded accent-cyan-600"
                />
                <span>Scroll</span>
              </label>
              <button
                onClick={onClearSerial}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 active:scale-90 transition-transform"
                title="Clear buffer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="h-56 sm:h-64 overflow-y-auto touch-scroll rounded-2xl bg-slate-950 p-3 font-mono text-[11px] text-slate-200 shadow-inner border border-slate-800 space-y-1">
            {serialLines.length > 0 ? (
              serialLines.map((line) => (
                <div key={line.id} className="flex items-start gap-1.5 leading-snug">
                  <span className="text-slate-500 text-[10px] select-none shrink-0">
                    [{new Date(line.timestamp).toLocaleTimeString()}]
                  </span>
                  <span
                    className={`text-[9px] px-1 rounded font-bold shrink-0 ${
                      line.direction === 'TX'
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/50'
                        : 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                    }`}
                  >
                    {line.direction}
                  </span>
                  <span
                    className={`break-all ${
                      line.direction === 'TX' ? 'text-cyan-200' : 'text-emerald-300'
                    }`}
                  >
                    {line.text}
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Serial monitor buffer empty.
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>

          <form onSubmit={handleSendManual} className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={manualCmd}
              onChange={(e) => setManualCmd(e.target.value)}
              placeholder="Command (CAL_EMPTY, CAL_FULL, TARGET:80)..."
              disabled={!isConnected}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-3 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isConnected || !manualCmd.trim()}
              className="flex items-center gap-1 rounded-xl bg-cyan-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 active:scale-95 disabled:opacity-40 shrink-0 transition-transform"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>

          {/* Quick Shortcuts */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[10px] font-mono">
            <span className="text-slate-400 font-sans mr-0.5">Quick:</span>
            {(['STATUS', 'CAL_EMPTY', 'CAL_FULL', 'TARGET:80', 'CUTOFF:90'] as OutgoingCommand[]).map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => onSendCommand(cmd)}
                disabled={!isConnected}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>

        {/* Protocol Test Suite (5 cols) */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200/80 bg-white/70 p-5 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-3">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Bug className="h-4 w-4 text-cyan-500" />
                Protocol Unit Tests
              </h3>
              <p className="text-[10px] text-slate-500">Verified against real Arduino Uno outputs</p>
            </div>
            <button
              onClick={handleRunSelfTests}
              disabled={testRunning}
              className="px-3 py-1 rounded-xl bg-slate-900 dark:bg-cyan-600 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-cyan-500 transition-colors"
            >
              {testRunning ? 'Testing...' : 'Run Tests'}
            </button>
          </div>

          <div className="flex-1 max-h-72 overflow-y-auto space-y-2 pr-1">
            {testResults ? (
              testResults.map((testItem, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border text-[11px] ${
                    testItem.passed
                      ? 'border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
                      : 'border-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20 text-rose-950 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1 truncate">
                      {testItem.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      )}
                      {testItem.name}
                    </span>
                    <span className="text-[9px] uppercase font-mono">{testItem.passed ? 'PASS' : 'FAIL'}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 break-all">
                    {testItem.actual}
                  </p>
                </div>
              ))
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-xs text-center px-4">
                Click "Run Tests" to verify packet parsing with split chunks, USB format, Bluetooth format & ACKs.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
