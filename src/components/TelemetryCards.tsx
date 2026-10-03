import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Droplets,
  Edit3,
  Gauge,
  Info,
  Maximize2,
  Minimize2,
  Radio,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Target,
  Waves,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { usageTracker } from '../services/usageTracker';
import { ConnectionState, TankConfig, TelemetryData, WaterLevelStatus } from '../types';

interface TelemetryCardsProps {
  telemetry: TelemetryData | null;
  connectionState: ConnectionState;
  isStale: boolean;
  secondsSinceLastPacket: number | null;
  tankConfig: TankConfig;
  onUpdateConfig?: (newConfig: Partial<TankConfig>) => void;
  lang: Language;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const TelemetryCards: React.FC<TelemetryCardsProps> = ({
  telemetry,
  connectionState,
  isStale,
  secondsSinceLastPacket,
  tankConfig,
  onUpdateConfig,
  lang,
  onToggleFullscreen,
  isFullscreen,
}) => {
  const t = TRANSLATIONS[lang];
  const isConnected = connectionState.status === 'connected';
  const hasData = isConnected && telemetry !== null;

  const isSensorUnavailable =
    hasData && Boolean(telemetry.isSensorUnavailable || telemetry.error === 'SENSOR:ABSENT');
  const hasValidWater = hasData && !isSensorUnavailable && telemetry.water !== null;

  // Direct raw water level without artificial smoothing
  const waterPercent = hasValidWater ? telemetry.water : null;

  // Volume calculations in Liters
  const currentLiters =
    hasValidWater && waterPercent !== null
      ? Math.round(((waterPercent / 100) * tankConfig.tankCapacityLiters) * 10) / 10
      : null;
  const freeLiters =
    currentLiters !== null
      ? Math.max(0, Math.round((tankConfig.tankCapacityLiters - currentLiters) * 10) / 10)
      : null;

  // Usage & Target tracking
  const todayUsage = usageTracker.getTodayUsage();
  const todayRefills = usageTracker.getTodayRefills?.() ?? 0;
  const dailyTarget = usageTracker.getDailyTarget();
  const targetUsedPercent = Math.min(100, Math.round((todayUsage / Math.max(1, dailyTarget)) * 100));

  // Buzzer & Alarm States
  const isBuzzerActive = hasData && telemetry.buzzer === 'ON';
  const isContinuousBuzzer = hasData && Boolean(telemetry.continuousBuzzer);
  const isTankFull =
    hasValidWater && waterPercent !== null && (Boolean(telemetry.isTankFull) || waterPercent >= 98.9);

  // Capacity Form State
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [customInput, setCustomInput] = useState(tankConfig.tankCapacityLiters.toString());

  const handleApplyCapacity = (liters: number) => {
    if (liters <= 0) return;
    onUpdateConfig?.({ tankCapacityLiters: liters });
    setCustomInput(liters.toString());
    setIsEditingCapacity(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customInput);
    if (!isNaN(val) && val > 0) {
      handleApplyCapacity(Math.round(val));
    }
  };

  // Smart bilingual insight matching final Arduino thresholds
  const getInsight = () => {
    if (!isConnected) {
      return {
        type: 'info',
        text: 'Connect Arduino via USB Serial or Android Bluetooth to stream live water tank telemetry.',
      };
    }
    if (!telemetry) {
      if (connectionState.noDataAlert) {
        return {
          type: 'warning',
          text: 'Connected to serial port, awaiting bytes from Arduino (verify 9600 baud and power).',
        };
      }
      return {
        type: 'info',
        text: 'Connected. Receiving authoritative sensor data from Arduino Uno...',
      };
    }
    if (isSensorUnavailable) {
      return {
        type: 'error',
        text: 'HC-SR04 Ultrasonic sensor is absent or disconnected. Check Trig/Echo wiring.',
      };
    }
    if (isTankFull) {
      return {
        type: 'critical',
        text: 'Tank Full: Water has reached 98.9%+ capacity! Continuous safety buzzer is active.',
      };
    }
    if (waterPercent !== null && waterPercent > 95.0) {
      return {
        type: 'critical',
        text: 'Critical level warning: Tank water level has exceeded 95%.',
      };
    }
    if (waterPercent !== null && waterPercent > 90.0) {
      return {
        type: 'warning',
        text: 'High level warning: Tank water level has exceeded 90%.',
      };
    }
    if (waterPercent !== null && waterPercent <= (tankConfig.lowThresholdPercent || 25)) {
      return {
        type: 'warning',
        text: 'Water level is low (≤25%). Refill recommended.',
      };
    }
    return {
      type: 'normal',
      text: 'Water level is normal. Real-time telemetry nominal.',
    };
  };

  const insight = getInsight();

  const getTranslatedStatus = (st?: WaterLevelStatus) => {
    if (!st || !hasData) return t.statusOffline;
    if (isSensorUnavailable || st === 'SENSOR_ABSENT') return t.sensorUnavailable;
    if (isTankFull) return t.statusTankFull;
    switch (st) {
      case 'LOW':
        return t.statusLow;
      case 'NORMAL':
        return t.statusNormal;
      case 'HIGH':
        return t.statusHigh;
      case 'CRITICAL':
        return t.statusCritical;
      default:
        return st;
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-4 text-slate-900 dark:text-slate-100">
      
      {/* 1. PRIMARY WATER USAGE & TANK CAPACITY CALCULATOR CARD */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-4 sm:p-5 shadow-xl backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        {/* Header with Title & Fullscreen Button */}
        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">
                Tank Capacity & Water Usage
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Calculates stored volume & tracks daily consumption
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Monitor'}
                className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 active:scale-95 transition-all text-xs font-bold flex items-center gap-1"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Full Screen'}</span>
              </button>
            )}

            <button
              onClick={() => setIsEditingCapacity(!isEditingCapacity)}
              className="px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-50/70 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 active:scale-95 transition-all text-xs font-bold flex items-center gap-1"
            >
              <Edit3 className="h-3 w-3" />
              <span>{isEditingCapacity ? 'Close' : 'Set Capacity'}</span>
            </button>
          </div>
        </div>

        {/* Quick Capacity Preset Buttons */}
        <div>
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              Select Tank Capacity:
            </span>
            <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
              Current: {tankConfig.tankCapacityLiters} {t.litersUnit}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[300, 500, 750, 1000, 1500, 2000, 5000].map((preset) => (
              <button
                key={preset}
                onClick={() => handleApplyCapacity(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all active:scale-95 ${
                  tankConfig.tankCapacityLiters === preset
                    ? 'bg-cyan-600 text-white shadow-sm ring-2 ring-cyan-500/40'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {preset}L
              </button>
            ))}
          </div>

          {/* Custom Capacity Input Field */}
          {isEditingCapacity && (
            <form onSubmit={handleCustomSubmit} className="mt-3 flex items-center gap-2 animate-fade-in">
              <input
                type="number"
                min="10"
                max="100000"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Enter tank capacity in liters..."
                className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Apply</span>
              </button>
            </form>
          )}
        </div>

        {/* Real-Time Calculated Water Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* 1. Stored Volume */}
          <div className="rounded-2xl bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-500/20 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 block">
              Stored Volume
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-cyan-700 dark:text-cyan-300 tabular-nums">
                {currentLiters !== null ? currentLiters.toFixed(1) : '—'}
              </span>
              <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400">L</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block truncate">
              {waterPercent !== null ? `${waterPercent.toFixed(1)}% full` : 'No reading'}
            </span>
          </div>

          {/* 2. Available Headroom (Free Space) */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800/60 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Empty Space
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white tabular-nums">
                {freeLiters !== null ? freeLiters.toFixed(1) : '—'}
              </span>
              <span className="text-xs font-mono text-slate-400">L</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block truncate">
              can be added
            </span>
          </div>

          {/* 3. Water Consumed Today */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800/60 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Used Today
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                {todayUsage.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400">L</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block truncate">
              Target: {dailyTarget}L
            </span>
          </div>

          {/* 4. Refills Detected Today */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800/60 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Refilled Today
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                {todayRefills > 0 ? `+${todayRefills.toFixed(1)}` : '0.0'}
              </span>
              <span className="text-xs font-mono text-slate-400">L</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block truncate">
              Added volume
            </span>
          </div>
        </div>

        {/* Daily Target Progress Bar */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-cyan-500" />
              <span>Daily Conservation Budget:</span>
            </span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
              {todayUsage.toFixed(1)}L of {dailyTarget}L ({targetUsedPercent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                todayUsage > dailyTarget
                  ? 'bg-rose-500'
                  : targetUsedPercent > 80
                  ? 'bg-amber-500'
                  : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, targetUsedPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. HARDWARE STATUS & SAFETY SNAPSHOT */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Sensor Distance */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Acoustic Distance</span>
            <Compass className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white tabular-nums">
              {hasData && typeof telemetry?.distance === 'number' ? telemetry.distance.toFixed(1) : '—'}
            </span>
            <span className="text-xs font-mono text-slate-400">cm</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            HC-SR04 ultrasonic echo
          </span>
        </div>

        {/* Safety Buzzer Alarm Status */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Safety Buzzer</span>
            {isBuzzerActive ? (
              <BellRing className="h-4 w-4 text-rose-500 animate-bounce" />
            ) : (
              <Bell className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {isContinuousBuzzer ? (
              <span className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center gap-1 font-mono">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                CUTOFF (≥98.9%)
              </span>
            ) : isBuzzerActive ? (
              <span className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center gap-1 font-mono">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                WARNING ACTIVE
              </span>
            ) : (
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400 font-mono">
                {hasData ? 'Silent / Safe' : 'Offline'}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            Full cutoff trigger: 98.9%
          </span>
        </div>

        {/* Hardware Link */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Connection Link</span>
            <Activity className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {isConnected ? (
              isStale ? (
                <span className="text-sm font-black text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> STALE
                </span>
              ) : (
                <span className="text-sm font-black text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                </span>
              )
            ) : (
              <span className="text-sm font-bold text-slate-400">Disconnected</span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
            {isConnected ? `${secondsSinceLastPacket?.toFixed(1) ?? '0.0'}s ago` : 'Connect device'}
          </span>
        </div>
      </div>

      {/* 3. HARDWARE INSIGHT NOTIFICATION */}
      <div
        className={`rounded-2xl p-3 sm:p-3.5 border backdrop-blur-xl flex items-start gap-2.5 transition-colors ${
          insight.type === 'critical' || insight.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
            : insight.type === 'warning'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
            : insight.type === 'normal'
            ? 'bg-white/80 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200'
            : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-900 dark:text-cyan-200'
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {insight.type === 'critical' || insight.type === 'error' ? (
            <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          ) : insight.type === 'warning' ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Info className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          )}
        </div>
        <div className="text-xs font-medium leading-snug">
          <span className="font-bold mr-1">System Status:</span>
          {insight.text}
        </div>
      </div>

    </div>
  );
};
