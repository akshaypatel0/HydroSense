import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  Clock,
  Droplets,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { LevelSample, usageTracker } from '../services/usageTracker';
import { TankConfig, TelemetryData } from '../types';

interface UsageScreenProps {
  telemetry: TelemetryData | null;
  isConnected: boolean;
  tankConfig: TankConfig;
  lang: Language;
}

export const UsageScreen: React.FC<UsageScreenProps> = ({
  telemetry,
  isConnected,
  tankConfig,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const [filter, setFilter] = useState<'today' | '7days' | '30days'>('today');

  const capacity = tankConfig.tankCapacityLiters || 1000;
  const currentLevel = telemetry?.water !== null && !telemetry?.isSensorUnavailable
    ? telemetry?.water ?? null
    : null;
  const currentLitres = currentLevel !== null
    ? Math.round((currentLevel / 100) * capacity)
    : null;

  // Retrieve genuine recorded samples for selected filter
  const samples = usageTracker.getSamples(filter);
  const estimatedConsumed = usageTracker.getConsumedForFilter(filter);
  const todayRefills = usageTracker.getTodayRefills();

  // Graph rendering calculation
  const hasEnoughData = samples.length >= 2;

  // SVG dimensions for clean historical water-level chart
  const width = 500;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 35 };

  let pathD = '';
  let areaD = '';

  if (hasEnoughData) {
    const minTime = samples[0].timestamp;
    const maxTime = samples[samples.length - 1].timestamp;
    const timeSpan = Math.max(1, maxTime - minTime);

    const points = samples.map((s) => {
      const x =
        padding.left +
        ((s.timestamp - minTime) / timeSpan) * (width - padding.left - padding.right);
      const y =
        padding.top +
        (1 - s.level / 100) * (height - padding.top - padding.bottom);
      return { x, y, level: s.level, time: s.timestamp };
    });

    pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
    areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 sm:space-y-5 animate-fade-in pb-6">

      {/* Screen Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Water Usage & History
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Recorded directly from actual Arduino water level samples
        </p>
      </div>

      {/* PRIMARY SUMMARY CARDS (Requirement 13) */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        
        {/* Card 1: Current Water */}
        <div className="p-4 rounded-3xl border border-slate-200/90 bg-white/90 dark:border-slate-800/90 dark:bg-slate-900/90 shadow-md backdrop-blur-xl text-center">
          <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
            Current Water
          </span>
          <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">
            {currentLitres !== null ? `${currentLitres.toLocaleString()} L` : '— L'}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">In Reservoir</span>
        </div>

        {/* Card 2: Tank Capacity */}
        <div className="p-4 rounded-3xl border border-slate-200/90 bg-white/90 dark:border-slate-800/90 dark:bg-slate-900/90 shadow-md backdrop-blur-xl text-center">
          <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
            Tank Capacity
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
            {capacity.toLocaleString()} L
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Total Volume</span>
        </div>

        {/* Card 3: Water Level */}
        <div className="p-4 rounded-3xl border border-slate-200/90 bg-white/90 dark:border-slate-800/90 dark:bg-slate-900/90 shadow-md backdrop-blur-xl text-center">
          <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
            Water Level
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {currentLevel !== null ? `${Math.round(currentLevel)}%` : '—%'}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">From Arduino</span>
        </div>

      </div>

      {/* HISTORICAL GRAPH CARD (Requirement 13) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        {/* Card Header & Time Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Water-Level History
              </h2>
              <p className="text-[11px] text-slate-400">
                Timestamped telemetry curve
              </p>
            </div>
          </div>

          {/* Time Filter Buttons: Today | 7 Days | 30 Days */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold self-start sm:self-auto">
            <button
              onClick={() => setFilter('today')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === 'today'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setFilter('7days')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === '7days'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setFilter('30days')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                filter === '30days'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              30 Days
            </button>
          </div>
        </div>

        {/* Graph Display Area */}
        {hasEnoughData ? (
          <div className="space-y-2">
            <div className="relative w-full aspect-[2.4/1] select-none">
              <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`}>
                <defs>
                  <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal reference grid lines */}
                {[0, 25, 50, 75, 100].map((pct) => {
                  const y = padding.top + (1 - pct / 100) * (height - padding.top - padding.bottom);
                  return (
                    <g key={pct}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={width - padding.right}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                        strokeDasharray={pct === 0 || pct === 100 ? '' : '3 3'}
                        strokeWidth="1"
                      />
                      <text
                        x={padding.left - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[9px] font-mono fill-slate-400"
                      >
                        {pct}%
                      </text>
                    </g>
                  );
                })}

                {/* Filled Area Under Curve */}
                <path d={areaD} fill="url(#usageGradient)" />

                {/* Smooth Level Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Latest Data Point Dot */}
                {samples.length > 0 && (
                  <circle
                    cx={
                      padding.left +
                      ((samples[samples.length - 1].timestamp - samples[0].timestamp) /
                        Math.max(1, samples[samples.length - 1].timestamp - samples[0].timestamp)) *
                        (width - padding.left - padding.right)
                    }
                    cy={
                      padding.top +
                      (1 - samples[samples.length - 1].level / 100) *
                        (height - padding.top - padding.bottom)
                    }
                    r="4"
                    fill="#0284C7"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                )}
              </svg>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
              <span>{new Date(samples[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span>{samples.length} genuine readings</span>
              <span>{new Date(samples[samples.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ) : (
          /* Empty State Requirement: If there is not enough data, show "Not enough historical data yet." */
          <div className="py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
            <Info className="h-6 w-6 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Not enough historical data yet.
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              History is recorded strictly from genuine Arduino level updates. As the Arduino streams data over time, your water-level trend will appear here.
            </p>
          </div>
        )}

      </div>

      {/* CONSUMPTION & REFILL ESTIMATES CARD */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
          Estimated Usage Summary ({filter === 'today' ? 'Today' : filter === '7days' ? 'Last 7 Days' : 'Last 30 Days'})
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <TrendingDown className="h-4 w-4 text-amber-500" />
              <span>Water Drawn / Used</span>
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {estimatedConsumed > 0 ? `${estimatedConsumed} L` : '0 L'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Derived from recorded level decreases
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-500/20">
            <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 text-xs font-semibold">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              <span>Water Refilled</span>
            </div>
            <div className="text-xl font-black text-cyan-800 dark:text-cyan-200 mt-1">
              {todayRefills > 0 ? `${todayRefills} L` : '0 L'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Pump refills detected
            </p>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed text-center pt-1">
          Consumption data is never fabricated. Calculated strictly from verified volume changes while connected to Arduino.
        </p>
      </div>

    </div>
  );
};
