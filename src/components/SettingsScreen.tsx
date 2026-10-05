import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Bell,
  Bluetooth,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Droplets,
  HardDrive,
  Info,
  Languages,
  Moon,
  Power,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import {
  BluetoothSppTransport,
  PairedBluetoothDevice,
} from '../transports/BluetoothSppTransport';
import { ConnectionState, OutgoingCommand, TankConfig, TelemetryData } from '../types';
import { notificationService } from '../services/notificationService';

interface SettingsScreenProps {
  telemetry: TelemetryData | null;
  connectionState: ConnectionState;
  tankConfig: TankConfig;
  onUpdateConfig: (newConfig: Partial<TankConfig>) => void;
  onSendCommand: (command: OutgoingCommand | string) => Promise<boolean>;
  onConnectBluetooth: (macAddress?: string) => void;
  onDisconnect: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  lang: Language;
  onToggleLanguage: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  telemetry,
  connectionState,
  tankConfig,
  onUpdateConfig,
  onSendCommand,
  onConnectBluetooth,
  onDisconnect,
  isDarkMode,
  setIsDarkMode,
  lang,
  onToggleLanguage,
}) => {
  const t = TRANSLATIONS[lang];
  const isConnected = connectionState.status === 'connected';

  // Capacity input state
  const [capacityInput, setCapacityInput] = useState<string>(
    tankConfig.tankCapacityLiters.toString()
  );

  // Calibration action states & Arduino responses
  const [isCalibratingEmpty, setIsCalibratingEmpty] = useState(false);
  const [isCalibratingFull, setIsCalibratingFull] = useState(false);
  const [calibrationFeedback, setCalibrationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Paired devices scanner state
  const [pairedDevices, setPairedDevices] = useState<PairedBluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  // Load paired Bluetooth devices
  const refreshDevices = () => {
    setIsScanning(true);
    const devs = BluetoothSppTransport.getPairedDevices();
    setPairedDevices(devs);
    setTimeout(() => setIsScanning(false), 400);
  };

  useEffect(() => {
    refreshDevices();
  }, []);

  // Preset capacity setter
  const handleSetPresetCapacity = (liters: number) => {
    setCapacityInput(liters.toString());
    onUpdateConfig({ tankCapacityLiters: liters });
  };

  const handleCustomCapacitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(capacityInput, 10);
    if (!isNaN(val) && val >= 50 && val <= 50000) {
      onUpdateConfig({ tankCapacityLiters: val });
    }
  };

  // Calibration triggers (Requirement 14)
  const handleCalibrateEmpty = async () => {
    if (!isConnected || isCalibratingEmpty) return;
    setIsCalibratingEmpty(true);
    setCalibrationFeedback(null);

    const success = await onSendCommand('CAL_EMPTY');
    setTimeout(() => {
      setIsCalibratingEmpty(false);
      if (success) {
        setCalibrationFeedback({
          type: 'success',
          message: 'Empty tank calibration saved to Arduino EEPROM (ACK:CAL_EMPTY:OK).',
        });
      } else {
        setCalibrationFeedback({
          type: 'error',
          message: 'Calibration failed. Check sensor position and water level.',
        });
      }
    }, 600);
  };

  const handleCalibrateFull = async () => {
    if (!isConnected || isCalibratingFull) return;
    setIsCalibratingFull(true);
    setCalibrationFeedback(null);

    const success = await onSendCommand('CAL_FULL');
    setTimeout(() => {
      setIsCalibratingFull(false);
      if (success) {
        setCalibrationFeedback({
          type: 'success',
          message: 'Full tank calibration saved to Arduino EEPROM (ACK:CAL_FULL:OK).',
        });
      } else {
        setCalibrationFeedback({
          type: 'error',
          message: 'Calibration failed. Check sensor position and water level.',
        });
      }
    }, 600);
  };

  const handleSendStatusPing = () => {
    onSendCommand('STATUS');
  };

  const handleTestNotification = async () => {
    await notificationService.requestPermission();
    notificationService.sendTestNotification();
    setTestNotificationSent(true);
    setTimeout(() => setTestNotificationSent(false), 3000);
  };

  // Active calibration distances reported by Arduino
  const calEmpty = telemetry?.calEmpty ?? 13.02;
  const calFull = telemetry?.calFull ?? 2.42;

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 sm:space-y-5 animate-fade-in pb-10">

      {/* Screen Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          System Settings & Setup
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Bluetooth, tank capacity, EEPROM calibration, and technical diagnostics
        </p>
      </div>

      {/* 1. BLUETOOTH CONNECTION (Requirement 2 & 22) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Bluetooth className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                HC-05 Bluetooth Classic SPP
              </h2>
              <p className="text-[11px] text-slate-400">9600 baud serial connection</p>
            </div>
          </div>

          {/* Status Display: 🟢 Bluetooth Connected / 🔴 Bluetooth Disconnected */}
          <div>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>🟢 {t.btConnected}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-500/30">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                <span>🔴 {t.btDisconnected}</span>
              </span>
            )}
          </div>
        </div>

        {/* Connected Device Info or Action Buttons */}
        {isConnected ? (
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-between text-xs">
            <div>
              <div className="font-extrabold text-emerald-900 dark:text-emerald-200">
                {connectionState.deviceName || 'HC-05 Module'}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">
                9600 baud • {connectionState.packetsReceived} packets RX
              </div>
            </div>
            <button
              onClick={onDisconnect}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>PAIRED BLUETOOTH DEVICES ({pairedDevices.length})</span>
              <button
                onClick={refreshDevices}
                disabled={isScanning}
                className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>

            {pairedDevices.length > 0 ? (
              <div className="space-y-2">
                {pairedDevices.map((dev) => (
                  <div
                    key={dev.address}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Radio className="h-3.5 w-3.5 text-cyan-500" />
                        <span>{dev.name}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {dev.address}
                      </div>
                    </div>
                    <button
                      onClick={() => onConnectBluetooth(dev.address)}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400 space-y-1">
                <div>No paired HC-05 devices detected.</div>
                <div className="text-[11px]">
                  Pair <strong>HC-05</strong> in Android Settings &gt; Bluetooth (PIN: 1234), then tap Refresh List.
                </div>
              </div>
            )}

            <button
              onClick={() => onConnectBluetooth()}
              className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold text-xs transition-colors flex items-center justify-center gap-2"
            >
              <Radio className="h-4 w-4 text-cyan-600" />
              <span>Auto-Connect Default HC-05</span>
            </button>
          </div>
        )}

      </div>

      {/* 2. TANK CAPACITY SETTINGS (Requirement 12) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Tank Capacity
              </h2>
              <p className="text-[11px] text-slate-400">Used for Litres = Level × Capacity / 100</p>
            </div>
          </div>
          <span className="text-base font-black text-cyan-600 dark:text-cyan-400">
            {tankConfig.tankCapacityLiters} L
          </span>
        </div>

        {/* Preset Capacity Selector Buttons: 500L, 750L, 1000L, 1500L, 2000L */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Quick Select Preset
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[500, 750, 1000, 1500, 2000].map((liters) => (
              <button
                key={liters}
                type="button"
                onClick={() => handleSetPresetCapacity(liters)}
                className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all ${
                  tankConfig.tankCapacityLiters === liters
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {liters} L
              </button>
            ))}
          </div>
        </div>

        {/* Custom Capacity Form */}
        <form onSubmit={handleCustomCapacitySubmit} className="space-y-2 pt-1">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Or Enter Custom Capacity (Litres)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={50}
              max={50000}
              step={10}
              value={capacityInput}
              onChange={(e) => setCapacityInput(e.target.value)}
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              placeholder="e.g. 1000"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-sm hover:opacity-90 transition-opacity"
            >
              Apply
            </button>
          </div>
        </form>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          The percentage comes directly from the Arduino. The app converts this into litres: <code>Litres = Level × Tank Capacity / 100</code>.
        </p>

      </div>

      {/* 3. CALIBRATION (Requirement 14: SETTINGS → CALIBRATION) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                SETTINGS → CALIBRATION
              </h2>
              <p className="text-[11px] text-slate-400">Arduino EEPROM Acoustic Benchmark</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
            EEPROM
          </span>
        </div>

        {/* Display Current Calibration (Requirement 14) */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              EMPTY:
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
              {calEmpty.toFixed(2)} cm
            </div>
            <span className="text-[10px] text-slate-400 font-medium">0% Reference Level</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              FULL:
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
              {calFull.toFixed(2)} cm
            </div>
            <span className="text-[10px] text-slate-400 font-medium">100% Reference Level</span>
          </div>
        </div>

        {/* Calibration Feedback Message */}
        {calibrationFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold animate-fade-in ${
              calibrationFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-500/30 text-rose-900 dark:text-rose-200'
            }`}
          >
            {calibrationFeedback.message}
          </div>
        )}

        {/* Calibration Action Buttons (CAL_EMPTY & CAL_FULL) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            onClick={handleCalibrateEmpty}
            disabled={!isConnected || isCalibratingEmpty}
            className="py-3 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-extrabold text-xs shadow-md disabled:opacity-50 transition-all flex flex-col items-center justify-center gap-0.5"
          >
            <span>{isCalibratingEmpty ? 'Calibrating...' : 'SET CURRENT LEVEL AS EMPTY'}</span>
            <span className="text-[10px] opacity-75 font-mono">(CAL_EMPTY)</span>
          </button>

          <button
            onClick={handleCalibrateFull}
            disabled={!isConnected || isCalibratingFull}
            className="py-3 px-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs shadow-md disabled:opacity-50 transition-all flex flex-col items-center justify-center gap-0.5"
          >
            <span>{isCalibratingFull ? 'Calibrating...' : 'SET CURRENT LEVEL AS FULL'}</span>
            <span className="text-[10px] opacity-75 font-mono">(CAL_FULL)</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center">
          Transmits <code>CAL_EMPTY\n</code> or <code>CAL_FULL\n</code> to Arduino. Real values are permanently stored in Arduino non-volatile EEPROM.
        </p>

      </div>

      {/* 4. DIAGNOSTICS (Requirement 20: SETTINGS → DIAGNOSTICS) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                SETTINGS → DIAGNOSTICS
              </h2>
              <p className="text-[11px] text-slate-400">Raw hardware telemetry for troubleshooting</p>
            </div>
          </div>
          <button
            onClick={handleSendStatusPing}
            disabled={!isConnected}
            className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
          >
            STATUS Ping
          </button>
        </div>

        {/* Raw Telemetry Grid (Requirement 20) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-medium">
          
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Bluetooth</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* This is the only place where raw sensor distance should be prominently displayed (Requirement 20) */}
          <div className="p-3 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-500/30">
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase block">Distance</span>
            <span className="text-base font-black text-cyan-700 dark:text-cyan-300 font-mono">
              {telemetry?.distance !== undefined ? `${telemetry.distance.toFixed(2)} cm` : '—'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Water Level</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {telemetry?.water !== null ? `${telemetry?.water?.toFixed(1)}%` : 'ERROR'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Motor</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {telemetry?.motor ?? 'OFF'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Mode</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {telemetry?.mode ?? 'AUTO'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Baud Rate</span>
            <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
              9600 BAUD
            </span>
          </div>

        </div>

        {/* Last received packet string & timestamp (Requirement 20) */}
        <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 space-y-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-sans">
            <span>Last Received Packet</span>
            <span>{connectionState.lastPacketTime ? new Date(connectionState.lastPacketTime).toLocaleTimeString() : 'No packets'}</span>
          </div>
          <div className="text-cyan-400 font-bold break-all">
            {connectionState.lastRawText || telemetry?.rawLine || 'None'}
          </div>
        </div>

      </div>

      {/* 5. APP PREFERENCES & THEME */}
      <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
          Preferences & Alerts
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {/* Theme switcher */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-xs text-slate-900 dark:text-white">Appearance</div>
              <div className="text-[10px] text-slate-400">{isDarkMode ? 'Dark Mode' : 'Light Mode (Default)'}</div>
            </div>
            {isDarkMode ? <Moon className="h-4 w-4 text-amber-400" /> : <Sun className="h-4 w-4 text-amber-600" />}
          </button>

          {/* Test notification */}
          <button
            onClick={handleTestNotification}
            className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-xs text-slate-900 dark:text-white">Push Alert</div>
              <div className="text-[10px] text-slate-400">{testNotificationSent ? 'Sent!' : 'Test Notification'}</div>
            </div>
            <Bell className="h-4 w-4 text-cyan-600" />
          </button>
        </div>

      </div>

    </div>
  );
};
