import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Info,
  Power,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { ControlMode, OutgoingCommand, TankConfig, TelemetryData } from '../types';

interface ControlScreenProps {
  telemetry: TelemetryData | null;
  isConnected: boolean;
  tankConfig: TankConfig;
  onUpdateConfig: (newConfig: Partial<TankConfig>) => void;
  onSendCommand: (command: OutgoingCommand | string) => Promise<boolean>;
  lang: Language;
}

export const ControlScreen: React.FC<ControlScreenProps> = ({
  telemetry,
  isConnected,
  tankConfig,
  onUpdateConfig,
  onSendCommand,
  lang,
}) => {
  const t = TRANSLATIONS[lang];

  // Active mode from Arduino telemetry, with local optimistic fallback
  const currentMode: ControlMode = telemetry?.mode ?? 'AUTO';
  const motorStatus = telemetry?.motor ?? 'OFF';

  // Auto start & target levels (synced with Arduino state and local config)
  const [autoStart, setAutoStart] = useState<number>(() => {
    return telemetry?.autoStart ?? tankConfig.autoStartLevel ?? 10;
  });
  const [autoTarget, setAutoTarget] = useState<number>(() => {
    return Math.min(95, telemetry?.autoTarget ?? tankConfig.autoTargetLevel ?? 80);
  });

  // Keep synced if fresh Arduino values arrive
  useEffect(() => {
    if (telemetry?.autoStart !== undefined && telemetry.autoStart !== autoStart) {
      setAutoStart(telemetry.autoStart);
    }
  }, [telemetry?.autoStart]);

  useEffect(() => {
    if (telemetry?.autoTarget !== undefined && telemetry.autoTarget !== autoTarget) {
      setAutoTarget(Math.min(95, telemetry.autoTarget));
    }
  }, [telemetry?.autoTarget]);

  // Loading indicator states for motor action buttons
  const [isSendingStart, setIsSendingStart] = useState(false);
  const [isSendingStop, setIsSendingStop] = useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Switch to MANUAL mode (Requirement 7)
  const handleSelectManual = async () => {
    if (!isConnected || isSwitchingMode) return;
    setIsSwitchingMode(true);
    await onSendCommand('MODE:MANUAL');
    showStatus('MODE:MANUAL sent to Arduino');
    setTimeout(() => setIsSwitchingMode(false), 500);
  };

  // Switch to AUTO mode (Requirement 8)
  const handleSelectAuto = async () => {
    if (!isConnected || isSwitchingMode) return;
    setIsSwitchingMode(true);
    await onSendCommand('MODE:AUTO');
    showStatus('MODE:AUTO sent to Arduino');
    setTimeout(() => setIsSwitchingMode(false), 500);
  };

  // Start Motor (MOTOR_ON\n)
  const handleStartMotor = async () => {
    if (!isConnected || isSendingStart || motorStatus === 'ON') return;
    setIsSendingStart(true);
    await onSendCommand('MOTOR_ON');
    showStatus('MOTOR_ON transmitted. Awaiting Arduino confirmation...');
    setTimeout(() => setIsSendingStart(false), 800);
  };

  // Stop Motor (MOTOR_OFF\n)
  const handleStopMotor = async () => {
    if (!isConnected || isSendingStop || motorStatus === 'OFF') return;
    setIsSendingStop(true);
    await onSendCommand('MOTOR_OFF');
    showStatus('MOTOR_OFF transmitted. Awaiting Arduino confirmation...');
    setTimeout(() => setIsSendingStop(false), 800);
  };

  // Slider change handlers with constraints (Requirements 9 & 10)
  const handleTargetChange = (newTarget: number) => {
    // Never allow target above 95% (Requirement 9 & 11)
    const clampedTarget = Math.max(1, Math.min(95, newTarget));
    setAutoTarget(clampedTarget);

    // If autoStart was >= clampedTarget, adjust autoStart downwards
    if (autoStart >= clampedTarget) {
      const adjustedStart = Math.max(0, clampedTarget - 5);
      setAutoStart(adjustedStart);
      onSendCommand(`AUTO_START:${adjustedStart}`);
    }

    onSendCommand(`AUTO_TARGET:${clampedTarget}`);
    onUpdateConfig({ autoTargetLevel: clampedTarget });
  };

  const handleStartChange = (newStart: number) => {
    // Must remain below AUTO TARGET (Requirement 10)
    const maxAllowedStart = Math.max(0, autoTarget - 2);
    const clampedStart = Math.max(0, Math.min(maxAllowedStart, newStart));
    setAutoStart(clampedStart);

    onSendCommand(`AUTO_START:${clampedStart}`);
    onUpdateConfig({ autoStartLevel: clampedStart });
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 sm:space-y-5 animate-fade-in pb-6">

      {/* Screen Title & Subtitle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Motor & Control Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manual and Automatic water tank pump regulation
          </p>
        </div>

        {/* Live Bluetooth Pill */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
            isConnected
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-500/30'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span>{isConnected ? 'Hardware Active' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Mode Selector Segmented Tabs (MANUAL / AUTO) */}
      <div className="p-1 rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex">
        <button
          onClick={handleSelectManual}
          disabled={!isConnected}
          className={`flex-1 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            currentMode === 'MANUAL'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Power className="h-4 w-4" />
          <span>MANUAL MODE</span>
        </button>

        <button
          onClick={handleSelectAuto}
          disabled={!isConnected}
          className={`flex-1 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            currentMode === 'AUTO'
              ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>AUTO MODE</span>
        </button>
      </div>

      {/* Status Feedback Notice */}
      {statusMessage && (
        <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-500/30 text-cyan-800 dark:text-cyan-200 text-xs font-semibold text-center animate-fade-in">
          {statusMessage}
        </div>
      )}

      {/* SECTION 1: MANUAL CONTROL (Requirement 7) */}
      {currentMode === 'MANUAL' && (
        <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
          
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Power className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                  MANUAL CONTROL ACTIVE
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  User commands operate motor directly with Arduino safety enforcement
                </p>
              </div>
            </div>
            
            <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
              MANUAL
            </span>
          </div>

          {/* Motor Status Box */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Current Motor Status
              </span>
              <div className="text-lg font-black mt-0.5">
                {motorStatus === 'ON' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>🟢 RUNNING</span>
                  </span>
                ) : (
                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-slate-400"></span>
                    <span>⚪ STOPPED</span>
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Tank Level
              </span>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {telemetry?.water !== null ? `${Math.round(telemetry?.water ?? 0)}%` : '—'}
              </div>
            </div>
          </div>

          {/* Manual Control Action Buttons (START / STOP) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleStartMotor}
              disabled={!isConnected || isSendingStart || motorStatus === 'ON'}
              className="py-4 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex flex-col items-center justify-center gap-1"
            >
              <Power className="h-5 w-5" />
              <span>{isSendingStart ? 'Sending...' : 'START MOTOR'}</span>
              <span className="text-[10px] font-normal opacity-80">(MOTOR_ON)</span>
            </button>

            <button
              onClick={handleStopMotor}
              disabled={!isConnected || isSendingStop || motorStatus === 'OFF'}
              className="py-4 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-sm shadow-lg shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex flex-col items-center justify-center gap-1"
            >
              <Power className="h-5 w-5" />
              <span>{isSendingStop ? 'Sending...' : 'STOP MOTOR'}</span>
              <span className="text-[10px] font-normal opacity-80">(MOTOR_OFF)</span>
            </button>
          </div>

          {/* Safety Rule Note (Requirement 7 & 11) */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Safety Protected:</strong> The app must never bypass Arduino safety rules. Even in manual mode, the Arduino automatically cuts power if the water reaches the 95% safety ceiling or if the ultrasonic sensor signal fails.
            </div>
          </div>

        </div>
      )}

      {/* SECTION 2: AUTO MODE (Requirements 8, 9, 10, 11) */}
      {currentMode === 'AUTO' && (
        <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-5">
          
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                  AUTO MODE ACTIVE
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Autonomous water replenishment governed by Arduino
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300">
              AUTO
            </span>
          </div>

          {/* Explanation Text (Requirement 8) */}
          <div className="p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-500/20 text-xs text-cyan-950 dark:text-cyan-200 leading-relaxed">
            “Pump automatically starts when the tank falls below the selected start level and stops when the target level is reached.”
          </div>

          {/* Live Auto Summary Badges (Requirement 8) */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Start below</span>
              <span className="text-lg font-black text-slate-900 dark:text-white">{autoStart}%</span>
            </div>

            <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-500/30">
              <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase block">Stop at</span>
              <span className="text-lg font-black text-cyan-700 dark:text-cyan-300">{autoTarget}%</span>
            </div>

            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-500/30">
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase block">Safety Max</span>
              <span className="text-lg font-black text-rose-700 dark:text-rose-300">95%</span>
            </div>
          </div>

          {/* SLIDER 1: AUTO START LEVEL (Requirement 10) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <span>AUTO START LEVEL</span>
                <span className="text-[10px] text-slate-400 font-normal">(Start When Below)</span>
              </label>
              <span className="text-base font-black text-cyan-600 dark:text-cyan-400">
                {autoStart}%
              </span>
            </div>

            <div className="relative pt-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, autoTarget - 2)}
                step={1}
                value={autoStart}
                onChange={(e) => handleStartChange(parseInt(e.target.value, 10))}
                className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>0% (Empty)</span>
                <span>Max allowed: {Math.max(0, autoTarget - 2)}%</span>
              </div>
            </div>
          </div>

          {/* SLIDER 2: AUTO TARGET LEVEL (Requirement 9 & 11) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <span>AUTO TARGET</span>
                <span className="text-[10px] text-slate-400 font-normal">(Stop When Reached)</span>
              </label>
              <span className="text-base font-black text-cyan-600 dark:text-cyan-400">
                {autoTarget}%
              </span>
            </div>

            <div className="relative pt-1">
              <input
                type="range"
                min={Math.min(95, autoStart + 2)}
                max={95}
                step={1}
                value={autoTarget}
                onChange={(e) => handleTargetChange(parseInt(e.target.value, 10))}
                className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>Min: {Math.min(95, autoStart + 2)}%</span>
                <span className="text-rose-500 font-bold">Hard Limit: 95%</span>
              </div>
            </div>
          </div>

          {/* SAFETY CALLOUT (Requirement 11) */}
          <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-500/30 text-xs text-rose-950 dark:text-rose-200 space-y-1">
            <div className="flex items-center gap-2 font-black uppercase text-[11px] tracking-wider text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-4 w-4" />
              <span>MAXIMUM SAFETY LEVEL: 95%</span>
            </div>
            <p className="text-[11px] opacity-90 leading-relaxed">
              Target slider is strictly capped at 95% to prevent tank overflow. Arduino remains fully responsible for sensor validation, pump safety, runtime timeouts, and emergency cutoffs.
            </p>
          </div>

          {/* Quick Override Stop Button in Auto Mode */}
          {motorStatus === 'ON' && (
            <button
              onClick={handleStopMotor}
              className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Power className="h-4 w-4" />
              <span>EMERGENCY MOTOR STOP (STOP MOTOR)</span>
            </button>
          )}

        </div>
      )}

    </div>
  );
};
