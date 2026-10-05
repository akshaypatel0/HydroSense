import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bluetooth,
  CheckCircle2,
  Droplets,
  Power,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { ConnectionState, OutgoingCommand, TankConfig, TelemetryData } from '../types';

interface HomeScreenProps {
  telemetry: TelemetryData | null;
  connectionState: ConnectionState;
  tankConfig: TankConfig;
  onSendCommand: (command: OutgoingCommand | string) => Promise<boolean>;
  onConnectBluetooth: () => void;
  lang: Language;
  onNavigateToControl: () => void;
  onNavigateToSettings: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  telemetry,
  connectionState,
  tankConfig,
  onSendCommand,
  onConnectBluetooth,
  lang,
  onNavigateToControl,
  onNavigateToSettings,
}) => {
  const t = TRANSLATIONS[lang];
  const isConnected = connectionState.status === 'connected';

  // Smooth animation interpolation state for water level
  const [animatedLevel, setAnimatedLevel] = useState<number>(() => {
    return telemetry?.water ?? 50;
  });
  const targetLevelRef = useRef<number>(telemetry?.water ?? 50);
  const animFrameRef = useRef<number | null>(null);

  // Command awaiting states for motor buttons
  const [isSendingStart, setIsSendingStart] = useState(false);
  const [isSendingStop, setIsSendingStop] = useState(false);
  const [lastMotorActionTime, setLastMotorActionTime] = useState<number>(0);

  // Sensor error states from Arduino
  const isSensorAbsent = Boolean(
    telemetry?.isSensorUnavailable ||
    telemetry?.error === 'SENSOR_ABSENT' ||
    telemetry?.error === 'SENSOR:ABSENT'
  );
  const isSensorOutOfRange = Boolean(
    telemetry?.error === 'SENSOR_OUT_OF_RANGE' ||
    telemetry?.error?.includes('OUT_OF_RANGE')
  );
  const hasSensorError = isSensorAbsent || isSensorOutOfRange;

  // Real Arduino water level percentage (never fake/random when connected)
  const realWater = isConnected && !hasSensorError && telemetry && telemetry.water !== null
    ? telemetry.water
    : null;

  // Update target for smooth interpolation
  useEffect(() => {
    if (realWater !== null) {
      targetLevelRef.current = realWater;
    }
  }, [realWater]);

  // Smooth visual damping loop (damping factor 0.06 ensures no jitter on micro-changes)
  useEffect(() => {
    const animate = () => {
      setAnimatedLevel((prev) => {
        const target = targetLevelRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.05) {
          return target;
        }
        return prev + diff * 0.07;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Motor state confirmed by Arduino
  const motorStatus = telemetry?.motor ?? 'OFF';
  const controlMode = telemetry?.mode ?? 'AUTO';
  const autoTarget = telemetry?.autoTarget ?? tankConfig.autoTargetLevel ?? 80;

  // Litres calculation strictly per protocol: Litres = Level × Tank Capacity / 100
  const capacity = tankConfig.tankCapacityLiters || 1000;
  const currentLitres = realWater !== null
    ? Math.round((realWater / 100) * capacity)
    : null;

  // Motor command handlers (Sends MOTOR_ON\n and MOTOR_OFF\n)
  const handleStartMotor = async () => {
    if (isSendingStart) return;
    setIsSendingStart(true);
    setLastMotorActionTime(Date.now());
    await onSendCommand('MOTOR_ON');
    setTimeout(() => setIsSendingStart(false), 800);
  };

  const handleStopMotor = async () => {
    if (isSendingStop) return;
    setIsSendingStop(true);
    setLastMotorActionTime(Date.now());
    await onSendCommand('MOTOR_OFF');
    setTimeout(() => setIsSendingStop(false), 800);
  };

  // Wave phase animation offset
  const [waveOffset, setWaveOffset] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setWaveOffset((prev) => (prev + 1) % 360);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Compute SVG wave curves for the animated water surface
  const waterHeightPercent = Math.min(100, Math.max(0, animatedLevel));
  // Y coordinate in SVG space (0 at top, 200 at bottom)
  const waterTopY = 200 - (waterHeightPercent / 100) * 190;
  const waveAmp = motorStatus === 'ON' ? 4 : 2;
  const rad = (waveOffset * Math.PI) / 180;
  const wave1Y = waterTopY + Math.sin(rad) * waveAmp;
  const wave2Y = waterTopY + Math.cos(rad) * waveAmp;

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 sm:space-y-5 animate-fade-in pb-4">

      {/* SENSOR ERROR ALERTS BANNER (Requirement 4) */}
      {isConnected && hasSensorError && (
        <div
          className={`p-4 rounded-3xl border shadow-lg backdrop-blur-xl animate-fade-in ${
            isSensorAbsent
              ? 'bg-rose-50/95 border-rose-300 dark:bg-rose-950/80 dark:border-rose-800/80 text-rose-900 dark:text-rose-200'
              : 'bg-amber-50/95 border-amber-300 dark:bg-amber-950/80 dark:border-amber-800/80 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-white/80 dark:bg-black/40 shadow-sm shrink-0 mt-0.5">
              <ShieldAlert
                className={`h-5 w-5 ${
                  isSensorAbsent ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-sm sm:text-base tracking-tight">
                {isSensorAbsent
                  ? '🔴 SENSOR ERROR'
                  : '⚠️ SENSOR OUT OF RANGE'}
              </div>
              <p className="text-xs mt-0.5 opacity-90 leading-relaxed font-medium">
                {isSensorAbsent
                  ? 'No ultrasonic echo detected. Check HC-SR04 TRIG & ECHO wiring.'
                  : 'Check ultrasonic sensor position and water distance.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* BLUETOOTH DISCONNECTED NOTICE (Requirement 22) */}
      {!isConnected && (
        <div className="p-4 rounded-3xl border border-rose-300/80 bg-rose-50/95 dark:border-rose-900/60 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200 shadow-md backdrop-blur-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="h-3 w-3 rounded-full bg-rose-500"></span>
            </span>
            <div className="min-w-0">
              <div className="font-extrabold text-xs sm:text-sm">
                🔴 {t.btDisconnected}
              </div>
              <div className="text-[11px] opacity-80 truncate">
                Live Arduino reading is currently unavailable.
              </div>
            </div>
          </div>

          <button
            onClick={onConnectBluetooth}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shadow-md shrink-0 transition-all flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t.reconnect}</span>
          </button>
        </div>
      )}

      {/* MAIN LARGE WATER LEVEL CARD (Requirement 5 & 19) */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 transition-all">
        
        {/* Card Header */}
        <div className="flex items-center justify-between text-xs mb-3">
          <div className="flex items-center gap-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
            <Droplets className="h-4 w-4 text-cyan-500" />
            <span>{t.waterLevelTitle}</span>
          </div>

          {/* Safety Limit Indicator */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
            <span>Safety Limit:</span>
            <span className="font-bold text-cyan-600 dark:text-cyan-400">95%</span>
          </div>
        </div>

        {/* Large Percentage Typography */}
        <div className="text-center my-1 sm:my-2">
          {realWater !== null ? (
            <div className="inline-flex items-baseline gap-1">
              <span className="text-5xl sm:text-6xl font-black tracking-tight text-slate-900 dark:text-white font-sans">
                {Math.round(realWater)}
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-cyan-600 dark:text-cyan-400">
                %
              </span>
            </div>
          ) : (
            <div className="text-3xl sm:text-4xl font-extrabold text-slate-400 dark:text-slate-500">
              {isConnected ? 'SENSOR ERROR' : '— —'}
            </div>
          )}
        </div>

        {/* Large Beautiful Animated Water Tank (Requirement 5 & 23) */}
        <div className="relative mx-auto my-4 w-52 sm:w-60 h-64 sm:h-72 select-none">
          
          {/* Tank Glass Outer Cylinder Shell */}
          <div className="absolute inset-0 rounded-[44px] border-4 border-slate-300/80 dark:border-slate-700/80 shadow-inner bg-gradient-to-b from-slate-100/60 to-slate-200/40 dark:from-slate-800/40 dark:to-slate-900/60 backdrop-blur-md overflow-hidden">
            
            {/* Graduated Water Level Tick Marks */}
            <div className="absolute inset-y-0 right-3.5 flex flex-col justify-between py-5 z-20 text-[9px] font-mono font-bold text-slate-400/80 dark:text-slate-500/80 pointer-events-none select-none">
              <span className="flex items-center gap-1">─ 100%</span>
              <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-extrabold">
                ─ 80% (Target)
              </span>
              <span className="flex items-center gap-1">─ 50%</span>
              <span className="flex items-center gap-1 text-amber-500 font-extrabold">
                ─ 25% (Low)
              </span>
              <span className="flex items-center gap-1">─ 0%</span>
            </div>

            {/* SVG Animated Water Fluid */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 200 200"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Modern Fluid Gradient */}
                <linearGradient id="hydroWaterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.95" />
                  <stop offset="40%" stopColor="#0EA5E9" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity="0.98" />
                </linearGradient>

                <linearGradient id="hydroSurfaceWave" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#E0F2FE" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#7DD3FC" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              {/* Water Body (renders when level > 0 and no sensor absent) */}
              {!hasSensorError && waterHeightPercent > 0 && (
                <>
                  {/* Wave backlayer */}
                  <path
                    d={`M 0,${wave2Y} Q 50,${wave2Y - waveAmp * 1.5} 100,${wave2Y} T 200,${wave2Y} L 200,200 L 0,200 Z`}
                    fill="#0284C7"
                    opacity="0.4"
                  />
                  {/* Primary Water Fluid */}
                  <path
                    d={`M 0,${wave1Y} Q 50,${wave1Y + waveAmp * 1.5} 100,${wave1Y} T 200,${wave1Y} L 200,200 L 0,200 Z`}
                    fill="url(#hydroWaterGradient)"
                  />
                  {/* Crest highlight */}
                  <path
                    d={`M 0,${wave1Y} Q 50,${wave1Y + waveAmp * 1.5} 100,${wave1Y} T 200,${wave1Y}`}
                    stroke="url(#hydroSurfaceWave)"
                    strokeWidth="2.5"
                    fill="none"
                  />
                </>
              )}
            </svg>

            {/* In-Tank Rising Bubbles when Motor is RUNNING */}
            {motorStatus === 'ON' && !hasSensorError && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute left-8 bottom-6 w-2 h-2 rounded-full bg-white/70 animate-bounce duration-700" />
                <div className="absolute left-20 bottom-10 w-3 h-3 rounded-full bg-white/50 animate-bounce duration-1000 delay-150" />
                <div className="absolute left-32 bottom-4 w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce duration-500 delay-300" />
              </div>
            )}

            {/* Glass Specular Reflection Highlight */}
            <div className="absolute inset-y-0 left-2 w-5 bg-gradient-to-r from-white/30 to-transparent rounded-l-[40px] pointer-events-none z-20" />
          </div>

          {/* Centered Water Tank Label Overlay (Requirement 19) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
            <div className="px-3.5 py-1.5 rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-sm text-center">
              <span className="text-[11px] font-extrabold tracking-wider uppercase text-slate-800 dark:text-slate-100 block">
                WATER TANK
              </span>
              <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                {capacity} L Model
              </span>
            </div>
          </div>
        </div>

        {/* Volume in Litres: 780 L of 1000 L (Requirement 5 & 19) */}
        <div className="text-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
            {currentLitres !== null ? `${currentLitres.toLocaleString()} L` : '— L'}{' '}
            <span className="text-slate-400 dark:text-slate-500 font-semibold text-sm">
              of {capacity.toLocaleString()} L
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Calculated: Level ({realWater !== null ? `${realWater.toFixed(1)}%` : '—'}) × {capacity} L / 100
          </p>
        </div>

      </div>

      {/* DEDICATED MOTOR CARD (Requirement 6 & 19) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 transition-all space-y-4">
        
        {/* Card Header & Live Status */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              MOTOR
            </div>
            <div className="flex items-center gap-2 mt-1">
              {motorStatus === 'ON' ? (
                <div className="flex items-center gap-1.5 text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span>🟢 RUNNING</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-base sm:text-lg font-black text-slate-600 dark:text-slate-300">
                  <span className="h-3 w-3 rounded-full bg-slate-400 dark:bg-slate-600"></span>
                  <span>⚪ STOPPED</span>
                </div>
              )}
            </div>
          </div>

          {/* Mode Pill Badge (MODE: AUTO or MODE: MANUAL) */}
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Current Mode</span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-black tracking-wide uppercase ${
                controlMode === 'AUTO'
                  ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-500/30'
              }`}
            >
              MODE: {controlMode}
            </span>
          </div>
        </div>

        {/* Auto Target Info Bar */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between text-xs font-medium">
          <div className="text-slate-600 dark:text-slate-300">
            Auto target: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{autoTarget}%</strong>
          </div>
          <button
            onClick={onNavigateToControl}
            className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline font-bold text-xs"
          >
            <span>Adjust Settings</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Manual Motor Control Action Buttons (Requirement 6) */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={handleStartMotor}
            disabled={!isConnected || isSendingStart || motorStatus === 'ON'}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Power className="h-4 w-4" />
            <span>{isSendingStart ? 'Starting...' : 'START MOTOR'}</span>
          </button>

          <button
            onClick={handleStopMotor}
            disabled={!isConnected || isSendingStop || motorStatus === 'OFF'}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Power className="h-4 w-4" />
            <span>{isSendingStop ? 'Stopping...' : 'STOP MOTOR'}</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-tight">
          Commands transmit directly to Arduino (<code>MOTOR_ON\n</code> / <code>MOTOR_OFF\n</code>). Status confirmed by Arduino controller.
        </p>

      </div>

    </div>
  );
};
