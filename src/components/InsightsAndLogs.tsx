import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  History,
  Info,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { EventLogItem, LogSeverity, TelemetryData } from '../types';

interface InsightsAndLogsProps {
  logs: EventLogItem[];
  telemetryHistory: Array<{ timestamp: number; water: number }>;
  currentTelemetry: TelemetryData | null;
  onClearLogs: () => void;
  lang: Language;
}

export const InsightsAndLogs: React.FC<InsightsAndLogsProps> = ({
  logs,
  telemetryHistory,
  currentTelemetry,
  onClearLogs,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const [filterSeverity, setFilterSeverity] = useState<LogSeverity | 'all'>('all');

  const filteredLogs = useMemo(() => {
    if (filterSeverity === 'all') return logs;
    return logs.filter((log) => log.severity === filterSeverity);
  }, [logs, filterSeverity]);

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const header = 'Timestamp,ISO_Date,Severity,Source,Message\n';
    const rows = logs
      .map(
        (l) =>
          `${l.timestamp},"${new Date(l.timestamp).toISOString()}","${l.severity}","${l.source}","${l.message.replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hydrosense_logs_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (logs.length === 0) return;
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hydrosense_logs_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Live intelligent insights from actual Arduino telemetry (pure monitoring & alerts)
  const activeInsights = useMemo(() => {
    if (!currentTelemetry) return [];
    const list: Array<{ title: string; desc: string; type: 'info' | 'warning' | 'critical' | 'success' }> = [];

    if (currentTelemetry.error !== 'NONE') {
      list.push({
        title: 'Sensor Hardware Fault',
        desc: `Ultrasonic echo returned error: ${currentTelemetry.error}. Check transducer alignment.`,
        type: 'critical',
      });
    }

    if (currentTelemetry.isSensorUnavailable || currentTelemetry.water === null) {
      list.push({
        title: 'Sensor Unavailable (SENSOR:ABSENT)',
        desc: 'Ultrasonic sensor is absent or disconnected. Water reading suspended until valid hardware data arrives.',
        type: 'critical',
      });
    } else if (currentTelemetry.water >= currentTelemetry.cutoff) {
      list.push({
        title: 'High-Water Cutoff Active (Alarm)',
        desc: `Water reached the safety cutoff threshold (${currentTelemetry.cutoff}%). Buzzer alert is triggered.`,
        type: 'critical',
      });
    } else if (currentTelemetry.water >= currentTelemetry.target) {
      list.push({
        title: 'Target Water Level Reached',
        desc: `Reservoir has achieved the designated fill target of ${currentTelemetry.target}%.`,
        type: 'success',
      });
    } else if (currentTelemetry.water <= 25) {
      list.push({
        title: 'Water Level Is Low',
        desc: `Current reservoir level is ${currentTelemetry.water.toFixed(1)}%. Consider refilling soon.`,
        type: 'warning',
      });
    } else {
      list.push({
        title: 'Water Level Normal',
        desc: `Current water level is ${currentTelemetry.water.toFixed(1)}%. Sensor stream nominal.`,
        type: 'info',
      });
    }

    if (currentTelemetry.buzzer === 'ON') {
      list.push({
        title: 'Hardware Buzzer Sounding',
        desc: 'Microcontroller buzzer pin is active due to critical high water level.',
        type: 'critical',
      });
    }

    if (currentTelemetry.calStatus === 'OK') {
      list.push({
        title: 'EEPROM Calibration Active',
        desc: `Arduino EEPROM limits: Empty = ${currentTelemetry.calEmpty} cm, Full = ${currentTelemetry.calFull} cm.`,
        type: 'success',
      });
    }

    return list;
  }, [currentTelemetry]);

  // SVG Trend Chart
  const chartPoints = useMemo(() => {
    if (telemetryHistory.length < 2) return null;
    const width = 600;
    const height = 130;
    const padding = 16;

    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;

    const points = telemetryHistory.map((item, index) => {
      const x = padding + (index / (telemetryHistory.length - 1)) * effectiveWidth;
      const y = height - padding - (item.water / 100) * effectiveHeight;
      return { x, y, ...item };
    });

    const pathD = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, '');

    const areaD = `${pathD} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`;

    return { pathD, areaD, points, width, height, padding };
  }, [telemetryHistory]);

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      
      {/* Real-time System Insights Grid */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-cyan-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t.systemInsight}
          </h2>
        </div>

        {activeInsights.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeInsights.map((item, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border text-xs flex items-start gap-3 ${
                  item.type === 'critical'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                    : item.type === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                    : item.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                    : 'border-slate-200/70 bg-slate-50/70 dark:border-slate-800/70 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {item.type === 'critical' && <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                  {item.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                  {item.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                  {item.type === 'info' && <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                </div>
                <div>
                  <h4 className="font-bold">{item.title}</h4>
                  <p className="mt-0.5 opacity-90 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-400 text-center">
            {t.connectHelp}
          </div>
        )}
      </div>

      {/* Water Level History Trend */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-500" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              Water Level Real-Time Stream
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {telemetryHistory.length} readings
          </span>
        </div>

        {chartPoints ? (
          <div className="rounded-2xl bg-slate-950/20 p-2 border border-slate-200/40 dark:border-slate-800/60">
            <svg
              className="w-full h-32"
              viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="insightAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              <path d={chartPoints.areaD} fill="url(#insightAreaGrad)" />
              <path
                d={chartPoints.pathD}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex justify-between px-2 text-[9px] font-mono text-slate-400 mt-1">
              <span>Past telemetry</span>
              <span>Latest reading</span>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            Chart populates continuously when hardware is connected.
          </div>
        )}
      </div>

      {/* Timestamped Audit Event Log */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              System & Telemetry Event Log
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Buttons */}
            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-[11px] font-semibold">
              {(['all', 'info', 'warning', 'critical'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(sev)}
                  className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                    filterSeverity === sev
                      ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm font-bold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            {/* Export Buttons */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Download className="h-3 w-3" />
              <span>CSV</span>
            </button>

            <button
              onClick={onClearLogs}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 transition-colors"
              title="Clear event logs"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Log Entries */}
        <div className="max-h-64 overflow-y-auto touch-scroll space-y-2 pr-1 font-mono text-xs">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2.5 rounded-xl p-2.5 border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/40"
              >
                <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    log.severity === 'critical'
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : log.severity === 'warning'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      : log.severity === 'command'
                      ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {log.severity}
                </span>
                <span className="text-slate-700 dark:text-slate-300 flex-1 leading-relaxed">
                  {log.message}
                </span>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-slate-400 font-sans">
              No events found for this filter.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
