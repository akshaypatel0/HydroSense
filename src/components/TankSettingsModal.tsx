import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Droplets,
  HardDrive,
  HelpCircle,
  Loader2,
  Lock,
  Moon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Target,
  Wrench,
  X,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { usageTracker } from '../services/usageTracker';
import { ConnectionState, TankConfig, TelemetryData } from '../types';

interface TankSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TankConfig;
  onSaveConfig: (newConfig: TankConfig) => void;
  telemetry: TelemetryData | null;
  connectionState: ConnectionState;
  onSendCalibration: (command: 'CAL_EMPTY' | 'CAL_FULL') => Promise<{ success: boolean; message: string }>;
  lang: Language;
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
}

export const TankSettingsModal: React.FC<TankSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  telemetry,
  connectionState,
  onSendCalibration,
  lang,
  isDarkMode,
  setIsDarkMode,
}) => {
  const t = TRANSLATIONS[lang];
  const [activeSubTab, setActiveSubTab] = useState<'calibration' | 'capacity'>('calibration');

  // Capacity & Target Form State
  const [capacity, setCapacity] = useState<number>(config.tankCapacityLiters);
  const [lowMark, setLowMark] = useState<number>(config.lowThresholdPercent);
  const [dailyTarget, setDailyTarget] = useState<number>(
    config.dailyTargetLiters ?? usageTracker.getDailyTarget()
  );

  // 2-Step Calibration Wizard State
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [emptyRecordedDist, setEmptyRecordedDist] = useState<number | null>(null);
  const [fullRecordedDist, setFullRecordedDist] = useState<number | null>(null);

  if (!isOpen) return null;

  const isConnected = connectionState.status === 'connected';

  // Saved Arduino values
  const calEmpty = telemetry?.calEmpty ?? 12.8;
  const calFull = telemetry?.calFull ?? 2.1;
  const currentDistance = telemetry?.distance ?? null;
  const usableDepth = Math.max(0.1, Math.round((calEmpty - calFull) * 10) / 10);
  const isEepromSaved = telemetry?.calStatus === 'OK';

  // Step 1: Empty Tank Calibration
  const handleStartEmptyCalibration = async () => {
    if (!isConnected || isCalibrating) return;
    setIsCalibrating(true);
    setCalError(null);

    try {
      const result = await onSendCalibration('CAL_EMPTY');
      if (result.success) {
        setEmptyRecordedDist(currentDistance ?? calEmpty);
        setWizardStep(2);
      } else {
        setCalError(result.message);
      }
    } catch {
      setCalError('Calibration transmission failed. Check connection.');
    } finally {
      setIsCalibrating(false);
    }
  };

  // Step 2: Full Tank Calibration
  const handleSetFullLevel = async () => {
    if (!isConnected || isCalibrating) return;
    setIsCalibrating(true);
    setCalError(null);

    try {
      const result = await onSendCalibration('CAL_FULL');
      if (result.success) {
        setFullRecordedDist(currentDistance ?? calFull);
        setWizardStep(3);
      } else {
        setCalError(result.message);
      }
    } catch {
      setCalError('Calibration transmission failed. Check connection.');
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleResetWizard = () => {
    setWizardStep(1);
    setCalError(null);
    setEmptyRecordedDist(null);
    setFullRecordedDist(null);
  };

  // Capacity Form Handlers
  const handleSaveCapacity = (e: React.FormEvent) => {
    e.preventDefault();
    usageTracker.setDailyTarget(dailyTarget);
    onSaveConfig({
      tankCapacityLiters: capacity,
      lowThresholdPercent: lowMark,
      dailyTargetLiters: dailyTarget,
    });
    onClose();
  };

  const handleResetCapacityDefaults = () => {
    setCapacity(500);
    setLowMark(25);
    setDailyTarget(120);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-lg my-auto max-h-[90dvh] flex flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/95 transition-all text-slate-900 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {t.settingsTitle}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.settingsSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="p-3 sm:px-5 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0">
          <div className="flex rounded-xl bg-slate-200/70 dark:bg-slate-800/70 p-1 text-xs font-semibold">
            <button
              onClick={() => setActiveSubTab('calibration')}
              className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeSubTab === 'calibration'
                  ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>{t.tabCalibration}</span>
            </button>

            <button
              onClick={() => setActiveSubTab('capacity')}
              className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeSubTab === 'capacity'
                  ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Droplets className="h-3.5 w-3.5" />
              <span>{t.tabCapacity}</span>
            </button>
          </div>
        </div>

        {/* TAB 1: 2-STEP TANK CALIBRATION WIZARD */}
        {activeSubTab === 'calibration' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto touch-scroll flex-1">
            
            {/* Connection Warning Banner if Disconnected */}
            {!isConnected && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <span className="font-bold block">{t.disconnected}</span>
                  <span>{t.hardwareDisconnectedWarning}</span>
                </div>
              </div>
            )}

            {/* Current Saved EEPROM Calibration Status */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-cyan-500" />
                  {t.eepromState}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="h-3 w-3" />
                  {isEepromSaved ? t.savedInEeprom : 'ACTIVE'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white dark:bg-slate-900 p-2 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-400 font-medium block">{t.emptyPointLabel}</span>
                  <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                    {calEmpty.toFixed(1)} cm
                  </span>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-2 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-400 font-medium block">{t.fullPointLabel}</span>
                  <span className="text-sm font-mono font-black text-cyan-600 dark:text-cyan-400">
                    {calFull.toFixed(1)} cm
                  </span>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-2 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-400 font-medium block">{t.usableDepthLabel}</span>
                  <span className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                    {usableDepth.toFixed(1)} cm
                  </span>
                </div>
              </div>

              {/* Live Distance Preview (Only shown inside calibration, per non-technical dashboard rule) */}
              {isConnected && currentDistance !== null && (
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{t.liveDistanceLabel}:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                    {currentDistance.toFixed(2)} cm
                  </span>
                </div>
              )}
            </div>

            {/* Step Navigation Indicator */}
            <div className="flex items-center justify-between px-2 text-xs">
              <div
                className={`flex items-center gap-1.5 font-bold ${
                  wizardStep === 1
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : wizardStep > 1
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${
                    wizardStep === 1
                      ? 'bg-cyan-500 text-white'
                      : wizardStep > 1
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                >
                  {wizardStep > 1 ? '✓' : '1'}
                </span>
                <span>{t.step1Title}</span>
              </div>

              <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-700" />

              <div
                className={`flex items-center gap-1.5 font-bold ${
                  wizardStep === 2
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : wizardStep === 3
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${
                    wizardStep === 2
                      ? 'bg-cyan-500 text-white'
                      : wizardStep === 3
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                >
                  {wizardStep === 3 ? '✓' : '2'}
                </span>
                <span>{t.step2Title}</span>
              </div>
            </div>

            {/* Error Alert */}
            {calError && (
              <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block">Calibration Error</span>
                  <span>{calError}</span>
                </div>
              </div>
            )}

            {/* WIZARD STEP 1: EMPTY TANK */}
            {wizardStep === 1 && (
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 shrink-0 mt-0.5">
                    <Droplets className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t.step1Title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {t.step1Desc}
                    </p>
                  </div>
                </div>

                {isConnected && currentDistance !== null && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t.liveDistanceLabel}:</span>
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                      {currentDistance.toFixed(2)} cm
                    </span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartEmptyCalibration}
                    disabled={!isConnected || isCalibrating}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md flex items-center justify-center gap-2 transition-all ${
                      !isConnected || isCalibrating
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                        : 'bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98]'
                    }`}
                  >
                    {isCalibrating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t.calibratingEmpty}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t.startEmptyCalBtn}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* WIZARD STEP 2: FULL TANK */}
            {wizardStep === 2 && (
              <div className="rounded-2xl border border-cyan-500/30 dark:border-cyan-500/20 bg-cyan-500/5 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-600 shrink-0 mt-0.5">
                    <Droplets className="h-4 w-4 fill-cyan-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t.step2Title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {t.step2Desc}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/80 dark:bg-slate-900/80 p-2.5 border border-slate-200/60 dark:border-slate-800/60 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>{t.emptyPointLabel}:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {emptyRecordedDist?.toFixed(1) ?? calEmpty.toFixed(1)} cm
                    </span>
                  </div>
                  {isConnected && currentDistance !== null && (
                    <div className="flex items-center justify-between text-slate-500">
                      <span>{t.liveDistanceLabel}:</span>
                      <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        {currentDistance.toFixed(2)} cm
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    disabled={isCalibrating}
                    className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t.backToStep1}
                  </button>

                  <button
                    type="button"
                    onClick={handleSetFullLevel}
                    disabled={!isConnected || isCalibrating}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md flex items-center justify-center gap-2 transition-all ${
                      !isConnected || isCalibrating
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                        : 'bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98]'
                    }`}
                  >
                    {isCalibrating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t.calibratingFull}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t.setFullLevelBtn}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* WIZARD STEP 3: SUCCESS CONFIRMATION */}
            {wizardStep === 3 && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/40 p-5 text-center space-y-4 animate-fade-in">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-bounce">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div>
                  <h4 className="text-base font-black text-emerald-900 dark:text-emerald-200">
                    {t.calSuccessTitle}
                  </h4>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1 max-w-sm mx-auto">
                    {t.calSuccessDesc}
                  </p>
                </div>

                <div className="rounded-xl bg-white/80 dark:bg-slate-900/80 p-3 border border-emerald-500/20 text-xs grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">{t.emptyPointLabel}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                      {calEmpty.toFixed(1)} cm
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">{t.fullPointLabel}</span>
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                      {calFull.toFixed(1)} cm
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">{t.usableDepthLabel}</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {usableDepth.toFixed(1)} cm
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleResetWizard}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{t.recalibrateBtn}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md hover:bg-emerald-500 transition-colors"
                  >
                    {t.doneBtn}
                  </button>
                </div>
              </div>
            )}

            {/* Persistent EEPROM explanation */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3 border border-slate-200/60 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                <HelpCircle className="h-3.5 w-3.5 text-cyan-500" />
                <span>{t.howEepromWorks}</span>
              </div>
              <p className="leading-relaxed">
                {t.eepromExplanation}
              </p>
            </div>

          </div>
        )}

        {/* TAB 2: TANK CAPACITY & DAILY USAGE TARGET */}
        {activeSubTab === 'capacity' && (
          <form onSubmit={handleSaveCapacity} className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto touch-scroll flex-1">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                {t.tankCapacityInputLabel}
              </label>
              <input
                type="number"
                min={1}
                max={50000}
                step={1}
                value={capacity}
                onChange={(e) => setCapacity(parseFloat(e.target.value) || 500)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {t.tankCapacityHelp}
              </p>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                {t.dailyTargetInputLabel}
              </label>
              <input
                type="number"
                min={5}
                max={5000}
                step={5}
                value={dailyTarget}
                onChange={(e) => setDailyTarget(parseFloat(e.target.value) || 120)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {t.dailyTargetHelp}
              </p>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                {t.lowAlertThresholdLabel}
              </label>
              <input
                type="number"
                min={5}
                max={40}
                value={lowMark}
                onChange={(e) => setLowMark(parseInt(e.target.value, 10) || 25)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            {/* Appearance & Theme Selector */}
            {setIsDarkMode && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-2">
                  {lang === 'gu' ? 'થીમ પસંદગી (Appearance)' : 'App Theme & Appearance'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDarkMode(false)}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      !isDarkMode
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-300 shadow-sm ring-1 ring-cyan-500'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Sun className="h-4 w-4 text-amber-500" />
                    <span>{lang === 'gu' ? 'લાઇટ થીમ' : 'Light Theme'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDarkMode(true)}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      isDarkMode
                        ? 'border-cyan-500 bg-cyan-950/60 text-cyan-300 shadow-sm ring-1 ring-cyan-500'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Moon className="h-4 w-4 text-cyan-400" />
                    <span>{lang === 'gu' ? 'ડાર્ક થીમ' : 'Dark Theme'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="pt-3 flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800/80">
              <button
                type="button"
                onClick={handleResetCapacityDefaults}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t.resetDefaultsBtn}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-slate-600 dark:text-slate-400 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 text-white font-bold text-xs hover:bg-cyan-500 shadow-sm active:scale-95 transition-all"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{t.saveSettingsBtn}</span>
                </button>
              </div>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
