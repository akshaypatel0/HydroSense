import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronRight,
  Code,
  CornerDownLeft,
  Play,
  RotateCcw,
  Send,
  Sliders,
  Terminal,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { ProtocolTestResult, runProtocolSelfTests } from '../protocol/protocolParser';
import { ConnectionState, OutgoingCommand } from '../types';

interface SerialLine {
  id: string;
  timestamp: number;
  direction: 'RX' | 'TX';
  text: string;
}

interface ProtocolTestBenchProps {
  serialLines: SerialLine[];
  connectionState: ConnectionState;
  onSendCommand: (cmd: OutgoingCommand) => Promise<boolean>;
  onClearSerial: () => void;
  onInjectFault?: (fault: 'SENSOR_TIMEOUT' | 'OUT_OF_BOUNDS' | 'OVERFLOW' | 'CLEAR') => void;
  onSetSimulatedWater?: (level: number) => void;
}

export const ProtocolTestBench: React.FC<ProtocolTestBenchProps> = ({
  serialLines,
  connectionState,
  onSendCommand,
  onClearSerial,
  onInjectFault,
  onSetSimulatedWater,
}) => {
  const [manualCmd, setManualCmd] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [testResults, setTestResults] = useState<ProtocolTestResult[] | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log
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

  const handleRunSelfTests = () => {
    setTestRunning(true);
    setTimeout(() => {
      const results = runProtocolSelfTests();
      setTestResults(results);
      setTestRunning(false);
    }, 250);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Column 1: Live Serial Monitor (7 cols) */}
      <div className="lg:col-span-7 flex flex-col rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800/80 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-cyan-400 dark:bg-slate-800">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Serial Stream Monitor
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                9600 Baud · 8N1 · Line Delimited ('\n')
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded accent-cyan-600"
              />
              <span>Autoscroll</span>
            </label>

            <button
              onClick={onClearSerial}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Clear terminal buffer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Terminal Console Output */}
        <div className="flex-1 min-h-[360px] max-h-[460px] overflow-y-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-200 shadow-inner border border-slate-800">
          {serialLines.length > 0 ? (
            <div className="space-y-1">
              {serialLines.map((line) => {
                const time = new Date(line.timestamp).toLocaleTimeString();
                return (
                  <div key={line.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 select-none text-[11px] tabular-nums">
                      [{time}]
                    </span>
                    <span
                      className={`font-bold select-none text-[10px] px-1 rounded ${
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
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-12">
              <Terminal className="h-8 w-8 stroke-1 mb-2 opacity-40" />
              <span>Serial buffer is currently empty.</span>
              <span className="text-[11px] text-slate-600 mt-1">
                Connect via USB Serial or Test Bench to inspect raw packets.
              </span>
            </div>
          )}
        </div>

        {/* Manual Command Input Form */}
        <form onSubmit={handleSendManual} className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={manualCmd}
              onChange={(e) => setManualCmd(e.target.value)}
              placeholder="Enter command (e.g. STATUS, START, STOP, MODE:AUTO, TARGET:85)..."
              disabled={connectionState.status !== 'connected'}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-900 px-4 py-2.5 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={connectionState.status !== 'connected' || !manualCmd.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-cyan-500 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        </form>

        {/* Quick Command Shortcut Buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          <span className="text-slate-400 mr-1 text-xs font-sans">Quick:</span>
          {(['STATUS', 'START', 'STOP', 'MODE:AUTO', 'MODE:MANUAL', 'TARGET:80'] as OutgoingCommand[]).map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onSendCommand(cmd)}
              disabled={connectionState.status !== 'connected'}
              className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Column 2: Protocol Automated Self-Tester & Hardware Fault Injection (5 cols) */}
      <div className="lg:col-span-5 space-y-6">
        
        {/* Protocol Parser Test Suite */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bug className="h-4 w-4 text-cyan-500" />
                Protocol Unit Test Suite
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify partial packet reassembly & corrupted chunk handling
              </p>
            </div>

            <button
              onClick={handleRunSelfTests}
              disabled={testRunning}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:hover:bg-cyan-500 transition-colors"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{testRunning ? 'Testing...' : 'Run All Tests'}</span>
            </button>
          </div>

          {testResults ? (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <span>
                  Result: {testResults.filter((r) => r.passed).length} / {testResults.length} Passed
                </span>
                <span className="text-emerald-800 dark:text-emerald-400">
                  {testResults.every((r) => r.passed) ? 'ALL PASSING (100%)' : 'FAILS DETECTED'}
                </span>
              </div>

              {testResults.map((t, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl border p-3 text-xs ${
                    t.passed
                      ? 'border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {t.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                      )}
                      {t.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold uppercase ${
                        t.passed ? 'text-emerald-800 dark:text-emerald-400' : 'text-rose-500'
                      }`}
                    >
                      {t.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all">
                    Input: {t.inputDescription}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                    Output: {t.actual}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Code className="h-6 w-6 stroke-1 mx-auto mb-2 opacity-50" />
              <span>Click "Run All Tests" to test the parser against split chunks, malformed numbers, and packet joins.</span>
            </div>
          )}
        </div>

        {/* Fault Injection Panel (Active when Test Bench Transport is running) */}
        {connectionState.transport === 'test_bench' && onInjectFault && (
          <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Simulated Hardware Fault Injection
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Inject hardware sensor faults or overflow conditions to test firmware fail-safes
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onInjectFault('SENSOR_TIMEOUT')}
                className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-semibold transition-colors text-left"
              >
                Trigger Sensor Timeout
              </button>
              <button
                onClick={() => onInjectFault('OUT_OF_BOUNDS')}
                className="p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-900 dark:text-rose-200 font-semibold transition-colors text-left"
              >
                Trigger Out of Bounds
              </button>
              <button
                onClick={() => onInjectFault('OVERFLOW')}
                className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-900 dark:text-blue-200 font-semibold transition-colors text-left"
              >
                Simulate Cutoff (94%)
              </button>
              <button
                onClick={() => onInjectFault('CLEAR')}
                className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 font-semibold transition-colors text-left"
              >
                Clear All Faults
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
