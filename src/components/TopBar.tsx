import React, { useState } from 'react';
import {
  Bluetooth,
  Cable,
  ChevronDown,
  Cpu,
  Home,
  Languages,
  Maximize2,
  Minimize2,
  Moon,
  Radio,
  Settings,
  Sliders,
  Sun,
  X,
  Droplets,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { ActiveNavTab, ConnectionState } from '../types';

interface TopBarProps {
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
  connectionState: ConnectionState;
  onConnectUsb: () => void;
  onConnectBluetooth: () => void;
  onConnectTestBench: () => void;
  onDisconnect: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  lang: Language;
  onToggleLanguage: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  connectionState,
  onConnectUsb,
  onConnectBluetooth,
  onConnectTestBench,
  onDisconnect,
  isDarkMode,
  setIsDarkMode,
  lang,
  onToggleLanguage,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const t = TRANSLATIONS[lang];

  const isConnected = connectionState.status === 'connected';
  const isConnecting = connectionState.status === 'connecting';

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-xl dark:border-slate-800/90 dark:bg-slate-950/95 transition-colors select-none"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="mx-auto flex h-15 sm:h-16 max-w-5xl items-center justify-between px-3 sm:px-6">
        
        {/* Brand Lockup with live Bluetooth status */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <img
            src="./pwa-icon.png"
            alt="HydroSense"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shadow-md shadow-cyan-500/20 object-contain shrink-0 bg-white"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 leading-none">
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white uppercase truncate">
                HYDROSENSE
              </span>
              <span className="hidden sm:inline-flex text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-1.5 py-0.5 rounded-md shrink-0">
                IoT 9600
              </span>
            </div>

            {/* Live Bluetooth Connection Indicator (🟢 Connected / 🔴 Disconnected) */}
            <div className="flex items-center gap-1.5 mt-1 leading-none">
              {isConnected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>{t.btConnected}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span>{t.btDisconnected}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Navigation Tabs (HOME | CONTROL | USAGE | SETTINGS) */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
          <button
            onClick={() => setActiveTab('home')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'home'
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span>{t.navHome}</span>
          </button>

          <button
            onClick={() => setActiveTab('control')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'control'
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>{t.navControl}</span>
          </button>

          <button
            onClick={() => setActiveTab('usage')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'usage'
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Droplets className="h-3.5 w-3.5" />
            <span>{t.navUsage}</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{t.navSettings}</span>
          </button>
        </nav>

        {/* Action Controls Group */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Gujarati / English Toggle */}
          <button
            onClick={onToggleLanguage}
            title={t.switchLang}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-50/70 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 active:scale-95 transition-all text-xs font-bold"
          >
            <Languages className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{lang === 'en' ? 'ગુજરાતી' : 'English'}</span>
            <span className="sm:hidden text-[11px]">{lang === 'en' ? 'ગુજ' : 'EN'}</span>
          </button>

          {/* Light / Dark Mode Toggle (Default is Light) */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border active:scale-95 transition-all shrink-0 ${
              isDarkMode
                ? 'border-slate-800 bg-slate-900/80 text-amber-400 hover:bg-slate-800'
                : 'border-amber-200/90 bg-amber-50 text-amber-800 hover:bg-amber-100 shadow-sm'
            }`}
          >
            {isDarkMode ? (
              <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-800" />
            )}
          </button>

          {/* Fullscreen Button */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? t.exitFullscreen : t.fullscreen}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-100 active:scale-95 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 transition-all shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-600 dark:text-cyan-400" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
            </button>
          )}

          {/* Bluetooth Connection Dropdown & Status */}
          <div className="relative">
            {isConnected ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/90 dark:bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <button
                  type="button"
                  onClick={onConnectBluetooth}
                  className="flex items-center gap-1.5 text-left hover:opacity-85 transition-opacity"
                  title="Open Bluetooth Connection Manager"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-mono text-[11px] truncate max-w-[70px] sm:max-w-[120px]">
                    {connectionState.transport === 'bluetooth_spp'
                      ? connectionState.deviceName || 'HC-05'
                      : connectionState.transport === 'usb_serial'
                      ? 'USB'
                      : 'TestBench'}
                  </span>
                </button>
                <button
                  onClick={onDisconnect}
                  title={t.disconnect}
                  className="ml-0.5 text-emerald-700 hover:text-rose-600 dark:text-emerald-400 dark:hover:text-rose-400 font-bold p-0.5 text-sm leading-none"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="flex items-center rounded-xl bg-cyan-600 hover:bg-cyan-500 shadow-sm transition-all overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={onConnectBluetooth}
                  disabled={isConnecting}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-white active:scale-95 transition-transform"
                  title="Connect HC-05 Bluetooth SPP"
                >
                  <Radio className={`h-3.5 w-3.5 shrink-0 ${isConnecting ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{isConnecting ? t.connecting : 'Connect HC-05'}</span>
                  <span className="sm:hidden text-[11px]">{isConnecting ? '...' : 'Connect'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConnectMenuOpen(!connectMenuOpen)}
                  disabled={isConnecting}
                  className="px-1.5 py-1.5 text-white/80 hover:text-white hover:bg-cyan-700/50 border-l border-cyan-500/50 transition-colors"
                  title="Hardware connection menu"
                >
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </div>
            )}

            {/* Mobile Backdrop */}
            {connectMenuOpen && !isConnected && (
              <div
                className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
                onClick={() => setConnectMenuOpen(false)}
              />
            )}

            {/* Connection Dropdown Menu */}
            {connectMenuOpen && !isConnected && (
              <div
                className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/95 z-50 animate-fade-in"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Hardware Connection</span>
                  <button
                    onClick={() => setConnectMenuOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    setConnectMenuOpen(false);
                    onConnectBluetooth();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white active:scale-[0.98] transition-all"
                >
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                    <Bluetooth className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">HC-05 Bluetooth SPP</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      Scan, select & connect at 9600 baud
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setConnectMenuOpen(false);
                    onConnectUsb();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white active:scale-[0.98] transition-all"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
                    <Cable className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">USB OTG Serial</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      Direct cable link (Web Serial 9600 baud)
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setConnectMenuOpen(false);
                    onConnectTestBench();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white active:scale-[0.98] transition-all"
                >
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">Virtual Arduino Test Bench</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      Simulate live tank filling & motor control
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
