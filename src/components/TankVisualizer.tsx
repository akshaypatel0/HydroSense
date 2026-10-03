import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Droplets,
  Edit3,
  Gauge,
  Maximize2,
  Minimize2,
  Radio,
  Settings,
  ShieldAlert,
  Sparkles,
  Waves,
  X,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { usageTracker } from '../services/usageTracker';
import { ConnectionStatus, TankConfig, TelemetryData, WaterLevelStatus } from '../types';

interface TankVisualizerProps {
  telemetry: TelemetryData | null;
  connectionStatus: ConnectionStatus;
  isStale: boolean;
  tankConfig: TankConfig;
  onUpdateConfig?: (newConfig: Partial<TankConfig>) => void;
  lang: Language;
}

export const TankVisualizer: React.FC<TankVisualizerProps> = ({
  telemetry,
  connectionStatus,
  isStale,
  tankConfig,
  onUpdateConfig,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [customCapacityInput, setCustomCapacityInput] = useState(
    tankConfig.tankCapacityLiters.toString()
  );
  const [capacityUnit, setCapacityUnit] = useState<'L' | 'gal'>('L');

  const isConnected = connectionStatus === 'connected';
  const hasData = isConnected && telemetry !== null;

  // Sensor absent / unavailable detection
  const isSensorUnavailable =
    hasData && Boolean(telemetry.isSensorUnavailable || telemetry.error === 'SENSOR:ABSENT');
  const hasValidWater = hasData && !isSensorUnavailable && telemetry.water !== null;

  // Real authoritative water percentage from Arduino Uno without artificial smoothing
  const waterPercent: number =
    hasValidWater && telemetry.water !== null ? Math.max(0, Math.min(100, telemetry.water)) : 0;
  const isBuzzerActive = hasData && telemetry.buzzer === 'ON';
  const isContinuousBuzzer = hasData && Boolean(telemetry.continuousBuzzer);
  const isTankFull =
    hasValidWater && (Boolean(telemetry.isTankFull) || waterPercent >= 98.9);

  // Status mapping
  const status: WaterLevelStatus = isSensorUnavailable
    ? 'SENSOR_ABSENT'
    : hasValidWater
    ? telemetry.status
    : 'NORMAL';

  // Volume calculations in Liters & Gallons
  const currentLiters = hasValidWater
    ? Math.round(((waterPercent / 100) * tankConfig.tankCapacityLiters) * 10) / 10
    : null;
  const freeLiters =
    currentLiters !== null
      ? Math.max(0, Math.round((tankConfig.tankCapacityLiters - currentLiters) * 10) / 10)
      : null;

  // Unit conversion helpers
  const displayLiters = (liters: number | null) => {
    if (liters === null) return '—';
    if (capacityUnit === 'gal') {
      return (liters * 0.264172).toFixed(1);
    }
    return liters.toFixed(1);
  };
  const unitLabel = capacityUnit === 'gal' ? 'gal' : t.litersUnit;

  // Today's estimated usage and refills from tracking service
  const todayUsage = usageTracker.getTodayUsage();
  const todayRefills = usageTracker.getTodayRefills?.() ?? 0;

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
          (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Keyboard shortcut: F for fullscreen, Esc for exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          toggleFullscreen();
        }
      } else if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && !(document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as unknown as { webkitRequestFullscreen?: () => Promise<void> })?.webkitRequestFullscreen) {
          await (containerRef.current as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else {
          // In-app fallback for WebViews that block Fullscreen API
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> })?.webkitExitFullscreen) {
          await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (_err) {
      // Fallback to internal fullscreen state
      setIsFullscreen((prev) => !prev);
    }
  };

  // Quick capacity change handler
  const handleSelectCapacity = (liters: number) => {
    if (liters <= 0) return;
    onUpdateConfig?.({ tankCapacityLiters: liters });
    setCustomCapacityInput(liters.toString());
    setIsEditingCapacity(false);
  };

  const handleCustomCapacitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customCapacityInput);
    if (!isNaN(val) && val > 0) {
      const finalVal = capacityUnit === 'gal' ? Math.round(val / 0.264172) : Math.round(val);
      onUpdateConfig?.({ tankCapacityLiters: finalVal });
      setIsEditingCapacity(false);
    }
  };

  // 60fps Real fluid wave physics loop
  const [wavePhase, setWavePhase] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let lastTime = performance.now();
    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      // Gentle natural water oscillation (1.8 rad/sec)
      setWavePhase((prev) => (prev + delta * 1.8) % (Math.PI * 2));
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Tank geometric dimensions inside SVG
  const svgWidth = 340;
  const svgHeight = 460;
  const tankTopY = 62;
  const tankBottomY = 412;
  const tankHeight = tankBottomY - tankTopY; // 350px usable physical height
  const tankLeftX = 55;
  const tankRightX = 285;
  const tankWidth = tankRightX - tankLeftX; // 230px

  // Compute water level height
  const liquidHeight = hasValidWater
    ? Math.max(0, Math.min(tankHeight, (waterPercent / 100) * tankHeight))
    : 0;
  const surfaceY = tankBottomY - liquidHeight;

  // Wave amplitude: natural realistic fluid ripple (gentle at rest, zero when empty or sensor absent)
  const waveAmplitude = hasValidWater && waterPercent > 0.5 ? Math.min(3.8, 1.8 + (waterPercent / 50)) : 0;
  const waveLength = 76;

  // Generate realistic fluid surface wave path with true meniscus curve at container walls
  let waterWavePath = `M ${tankLeftX},${tankBottomY} L ${tankLeftX},${surfaceY - (waveAmplitude * 0.4)} `;
  // Left capillary meniscus curve
  waterWavePath += `Q ${tankLeftX + 6},${surfaceY + 1} ${tankLeftX + 14},${surfaceY} `;

  for (let x = tankLeftX + 14; x <= tankRightX - 14; x += 6) {
    const relX = x - tankLeftX;
    // Composite multi-harmonic fluid wave: primary harmonic + secondary counter-harmonic + micro ripple
    const y =
      surfaceY +
      Math.sin(relX / waveLength + wavePhase) * waveAmplitude +
      Math.cos(relX / (waveLength * 0.55) - wavePhase * 1.4) * (waveAmplitude * 0.35) +
      Math.sin(relX / 18 + wavePhase * 2.2) * (waveAmplitude * 0.12);
    waterWavePath += `L ${x},${y} `;
  }
  // Right capillary meniscus curve
  waterWavePath += `Q ${tankRightX - 6},${surfaceY + 1} ${tankRightX},${surfaceY - (waveAmplitude * 0.4)} `;
  waterWavePath += `L ${tankRightX},${tankBottomY} Z`;

  // Secondary depth wave layer (out-of-phase for 3D liquid depth and refraction)
  let waterWaveBackPath = `M ${tankLeftX},${tankBottomY} L ${tankLeftX},${surfaceY} `;
  for (let x = tankLeftX; x <= tankRightX; x += 8) {
    const relX = x - tankLeftX;
    const y =
      surfaceY +
      Math.sin(relX / (waveLength * 0.8) - wavePhase * 1.2 + 1.4) * (waveAmplitude * 0.75) +
      Math.cos(relX / 24 + wavePhase * 1.5) * (waveAmplitude * 0.2);
    waterWaveBackPath += `L ${x},${y} `;
  }
  waterWaveBackPath += `L ${tankRightX},${tankBottomY} Z`;

  // Bobbing float indicator coordinates on wave crest
  const floatX = tankLeftX + tankWidth * 0.72;
  const floatSurfaceY =
    surfaceY +
    Math.sin((floatX - tankLeftX) / waveLength + wavePhase) * waveAmplitude +
    Math.cos((floatX - tankLeftX) / (waveLength * 0.55) - wavePhase * 1.4) * (waveAmplitude * 0.35);

  // Key threshold tick marks inside the tank
  const y989 = tankBottomY - (98.9 / 100) * tankHeight;
  const y900 = tankBottomY - (90.0 / 100) * tankHeight;
  const y750 = tankBottomY - (75.0 / 100) * tankHeight;
  const y500 = tankBottomY - (50.0 / 100) * tankHeight;
  const y250 = tankBottomY - (25.0 / 100) * tankHeight;

  // Realistic fluid styling based on state
  const getLiquidTheme = () => {
    if (!hasData) {
      return {
        gradTop: '#38bdf8',
        gradMid: '#0284c7',
        gradDeep: '#0f172a',
        backGrad: '#0369a1',
        badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
      };
    }
    if (isSensorUnavailable) {
      return {
        gradTop: '#f43f5e',
        gradMid: '#e11d48',
        gradDeep: '#4c0519',
        backGrad: '#9f1239',
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold border-rose-500/30',
      };
    }
    if (isTankFull || waterPercent >= 98.9) {
      return {
        gradTop: '#f43f5e',
        gradMid: '#be123c',
        gradDeep: '#4c0519',
        backGrad: '#881337',
        badgeClass: 'bg-rose-600 text-white font-black animate-pulse shadow-rose-500/40 shadow-lg',
      };
    }
    if (waterPercent > 95.0) {
      return {
        gradTop: '#fb7185',
        gradMid: '#e11d48',
        gradDeep: '#4c0519',
        backGrad: '#9f1239',
        badgeClass: 'bg-rose-500/20 text-rose-800 dark:text-rose-200 font-bold border-rose-500/40',
      };
    }
    if (waterPercent > 90.0) {
      return {
        gradTop: '#fbbf24',
        gradMid: '#d97706',
        gradDeep: '#451a03',
        backGrad: '#78350f',
        badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-200 font-bold border-amber-500/40',
      };
    }
    if (waterPercent <= (tankConfig.lowThresholdPercent || 25)) {
      return {
        gradTop: '#38bdf8',
        gradMid: '#0284c7',
        gradDeep: '#082f49',
        backGrad: '#0369a1',
        badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-200 font-bold border-amber-500/40',
      };
    }
    return {
      gradTop: '#22d3ee',
      gradMid: '#0284c7',
      gradDeep: '#083344',
      backGrad: '#0e7490',
      badgeClass: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 font-bold border-cyan-500/30',
    };
  };

  const liquidTheme = getLiquidTheme();

  const getTranslatedStatus = (st: WaterLevelStatus) => {
    if (isSensorUnavailable || st === 'SENSOR_ABSENT') return t.sensorUnavailable;
    if (isTankFull) return t.statusTankFull;
    switch (st) {
      case 'LOW':
        return t.statusLow;
      case 'NORMAL':
        return t.statusNormal;
      case 'HIGH':
        return t.statusHigh;
      case 'CRITICAL':
        return t.statusCritical;
      default:
        return st;
    }
  };

  // Aeration micro bubbles rising organically
  const bubbles = [
    { cx: tankLeftX + 38, offset: 0, speed: 28, r: 2.2 },
    { cx: tankLeftX + 75, offset: 1.8, speed: 36, r: 1.6 },
    { cx: tankLeftX + 115, offset: 3.4, speed: 32, r: 2.5 },
    { cx: tankLeftX + 155, offset: 0.9, speed: 42, r: 1.8 },
    { cx: tankLeftX + 195, offset: 2.5, speed: 26, r: 2.0 },
    { cx: tankLeftX + 215, offset: 4.2, speed: 38, r: 1.5 },
  ];

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white/90 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl dark:border-slate-800/90 dark:bg-slate-900/90 transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none p-4 sm:p-8 flex flex-col justify-between overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white min-h-[100dvh]'
          : ''
      }`}
    >
      {/* Top Header Card */}
      <div className="w-full flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0">
            <Droplets className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight uppercase text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{t.waterVolumeTitle}</span>
              <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-normal lowercase">
                (live)
              </span>
            </h2>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
              <span>{tankConfig.tankCapacityLiters} {t.litersUnit} Tank</span>
              {freeLiters !== null && (
                <>
                  <span>·</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{freeLiters.toFixed(1)} {t.litersUnit} free</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls: Fullscreen Toggle & Status Badge */}
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              <span>STALE</span>
            </span>
          )}

          {hasData ? (
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 shadow-sm ${liquidTheme.badgeClass}`}
            >
              {isSensorUnavailable ? (
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              ) : isTankFull ? (
                <BellRing className="h-3.5 w-3.5 text-white animate-bounce shrink-0" />
              ) : status === 'CRITICAL' || status === 'HIGH' ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-cyan-500 shrink-0" />
              )}
              <span>{getTranslatedStatus(status)}</span>
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
              {t.statusOffline}
            </span>
          )}

          {/* Full Screen Mode Toggle Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? t.exitFullscreen : 'Full Screen Monitor'}
            aria-label="Toggle Fullscreen"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm shrink-0 flex items-center gap-1.5"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span className="text-xs font-bold hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                <span className="text-xs font-bold hidden sm:inline">Full Screen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Realistic Tank Visualizer Stage */}
      <div className={`relative my-2 w-full flex flex-col items-center justify-center ${isFullscreen ? 'flex-1 my-4' : ''}`}>
        {/* Realistic Physical 3D SVG Tank Container */}
        <div className={`relative w-full aspect-[340/460] flex items-center justify-center select-none ${
          isFullscreen ? 'max-w-[420px] max-h-[70vh]' : 'max-w-[300px] sm:max-w-[340px]'
        }`}>
          <svg
            className="w-full h-full drop-shadow-2xl"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* 3D Cylindrical lighting for industrial tank wall */}
              <linearGradient id="tankShell3D" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#090d16" stopOpacity="0.95" />
                <stop offset="14%" stopColor="#1e293b" stopOpacity="0.8" />
                <stop offset="28%" stopColor="#334155" stopOpacity="0.55" />
                <stop offset="42%" stopColor="#475569" stopOpacity="0.4" />
                <stop offset="65%" stopColor="#1e293b" stopOpacity="0.65" />
                <stop offset="88%" stopColor="#0f172a" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0.98" />
              </linearGradient>

              {/* Cylindrical Rib Highlight / Shadow Gradient */}
              <linearGradient id="ribSheenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="20%" stopColor="#475569" />
                <stop offset="45%" stopColor="#94a3b8" />
                <stop offset="70%" stopColor="#475569" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              {/* Metallic Ring & Pipe Gradient */}
              <linearGradient id="metalFittingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="30%" stopColor="#64748b" />
                <stop offset="50%" stopColor="#cbd5e1" />
                <stop offset="70%" stopColor="#64748b" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>

              {/* Primary Realistic Water Fluid Gradient */}
              <linearGradient id="realisticLiquidFront" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={liquidTheme.gradTop} stopOpacity="0.92" />
                <stop offset="35%" stopColor={liquidTheme.gradMid} stopOpacity="0.95" />
                <stop offset="100%" stopColor={liquidTheme.gradDeep} stopOpacity="0.98" />
              </linearGradient>

              {/* Secondary Liquid Depth Layer (Refraction & 3D shadow) */}
              <linearGradient id="realisticLiquidBack" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={liquidTheme.backGrad} stopOpacity="0.55" />
                <stop offset="100%" stopColor={liquidTheme.gradDeep} stopOpacity="0.85" />
              </linearGradient>

              {/* Cylindrical Volume Radial Shading Overlay */}
              <radialGradient id="tankVolumetricShadow" cx="50%" cy="50%" r="50%" fx="35%" fy="45%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
                <stop offset="70%" stopColor="#000000" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
              </radialGradient>

              {/* Ultrasonic Echo Beam Pulsing Downward */}
              <linearGradient id="ultrasonicPulseBeam" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* --- 1. OVERHEAD SENSOR & INDUSTRIAL TOP COVER --- */}
            {/* Top Inflow Pipe with bolted flange */}
            <path
              d="M 252 20 L 252 46 L 268 46 L 268 20 Z"
              fill="url(#metalFittingGrad)"
              stroke="#0f172a"
              strokeWidth="1.5"
            />
            <rect x="248" y="16" width="24" height="6" rx="2" fill="#64748b" stroke="#1e293b" />
            <circle cx="254" cy="19" r="1.5" fill="#e2e8f0" />
            <circle cx="266" cy="19" r="1.5" fill="#e2e8f0" />

            {/* Air Pressure Breather Cowl (Left) */}
            <path
              d="M 80 46 L 80 32 Q 80 24 88 24 L 98 24 L 98 34 L 90 34 Q 87 34 87 38 L 87 46 Z"
              fill="url(#metalFittingGrad)"
              stroke="#1e293b"
              strokeWidth="1"
            />

            {/* Ultrasonic HC-SR04 Pod Bracket & Transducers */}
            <g id="ultrasonicSensorPod">
              {/* Mounting Bridge */}
              <rect x="145" y="20" width="50" height="9" rx="2.5" fill="#334155" stroke="#0f172a" strokeWidth="1.5" />
              {/* Ultrasonic Transducers (Transmitter & Receiver Barrels) */}
              <circle cx="160" cy="33" r="6.5" fill="url(#metalFittingGrad)" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="160" cy="33" r="2.8" fill="#1e293b" />
              <circle cx="180" cy="33" r="6.5" fill="url(#metalFittingGrad)" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="180" cy="33" r="2.8" fill="#1e293b" />
              
              {/* Active Acoustic Sound Waves Pulsing to Surface */}
              {hasValidWater && (
                <path
                  d={`M 158 40 L ${tankLeftX + 25} ${surfaceY} L ${tankRightX - 25} ${surfaceY} L 182 40 Z`}
                  fill="url(#ultrasonicPulseBeam)"
                />
              )}
            </g>

            {/* Domed Inspection Manhole Screw Cover */}
            <ellipse cx="170" cy="62" rx="52" ry="14" fill="url(#ribSheenGrad)" stroke="#0f172a" strokeWidth="2.5" />
            <ellipse cx="170" cy="59" rx="44" ry="10" fill="#1e293b" stroke="#334155" strokeWidth="1" />
            {/* Grip Ridges on Manhole Cover */}
            {[-28, -14, 0, 14, 28].map((offset) => (
              <line
                key={`grip-${offset}`}
                x1={170 + offset}
                y1={55}
                x2={170 + offset}
                y2={63}
                stroke="#64748b"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ))}

            {/* --- 2. MAIN REALISTIC CYLINDRICAL TANK BODY --- */}
            {/* Outer Tank Wall Silhouette */}
            <rect
              x={tankLeftX}
              y={tankTopY}
              width={tankWidth}
              height={tankHeight}
              rx="26"
              fill="url(#tankShell3D)"
              stroke="#0f172a"
              strokeWidth="3.5"
            />

            {/* Tank Internal Chamber Clip Path */}
            <g clipPath="url(#tankInternalClip)">
              <clipPath id="tankInternalClip">
                <rect
                  x={tankLeftX + 3.5}
                  y={tankTopY + 3.5}
                  width={tankWidth - 7}
                  height={tankHeight - 7}
                  rx="23"
                />
              </clipPath>

              {/* Tank Dark Interior Backing */}
              <rect
                x={tankLeftX}
                y={tankTopY}
                width={tankWidth}
                height={tankHeight}
                fill="#0b1120"
              />

              {/* Molded Structural Reinforcing Ribs (Background Chamber) */}
              {[120, 175, 230, 285, 340].map((ribY) => (
                <line
                  key={`rib-bg-${ribY}`}
                  x1={tankLeftX}
                  y1={ribY}
                  x2={tankRightX}
                  y2={ribY}
                  stroke="#1e293b"
                  strokeWidth="6"
                  opacity="0.5"
                />
              ))}

              {/* --- LIQUID RENDERING LAYERS --- */}
              {hasValidWater && liquidHeight > 0 && (
                <g id="waterLiquidGroup">
                  {/* Secondary Back Depth Wave (Out of phase for 3D depth) */}
                  <path d={waterWaveBackPath} fill="url(#realisticLiquidBack)" />

                  {/* Primary Front Fluid Body with Wave Physics */}
                  <path d={waterWavePath} fill="url(#realisticLiquidFront)" />

                  {/* Liquid Surface Meniscus Specular Highlight Line */}
                  <path
                    d={waterWavePath}
                    stroke="#ffffff"
                    strokeWidth="2.2"
                    strokeOpacity="0.75"
                    strokeLinecap="round"
                    fill="none"
                  />

                  {/* Caustic Light Beams under the water surface */}
                  <g opacity="0.18">
                    <line x1={tankLeftX + 45} y1={surfaceY} x2={tankLeftX + 65} y2={tankBottomY} stroke="#ffffff" strokeWidth="12" strokeDasharray="30 20" />
                    <line x1={tankLeftX + 130} y1={surfaceY} x2={tankLeftX + 155} y2={tankBottomY} stroke="#ffffff" strokeWidth="18" strokeDasharray="40 25" />
                    <line x1={tankLeftX + 185} y1={surfaceY} x2={tankLeftX + 210} y2={tankBottomY} stroke="#ffffff" strokeWidth="14" strokeDasharray="25 35" />
                  </g>

                  {/* Rising Aeration Micro-Bubbles with Natural Sway */}
                  {bubbles.map((b, i) => {
                    const travelHeight = liquidHeight * 0.85;
                    const progress = ((wavePhase * b.speed + b.offset * 40) % travelHeight);
                    const bubbleY = tankBottomY - 8 - progress;
                    const sway = Math.sin(progress / 18 + b.offset) * 3;
                    return (
                      <circle
                        key={`bubble-${i}`}
                        cx={b.cx + sway}
                        cy={bubbleY}
                        r={b.r}
                        fill="#ffffff"
                        opacity={bubbleY <= surfaceY + 4 ? 0 : 0.45}
                      />
                    );
                  })}

                  {/* Vertical Float Guide Rod & Buoyant Spherical Float */}
                  <line
                    x1={floatX}
                    y1={tankTopY + 12}
                    x2={floatX}
                    y2={tankBottomY - 12}
                    stroke="#64748b"
                    strokeWidth="1.8"
                    strokeDasharray="5 3"
                    opacity="0.5"
                  />
                  {/* Buoyant Orange Level Float Ball */}
                  <circle
                    cx={floatX}
                    cy={floatSurfaceY + 3}
                    r="9.5"
                    fill="#f97316"
                    stroke="#c2410c"
                    strokeWidth="2"
                  />
                  {/* Float Specular Glint */}
                  <ellipse
                    cx={floatX - 3}
                    cy={floatSurfaceY}
                    rx="3"
                    ry="2"
                    fill="#ffffff"
                    opacity="0.85"
                  />
                </g>
              )}

              {/* Sensor Unavailable / Disconnected Overlay */}
              {isSensorUnavailable && (
                <g id="sensorUnavailableOverlay">
                  <rect
                    x={tankLeftX}
                    y={tankTopY}
                    width={tankWidth}
                    height={tankHeight}
                    fill="#4c0519"
                    fillOpacity="0.5"
                  />
                  <line x1={tankLeftX} y1={tankTopY + 50} x2={tankRightX} y2={tankTopY + 140} stroke="#f43f5e" strokeWidth="3" opacity="0.35" />
                  <line x1={tankLeftX} y1={tankTopY + 130} x2={tankRightX} y2={tankTopY + 220} stroke="#f43f5e" strokeWidth="3" opacity="0.35" />
                  <line x1={tankLeftX} y1={tankTopY + 210} x2={tankRightX} y2={tankTopY + 300} stroke="#f43f5e" strokeWidth="3" opacity="0.35" />
                </g>
              )}

              {/* 3D Cylindrical Volume Shading & Glass Specular Highlight */}
              <rect
                x={tankLeftX}
                y={tankTopY}
                width={tankWidth}
                height={tankHeight}
                fill="url(#tankVolumetricShadow)"
                pointerEvents="none"
              />

              {/* Specular Ambient Curvature Reflection (Left Cylindrical Glint) */}
              <rect
                x={tankLeftX + 18}
                y={tankTopY}
                width="18"
                height={tankHeight}
                fill="#ffffff"
                fillOpacity="0.14"
                pointerEvents="none"
              />
              <rect
                x={tankLeftX + 38}
                y={tankTopY}
                width="7"
                height={tankHeight}
                fill="#ffffff"
                fillOpacity="0.08"
                pointerEvents="none"
              />
            </g>

            {/* --- 3. FOREGROUND MOLDED CIRCUMFERENTIAL RIBS --- */}
            {[120, 175, 230, 285, 340].map((ribY) => (
              <g key={`rib-fg-${ribY}`}>
                <line
                  x1={tankLeftX - 1.5}
                  y1={ribY}
                  x2={tankRightX + 1.5}
                  y2={ribY}
                  stroke="url(#ribSheenGrad)"
                  strokeWidth="4"
                  strokeOpacity="0.85"
                />
                <line
                  x1={tankLeftX}
                  y1={ribY + 2}
                  x2={tankRightX}
                  y2={ribY + 2}
                  stroke="#000000"
                  strokeWidth="1.2"
                  strokeOpacity="0.4"
                />
              </g>
            ))}

            {/* --- 4. GRADUATED MEASUREMENT SCALE & SIGHT RULER --- */}
            <g id="graduatedRuler">
              {/* Vertical Sight Glass Tube on Left */}
              <rect
                x={tankLeftX - 14}
                y={tankTopY + 8}
                width="9"
                height={tankHeight - 16}
                rx="4"
                fill="#0f172a"
                stroke="#475569"
                strokeWidth="1.5"
              />
              {/* Sight Tube Water Column */}
              {hasValidWater && liquidHeight > 0 && (
                <rect
                  x={tankLeftX - 12}
                  y={surfaceY}
                  width="5"
                  height={tankBottomY - surfaceY - 4}
                  rx="2.5"
                  fill={liquidTheme.gradTop}
                  opacity="0.95"
                />
              )}

              {/* Physical Graduated Level Marks with Real Calculated Liters */}
              {[
                { pct: 100, y: tankTopY, label: `${tankConfig.tankCapacityLiters}L`, isMajor: true },
                { pct: 75, y: y750, label: `${Math.round(tankConfig.tankCapacityLiters * 0.75)}L`, isMajor: false },
                { pct: 50, y: y500, label: `${Math.round(tankConfig.tankCapacityLiters * 0.5)}L`, isMajor: true },
                { pct: 25, y: y250, label: `${Math.round(tankConfig.tankCapacityLiters * 0.25)}L`, isMajor: false },
                { pct: 0, y: tankBottomY, label: '0L', isMajor: true },
              ].map((tick) => (
                <g key={`ruler-${tick.pct}`}>
                  <line
                    x1={tankLeftX - 22}
                    y1={tick.y}
                    x2={tankLeftX - 16}
                    y2={tick.y}
                    stroke="#94a3b8"
                    strokeWidth={tick.isMajor ? 2 : 1.2}
                  />
                  <text
                    x={tankLeftX - 25}
                    y={tick.y + 3}
                    fontSize={tick.isMajor ? "9" : "8"}
                    textAnchor="end"
                    fill={tick.pct === 100 ? "#38bdf8" : "#94a3b8"}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Critical Full 98.9% Safety Warning Line */}
              <line
                x1={tankLeftX}
                y1={y989}
                x2={tankRightX}
                y2={y989}
                stroke="#e11d48"
                strokeWidth="2"
                strokeDasharray="4 3"
                opacity="0.9"
              />
              <rect x={tankRightX + 4} y={y989 - 7} width="44" height="14" rx="3" fill="#e11d48" />
              <text x={tankRightX + 26} y={y989 + 3} fontSize="8" textAnchor="middle" fill="#ffffff" fontFamily="monospace" fontWeight="900">
                FULL 99%
              </text>

              {/* High Water 90% Warning Line */}
              <line
                x1={tankLeftX}
                y1={y900}
                x2={tankRightX}
                y2={y900}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.8"
              />
              <rect x={tankRightX + 4} y={y900 - 7} width="40" height="14" rx="3" fill="#f59e0b" />
              <text x={tankRightX + 24} y={y900 + 3} fontSize="8" textAnchor="middle" fill="#ffffff" fontFamily="monospace" fontWeight="bold">
                HIGH 90%
              </text>
            </g>

            {/* --- 5. TANK BASE PEDESTAL & DRAIN VALVE TAP --- */}
            {/* Heavy-Duty Base Pedestal */}
            <rect
              x={tankLeftX - 10}
              y={tankBottomY}
              width={tankWidth + 20}
              height="16"
              rx="4"
              fill="url(#ribSheenGrad)"
              stroke="#0f172a"
              strokeWidth="2"
            />
            {/* Anchor Bolts */}
            <circle cx={tankLeftX + 10} cy={tankBottomY + 8} r="3" fill="#64748b" stroke="#1e293b" />
            <circle cx={tankRightX - 10} cy={tankBottomY + 8} r="3" fill="#64748b" stroke="#1e293b" />

            {/* Bottom Drain Pipe & Brass Ball Valve */}
            <path
              d={`M ${tankRightX - 28} ${tankBottomY} L ${tankRightX - 28} ${tankBottomY + 24} L ${tankRightX + 16} ${tankBottomY + 24}`}
              stroke="#475569"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
            {/* Brass Valve Body & Yellow Quarter-Turn Handle */}
            <rect x={tankRightX + 4} y={tankBottomY + 14} width="16" height="6" rx="2" fill="#eab308" stroke="#a16207" strokeWidth="1" />
            <circle cx={tankRightX + 12} cy={tankBottomY + 24} r="5" fill="#ca8a04" />
          </svg>

          {/* Floating Center Digital Readout Glass HUD */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
            <div className="rounded-3xl bg-slate-950/85 p-4 sm:p-5 text-center shadow-2xl backdrop-blur-md border border-white/10 text-white transform active:scale-95 transition-all max-w-[220px]">
              {isSensorUnavailable ? (
                <div>
                  <div className="text-3xl font-black font-mono text-rose-400 leading-none">
                    —
                  </div>
                  <div className="text-xs font-bold text-rose-300 mt-1">
                    {t.sensorUnavailable}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                    Check HC-SR04 connection
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl sm:text-4xl font-black tracking-tight font-mono tabular-nums leading-none">
                    {waterPercent.toFixed(1)}%
                  </div>

                  {currentLiters !== null && (
                    <div className="text-xs font-bold text-cyan-300 font-mono mt-1.5 flex items-center justify-center gap-1">
                      <span>{displayLiters(currentLiters)} {unitLabel}</span>
                      <span className="text-slate-400 font-normal">/</span>
                      <span className="text-slate-300 font-medium">
                        {capacityUnit === 'gal' ? (tankConfig.tankCapacityLiters * 0.264172).toFixed(0) : tankConfig.tankCapacityLiters} {unitLabel}
                      </span>
                    </div>
                  )}

                  {freeLiters !== null && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {displayLiters(freeLiters)} {unitLabel} free space
                    </div>
                  )}

                  {isStale ? (
                    <div className="text-[9px] text-amber-400 uppercase tracking-wider font-bold mt-1.5 animate-pulse">
                      Stale (Awaiting Link)
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mt-1.5 flex items-center justify-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>{t.arduinoCalculated}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- QUICK TANK CAPACITY CONTROLS & WATER USAGE CALCULATOR --- */}
      <div className="w-full mt-2 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5 text-cyan-500" />
              <span>{t.tankCapacity}:</span>
              <strong className="text-cyan-600 dark:text-cyan-400 font-mono">
                {tankConfig.tankCapacityLiters} {t.litersUnit}
              </strong>
            </span>
            {/* Unit Toggle (Liters vs Gallons) */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-800/80 text-[10px] font-bold">
              <button
                onClick={() => setCapacityUnit('L')}
                className={`px-1.5 py-0.5 rounded-md transition-colors ${
                  capacityUnit === 'L' ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs' : 'text-slate-500'
                }`}
              >
                L
              </button>
              <button
                onClick={() => setCapacityUnit('gal')}
                className={`px-1.5 py-0.5 rounded-md transition-colors ${
                  capacityUnit === 'gal' ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs' : 'text-slate-500'
                }`}
              >
                gal
              </button>
            </div>
          </div>

          <button
            onClick={() => setIsEditingCapacity(!isEditingCapacity)}
            className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 active:scale-95"
          >
            <Edit3 className="h-3 w-3" />
            <span>{isEditingCapacity ? t.close : 'Change Capacity'}</span>
          </button>
        </div>

        {/* Quick Capacity Presets */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {[300, 500, 750, 1000, 1500, 2000, 5000].map((preset) => (
            <button
              key={preset}
              onClick={() => handleSelectCapacity(preset)}
              className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all active:scale-95 ${
                tankConfig.tankCapacityLiters === preset
                  ? 'bg-cyan-600 text-white shadow-sm ring-2 ring-cyan-500/40'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {preset}L
            </button>
          ))}
        </div>

        {/* Inline Custom Capacity Form */}
        {isEditingCapacity && (
          <form
            onSubmit={handleCustomCapacitySubmit}
            className="flex items-center gap-2 pt-2 animate-fade-in"
          >
            <div className="relative flex-1">
              <input
                type="number"
                min="10"
                max="100000"
                value={customCapacityInput}
                onChange={(e) => setCustomCapacityInput(e.target.value)}
                placeholder="Enter tank capacity..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                {unitLabel}
              </span>
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Apply</span>
            </button>
          </form>
        )}
      </div>

      {/* --- LIVE USAGE TRACKING & BUZZER SNAPSHOT ROW --- */}
      <div className="w-full mt-3 grid grid-cols-2 gap-2 text-center text-xs">
        {/* Tracked Usage Snapshot */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5 border border-slate-200/60 dark:border-slate-800/60">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
            {t.estUsageTodayTitle}
          </span>
          <span className="font-bold font-mono text-xs text-cyan-600 dark:text-cyan-400">
            {displayLiters(todayUsage)} {unitLabel} tracked
          </span>
          {todayRefills > 0 && (
            <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block font-mono">
              +{displayLiters(todayRefills)} {unitLabel} refilled
            </span>
          )}
        </div>

        {/* Safety Buzzer State */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5 border border-slate-200/60 dark:border-slate-800/60">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
            {t.buzzerTitle}
          </span>
          <span
            className={`font-bold font-mono text-xs inline-flex items-center justify-center gap-1 ${
              isContinuousBuzzer
                ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                : isBuzzerActive
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {isBuzzerActive && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />}
            {hasData
              ? isContinuousBuzzer
                ? 'CONTINUOUS (≥98.9%)'
                : isBuzzerActive
                ? t.buzzerSounding
                : t.buzzerSilent
              : t.statusOffline}
          </span>
          <span className="text-[9px] text-slate-400 block font-medium">
            {isContinuousBuzzer ? 'Cutoff active' : 'Normal monitoring'}
          </span>
        </div>
      </div>
    </div>
  );
};
