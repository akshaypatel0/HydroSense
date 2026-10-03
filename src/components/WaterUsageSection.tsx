import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Filter,
  Info,
  Layers,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { usageTracker } from '../services/usageTracker';
import { TankConfig } from '../types';

interface WaterUsageSectionProps {
  tankConfig: TankConfig;
  lang: Language;
  onOpenSettings?: () => void;
  onUpdateConfig?: (newConfig: Partial<TankConfig>) => void;
}

export const WaterUsageSection: React.FC<WaterUsageSectionProps> = ({
  tankConfig,
  lang,
  onOpenSettings,
  onUpdateConfig,
}) => {
  const t = TRANSLATIONS[lang];

  // Refresh trigger when data updates
  const todayUsage = usageTracker.getTodayUsage();
  const yesterdayUsage = usageTracker.getYesterdayUsage();
  const last7Days = usageTracker.getLast7Days();
  const avgDaily = usageTracker.getAverageDaily();
  const dailyTarget = usageTracker.getDailyTarget();

  const now = new Date();
  const currentMonthTotal = usageTracker.getMonthTotal(now.getFullYear(), now.getMonth());
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthTotal = usageTracker.getMonthTotal(
    prevMonthDate.getFullYear(),
    prevMonthDate.getMonth()
  );

  // Custom range state
  const defaultFrom = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [isCustomExpanded, setIsCustomExpanded] = useState(false);

  const customRangeData = usageTracker.getCustomRange(fromDate, toDate);

  // Target progress calculation
  const targetPercent = Math.min(100, Math.round((todayUsage / Math.max(1, dailyTarget)) * 100));
  const isTargetExceeded = todayUsage > dailyTarget;

  // Comparison with yesterday
  const diffLiters = Math.round((todayUsage - yesterdayUsage) * 10) / 10;
  const isUsingLess = diffLiters < 0;

  // Find max value in last 7 days for SVG chart scaling
  const maxBarValue = Math.max(...last7Days.map((d) => d.consumedLiters), dailyTarget, 20);

  return (
    <div className="space-y-5 animate-fade-in text-slate-900 dark:text-slate-100">
      
      {/* Top Banner: Estimated Usage & Disclaimer */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 p-5 shadow-xl shadow-slate-900/5 backdrop-blur-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20 text-white shrink-0">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t.usageTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.usageSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border border-cyan-500/20">
              {t.capacityLabel}: <strong className="font-mono">{tankConfig.tankCapacityLiters} {t.litersUnit}</strong>
            </span>
            {onUpdateConfig && (
              <div className="flex items-center gap-1">
                {[500, 1000, 2000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => onUpdateConfig({ tankCapacityLiters: preset })}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold transition-all active:scale-95 ${
                      tankConfig.tankCapacityLiters === preset
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {preset}L
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Informative Disclaimer */}
        <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/20 p-3.5 flex items-start gap-2.5 text-xs text-cyan-900 dark:text-cyan-200">
          <Info className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400 mt-0.5" />
          <p className="leading-relaxed">
            {t.usageDisclaimer}
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Card 1: Today's Estimated Usage */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t.todayUsage}</span>
            <Droplets className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
              {todayUsage.toFixed(1)}
            </span>
            <span className="text-xs font-semibold text-slate-400 font-mono">{t.litersUnit}</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold">
            {isUsingLess ? (
              <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                <ArrowDownRight className="h-3.5 w-3.5" />
                {Math.abs(diffLiters).toFixed(1)} {t.litersUnit} vs {t.yesterdayUsage.slice(0, 4)}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                <ArrowUpRight className="h-3.5 w-3.5" />
                +{diffLiters.toFixed(1)} {t.litersUnit} vs {t.yesterdayUsage.slice(0, 4)}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Yesterday's Usage */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t.yesterdayUsage}</span>
            <Calendar className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
              {yesterdayUsage.toFixed(1)}
            </span>
            <span className="text-xs font-semibold text-slate-400 font-mono">{t.litersUnit}</span>
          </div>
          <div className="mt-2 text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {t.avgDailyUsage}: <strong className="font-mono text-slate-900 dark:text-white">{avgDaily.toFixed(1)} {t.litersUnit}</strong>
          </div>
        </div>

        {/* Card 3: Daily Target Progress */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t.dailyGoal}</span>
            <Target className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
              {targetPercent}%
            </span>
            <span className="text-xs font-semibold text-slate-400 font-mono">
              / {dailyTarget} {t.litersUnit}
            </span>
          </div>
          {/* Visual Goal Bar */}
          <div className="mt-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isTargetExceeded ? 'bg-rose-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, targetPercent)}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-right font-semibold">
            {isTargetExceeded ? (
              <span className="text-rose-600 dark:text-rose-400">{t.targetExceeded}</span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">{t.targetMet}</span>
            )}
          </div>
        </div>

        {/* Card 4: Month to Date Total */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t.thisMonth}</span>
            <CalendarDays className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
              {currentMonthTotal.toFixed(1)}
            </span>
            <span className="text-xs font-semibold text-slate-400 font-mono">{t.litersUnit}</span>
          </div>
          <div className="mt-2 text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {t.prevMonth}: <strong className="font-mono text-slate-900 dark:text-white">{prevMonthTotal.toFixed(1)} {t.litersUnit}</strong>
          </div>
        </div>

      </div>

      {/* Last 7 Days Interactive Bar Chart */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl">
        <div className="flex items-center justify-between mb-4 border-b border-slate-200/60 dark:border-slate-800/60 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t.last7Days} — {t.usageTitle}
            </h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {t.dailyTargetLabel}: {dailyTarget} {t.litersUnit}
          </span>
        </div>

        {/* SVG Bar Chart */}
        <div className="h-44 sm:h-56 w-full flex items-end justify-between gap-1.5 sm:gap-4 pt-6 pb-2 px-1 sm:px-2">
          {last7Days.map((d, idx) => {
            const barHeightPercent = Math.max(8, Math.round((d.consumedLiters / maxBarValue) * 100));
            const isToday = idx === last7Days.length - 1;
            const overTarget = d.consumedLiters > dailyTarget;

            return (
              <div key={d.dateKey} className="flex-1 min-w-[28px] flex flex-col items-center h-full justify-end group">
                {/* Liters Value Label on Hover / Active */}
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {d.consumedLiters.toFixed(0)}L
                </span>

                {/* Vertical Bar */}
                <div className="w-full max-w-[38px] sm:max-w-[42px] bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-hidden flex flex-col justify-end p-0.5">
                  <div
                    className={`w-full rounded-lg transition-all duration-500 ${
                      overTarget
                        ? 'bg-gradient-to-t from-rose-500 to-rose-400'
                        : isToday
                        ? 'bg-gradient-to-t from-cyan-600 to-cyan-400'
                        : 'bg-gradient-to-t from-blue-600 to-cyan-500'
                    }`}
                    style={{ height: `${barHeightPercent}%` }}
                  />
                </div>

                {/* Day Name Label */}
                <span
                  className={`text-[10px] sm:text-[11px] font-semibold mt-1.5 ${
                    isToday
                      ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {d.dayName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Range Analysis & Breakdown */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 p-4 sm:p-5 shadow-xl shadow-slate-900/5 backdrop-blur-2xl">
        <button
          onClick={() => setIsCustomExpanded(!isCustomExpanded)}
          className="w-full flex items-center justify-between text-left active:opacity-75 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t.customRange}
            </h3>
          </div>
          <ChevronRight
            className={`h-4 w-4 text-slate-400 transition-transform ${
              isCustomExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        {isCustomExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4 animate-fade-in">
            {/* Date Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                  {t.from}
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 font-mono text-sm sm:text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                  {t.to}
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 font-mono text-sm sm:text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Range Aggregate Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 text-center">
              <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-500/20">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.totalConsumed}
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
                  {customRangeData.totalConsumed.toFixed(1)} {t.litersUnit}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.netVolumeAdded}
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {customRangeData.totalRefilled.toFixed(1)} {t.litersUnit}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                  {t.refillsDetected}
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {customRangeData.records.filter((r) => r.refillsLiters > 0).length}
                </span>
              </div>
            </div>

            {/* Range Daily Table */}
            <div className="max-h-48 overflow-y-auto overflow-x-auto touch-scroll rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
              <table className="w-full text-left font-mono">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-right">Consumed</th>
                    <th className="py-2 px-3 text-right">Refilled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {customRangeData.records.length > 0 ? (
                    customRangeData.records.map((r) => (
                      <tr key={r.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{r.date}</td>
                        <td className="py-2 px-3 text-right font-bold text-cyan-600 dark:text-cyan-400">
                          {r.consumedLiters.toFixed(1)} {t.litersUnit}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          {r.refillsLiters.toFixed(1)} {t.litersUnit}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-slate-400 font-sans">
                        {t.noUsageData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
