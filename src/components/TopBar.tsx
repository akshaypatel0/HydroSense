import React, { useState } from 'react';
import {
  Activity,
  Bluetooth,
  Cable,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Droplets,
  Languages,
  Maximize2,
  Minimize2,
  Moon,
  Radio,
  Sliders,
  Smartphone,
  Sun,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { ConnectionState } from '../types';

export type ActiveTab =
  | 'dashboard'
  | 'usage'
  | 'insights'
  | 'calibration'
  | 'hardware';

interface TopBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  connectionState: ConnectionState;
  onConnectUsb: () => void;
  onConnectBluetooth: () => void;
  onConnectTestBench: () => void;
  onDisconnect: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  onOpenSettings: () => void;
  webSerialSupported: boolean;
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
  onOpenSettings,
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
      className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/90 transition-colors select-none"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="mx-auto flex h-14 sm:h-16 max-w-5xl items-center justify-between px-2.5 sm:px-6">
        
        {/* Brand Lockup */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <img
            src="./pwa-icon.png"
            alt="HydroSense"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shadow-md shadow-cyan-500/20 object-contain shrink-0 bg-white"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {t.brandName}
              </span>
              <span className="hidden sm:inline-flex text-[9px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/50 px-1.5 py-0.5 rounded shrink-0">
                {t.versionBadge}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
              શ્રી સરકારી માધ્યમિક શાળા લાખાપર
            </p>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'dashboard'
                ? 'text-cyan-700 bg-cyan-50/80 dark:text-cyan-300 dark:bg-cyan-950/40'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {t.navDashboard}
          </button>

          <button
            onClick={() => setActiveTab('usage')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'usage'
                ? 'text-cyan-700 bg-cyan-50/80 dark:text-cyan-300 dark:bg-cyan-950/40'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Droplets className="h-3.5 w-3.5" />
            {t.navUsage}
          </button>

          <button
            onClick={() => setActiveTab('insights')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'insights'
                ? 'text-cyan-700 bg-cyan-50/80 dark:text-cyan-300 dark:bg-cyan-950/40'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {t.navInsights}
          </button>

          <button
            onClick={() => setActiveTab('calibration')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
              activeTab === 'calibration'
                ? 'text-cyan-700 bg-cyan-50/80 dark:text-cyan-300 dark:bg-cyan-950/40'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Wrench className="h-3 w-3" />
            {t.navCalibration}
          </button>

          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
              activeTab === 'hardware'
                ? 'text-cyan-700 bg-cyan-50/80 dark:text-cyan-300 dark:bg-cyan-950/40'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Smartphone className="h-3 w-3" />
            {t.navHardware}
          </button>
        </nav>

        {/* Actions Group (Language, Theme, Settings, Connect) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Gujarati / English Toggle Button */}
          <button
            onClick={onToggleLanguage}
            title={t.switchLang}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-50/70 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 active:scale-95 transition-all text-xs font-bold"
          >
            <Languages className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{lang === 'en' ? 'ગુજરાતી' : 'English'}</span>
            <span className="sm:hidden text-[11px]">{lang === 'en' ? 'ગુજ' : 'EN'}</span>
          </button>

          {/* Tank Config & Calibration Modal Trigger */}
          <button
            onClick={onOpenSettings}
            title={t.settingsTitle}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-100 active:scale-95 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 transition-all shrink-0"
          >
            <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>

          {/* Dark / Light Toggle */}
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

          {/* Connection Trigger */}
          <div className="relative">
            {isConnected ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/40 px-2 sm:px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-[11px] truncate max-w-[70px] sm:max-w-[120px]">
                  {connectionState.transport === 'usb_serial'
                    ? 'USB 9600'
                    : connectionState.transport === 'bluetooth_spp'
                    ? 'HC-05'
                    : 'Sim'}
                </span>
                <button
                  onClick={onDisconnect}
                  title={t.disconnect}
                  className="ml-0.5 text-emerald-700 hover:text-rose-600 dark:text-emerald-400 dark:hover:text-rose-400 font-bold p-0.5 text-sm leading-none"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConnectMenuOpen(!connectMenuOpen)}
                disabled={isConnecting}
                className="flex items-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all shrink-0"
              >
                <Radio className={`h-3.5 w-3.5 shrink-0 ${isConnecting ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isConnecting ? t.connecting : t.connectDevice}</span>
                <span className="sm:hidden text-[11px]">{isConnecting ? '...' : 'Connect'}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
            )}

            {/* Mobile-Friendly Backdrop Overlay to dismiss on tap */}
            {connectMenuOpen && !isConnected && (
              <div
                className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
                onClick={() => setConnectMenuOpen(false)}
              />
            )}

            {/* Connection Options Dropdown */}
            {connectMenuOpen && !isConnected && (
              <div
                className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/95 z-50 animate-fade-in"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Select Hardware Link</span>
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
                    onConnectUsb();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white active:scale-[0.98] transition-all"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
                    <Cable className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{t.connectViaUsb}</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      Web Serial (Desktop & Android USB OTG)
                    </div>
                  </div>
                </button>

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
                    <div className="font-bold text-slate-900 dark:text-white">Android HC-05 Bluetooth</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      Classic SPP (Native Bridge / WebView)
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
                    <div className="font-bold text-slate-900 dark:text-white">{t.connectViaTestBench}</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      Arduino Level Simulator & Loopback
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
