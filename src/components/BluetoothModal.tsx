import React, { useState, useEffect } from 'react';
import {
  Bluetooth,
  X,
  RefreshCw,
  Cable,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Radio,
  Sliders,
  Bell,
  Send,
} from 'lucide-react';
import {
  BluetoothSppTransport,
  PairedBluetoothDevice,
} from '../transports/BluetoothSppTransport';
import { ConnectionState } from '../types';
import { notificationService } from '../services/notificationService';

interface BluetoothModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionState: ConnectionState;
  onConnectMac: (macAddress?: string) => void;
  onDisconnect: () => void;
  onConnectUsb: () => void;
  onConnectTestBench: () => void;
  onSendPing: () => void;
}

export const BluetoothModal: React.FC<BluetoothModalProps> = ({
  isOpen,
  onClose,
  connectionState,
  onConnectMac,
  onDisconnect,
  onConnectUsb,
  onConnectTestBench,
  onSendPing,
}) => {
  const [pairedDevices, setPairedDevices] = useState<PairedBluetoothDevice[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [hasBtPermission, setHasBtPermission] = useState(true);
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  const isConnected =
    connectionState.status === 'connected' &&
    connectionState.transport === 'bluetooth_spp';
  const isConnecting =
    connectionState.status === 'connecting' &&
    connectionState.transport === 'bluetooth_spp';

  const refreshDevices = () => {
    setIsRefreshing(true);
    const bridge = BluetoothSppTransport.getBridge();
    const native = Boolean(bridge?.isNativeApp?.() || BluetoothSppTransport.isNativeBridgeAvailable());
    setIsNativeApp(native);

    if (bridge?.hasBluetoothPermission) {
      setHasBtPermission(bridge.hasBluetoothPermission());
    }

    const devices = BluetoothSppTransport.getPairedDevices();
    setPairedDevices(devices);
    setTimeout(() => setIsRefreshing(false), 400);
  };

  useEffect(() => {
    if (isOpen) {
      refreshDevices();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGrantPermission = () => {
    const bridge = BluetoothSppTransport.getBridge();
    if (bridge?.requestBluetoothPermissions) {
      bridge.requestBluetoothPermissions();
      setTimeout(refreshDevices, 1500);
    }
  };

  const handleTestNotification = async () => {
    await notificationService.requestPermission();
    notificationService.sendTestNotification();
    setTestNotificationSent(true);
    setTimeout(() => setTestNotificationSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-6 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Bluetooth className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-tight">
                Bluetooth Connection Manager
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Arduino HC-05 Bluetooth Classic Serial Port (SPP)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Runtime Environment Status Badge */}
        <div
          className={`flex items-center gap-2.5 p-3 rounded-2xl border text-xs ${
            isNativeApp
              ? 'border-emerald-500/30 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-blue-500/30 bg-blue-50/70 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
          }`}
        >
          {isNativeApp ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <Smartphone className="h-4 w-4 text-blue-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold">
              {isNativeApp
                ? 'Native Android Container Active'
                : 'Web Browser Environment'}
            </div>
            <p className="text-[11px] opacity-85 leading-snug">
              {isNativeApp
                ? 'Direct RFCOMM hardware socket bridge is operational for paired HC-05 modules.'
                : 'Web browsers do not support RFCOMM sockets directly. In browser, use USB OTG or the native HydroSense APK.'}
            </p>
          </div>
        </div>

        {/* Missing Bluetooth Permission Banner (if native app) */}
        {isNativeApp && !hasBtPermission && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Bluetooth permission is needed to scan & connect.</span>
            </div>
            <button
              onClick={handleGrantPermission}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg text-xs shrink-0 transition-colors"
            >
              Grant
            </button>
          </div>
        )}

        {/* Active Connected State Banner */}
        {isConnected && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-sm text-emerald-800 dark:text-emerald-200">
                  Connected: {connectionState.deviceName || 'HC-05 Module'}
                </span>
              </div>
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-lg">
                9600 BAUD
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Packets RX</div>
                <div className="font-bold text-slate-900 dark:text-white font-mono">
                  {connectionState.packetsReceived}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Bytes RX</div>
                <div className="font-bold text-slate-900 dark:text-white font-mono">
                  {connectionState.bytesReceived}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={onSendPing}
                className="flex-1 py-2 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send STATUS Ping</span>
              </button>
              <button
                onClick={onDisconnect}
                className="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Paired Bluetooth Devices Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span className="uppercase tracking-wider text-[11px] text-slate-500">
              Paired HC-05 Devices ({pairedDevices.length})
            </span>
            <button
              onClick={refreshDevices}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh List</span>
            </button>
          </div>

          {pairedDevices.length > 0 ? (
            <div className="space-y-2">
              {pairedDevices.map((device) => {
                const isThisConnecting = isConnecting;
                return (
                  <div
                    key={device.address}
                    className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                        <Radio className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                        <span className="truncate">{device.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                        {device.address}
                      </div>
                    </div>

                    <button
                      onClick={() => onConnectMac(device.address)}
                      disabled={isConnecting}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs shrink-0 transition-all shadow-sm disabled:opacity-50"
                    >
                      {isThisConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <p>
                No paired Bluetooth devices detected yet.
              </p>
              <p className="text-[11px]">
                To connect to HC-05:
                <br />
                1. Open your phone&apos;s <strong>Settings &gt; Bluetooth</strong>
                <br />
                2. Pair with <strong>HC-05</strong> (Default PIN: <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">1234</code> or <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">0000</code>)
                <br />
                3. Return here and tap <strong>Refresh List</strong>.
              </p>
              <button
                onClick={() => onConnectMac()}
                disabled={isConnecting}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors"
              >
                <Radio className="h-3.5 w-3.5 text-cyan-500" />
                <span>Auto-Connect Default HC-05</span>
              </button>
            </div>
          )}
        </div>

        {/* Alternative Hardware Connections */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
            Other Hardware Link Modes
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                onConnectUsb();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors"
            >
              <Cable className="h-4 w-4 text-cyan-500 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                  USB Serial (OTG)
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Cable direct to Arduino Uno
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                onClose();
                onConnectTestBench();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-left transition-colors"
            >
              <Cpu className="h-4 w-4 text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                  Virtual Test Bench
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Simulate live water levels
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Notification Feature Test Card */}
        <div className="p-3.5 rounded-2xl bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-slate-900 dark:text-white">
                Tank Notifications
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Target reached, low water, and overflow cutoff alerts
              </div>
            </div>
          </div>

          <button
            onClick={handleTestNotification}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold rounded-xl text-xs shrink-0 transition-all shadow-sm"
          >
            {testNotificationSent ? 'Sent!' : 'Test Alert'}
          </button>
        </div>

      </div>
    </div>
  );
};
