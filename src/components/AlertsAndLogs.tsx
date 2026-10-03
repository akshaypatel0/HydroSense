import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  Info,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Volume2,
} from 'lucide-react';
import { EventLogItem, LogSeverity, TelemetryData } from '../types';

interface AlertsAndLogsProps {
  logs: EventLogItem[];
  telemetryHistory: Array<{ timestamp: number; water: number }>;
  currentTelemetry: TelemetryData | null;
  onClearLogs: () => void;
}

export const AlertsAndLogs: React.FC<AlertsAndLogsProps> = ({
  logs,
  telemetryHistory,
  currentTelemetry,
  onClearLogs,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<LogSeverity | 'all'>('all');

  const filteredLogs = useMemo(() => {
    if (filterSeverity === 'all') return logs;
    return logs.filter((log) => log.severity === filterSeverity);
  }, [logs, filterSeverity]);

  // Export logs to CSV
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
    link.download = `hydrosense_event_logs_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export logs to JSON
  const handleExportJSON = () => {
    if (logs.length === 0) return;
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hydrosense_event_logs_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // SVG Chart path calculation for telemetry history
  const chartPoints = useMemo(() => {
    if (telemetryHistory.length < 2) return null;
    const width = 600;
    const height = 140;
    const padding = 20;

    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;

    const minWater = 0;
    const maxWater = 100;

    const points = telemetryHistory.map((item, index) => {
      const x = padding + (index / (telemetryHistory.length - 1)) * effectiveWidth;
      const y = height - padding - (item.water / (maxWater - minWater)) * effectiveHeight;
      return { x, y, ...item };
    });

    const pathD = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, '');

    // Area under the curve
    const areaD = `${pathD} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`;

    return { pathD, areaD, points, width, height, padding };
  }, [telemetryHistory]);

  return (
    <div className="space-y-6">
      
      {/* Active System Warnings Banner (Real-time checks) */}
      {currentTelemetry && (
        <div className="space-y-2">
          {currentTelemetry.error !== 'NONE' && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div>
                <span className="font-bold block text-sm">Hardware Sensor Fault Detected</span>
                <span>The ultrasonic rangefinder reported: <code>{currentTelemetry.error}</code>. Water level readings may be invalid. Check HC-SR04 pin connections and sensor alignment.</span>
              </div>
            </div>
          )}

          {currentTelemetry.water !== null && currentTelemetry.water >= currentTelemetry.cutoff && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div>
                <span className="font-bold block text-sm">High-Level Safety Cutoff Active</span>
                <span>Water level ({currentTelemetry.water.toFixed(1)}%) reached the cutoff threshold ({currentTelemetry.cutoff}%). Safety buzzer alarm activated to prevent overflow.</span>
              </div>
            </div>
          )}

          {currentTelemetry.buzzer === 'ON' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-3">
              <Volume2 className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
              <div>
                <span className="font-bold">Hardware Alarm Buzzer Sounding:</span> Arduino Pin 8 buzzer is energized due to high water cutoff or sensor error condition.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Telemetry Trend Chart */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              Water Level History Trend
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live rolling record of sensor telemetry readings
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {telemetryHistory.length} data points
          </span>
        </div>

        {chartPoints ? (
          <div className="relative w-full overflow-hidden rounded-2xl bg-slate-950/20 p-2 border border-slate-200/40 dark:border-slate-800/60">
            <svg
              className="w-full h-36"
              viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1={chartPoints.padding}
                y1={chartPoints.height * 0.25}
                x2={chartPoints.width - chartPoints.padding}
                y2={chartPoints.height * 0.25}
                stroke="#64748b"
                strokeOpacity="0.2"
                strokeDasharray="4 4"
              />
              <line
                x1={chartPoints.padding}
                y1={chartPoints.height * 0.5}
                x2={chartPoints.width - chartPoints.padding}
                y2={chartPoints.height * 0.5}
                stroke="#64748b"
                strokeOpacity="0.2"
                strokeDasharray="4 4"
              />
              <line
                x1={chartPoints.padding}
                y1={chartPoints.height * 0.75}
                x2={chartPoints.width - chartPoints.padding}
                y2={chartPoints.height * 0.75}
                stroke="#64748b"
                strokeOpacity="0.2"
                strokeDasharray="4 4"
              />

              {/* Area */}
              <path d={chartPoints.areaD} fill="url(#areaGrad)" />

              {/* Line */}
              <path
                d={chartPoints.pathD}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* End Point Glow */}
              {chartPoints.points.length > 0 && (
                <circle
                  cx={chartPoints.points[chartPoints.points.length - 1].x}
                  cy={chartPoints.points[chartPoints.points.length - 1].y}
                  r="4"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
            </svg>

            <div className="flex justify-between px-3 text-[10px] font-mono text-slate-400 mt-1">
              <span>Oldest reading</span>
              <span>Latest telemetry</span>
            </div>
          </div>
        ) : (
          <div className="flex h-32 flex-col items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-400">
            <Clock className="h-6 w-6 stroke-1 mb-1" />
            <span>Collecting telemetry points... Connect hardware to populate history chart.</span>
          </div>
        )}
      </div>

      {/* Event Logs List */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="h-4 w-4 text-cyan-500" />
              Timestamped Event Log
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit trail of commands, threshold alerts, buzzer activations, and events
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 text-xs">
              {(['all', 'info', 'command', 'warning', 'critical'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(sev)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors uppercase text-[10px] ${
                    filterSeverity === sev
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            {/* Export Buttons */}
            <button
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>

            <button
              onClick={handleExportJSON}
              disabled={logs.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" />
              <span>JSON</span>
            </button>

            <button
              onClick={onClearLogs}
              disabled={logs.length === 0}
              className="flex items-center gap-1 rounded-xl p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="Clear event logs"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Log Table / List */}
        {filteredLogs.length > 0 ? (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 pr-1">
            {filteredLogs.map((log) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString();
              const dateStr = new Date(log.timestamp).toLocaleDateString();

              const getBadgeColor = () => {
                switch (log.severity) {
                  case 'critical':
                    return 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-500/20';
                  case 'warning':
                    return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-500/20';
                  case 'command':
                    return 'text-cyan-800 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-500/20';
                  case 'info':
                  default:
                    return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50';
                }
              };

              return (
                <div
                  key={log.id}
                  className="py-3 flex items-start justify-between gap-3 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md shrink-0 mt-0.5 ${getBadgeColor()}`}
                    >
                      {log.severity}
                    </span>

                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {log.message}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Source: {log.source}</span>
                        <span>·</span>
                        <span>{dateStr}</span>
                      </div>
                    </div>
                  </div>

                  <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                    {timeStr}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-400">
            <Info className="h-6 w-6 stroke-1 mx-auto mb-2 opacity-50" />
            <span>No log entries match the selected filter.</span>
          </div>
        )}
      </div>

    </div>
  );
};
