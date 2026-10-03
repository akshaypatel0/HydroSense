import React, { useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  Cable,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Layers,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Zap,
} from 'lucide-react';
import {
  ANDROID_MANIFEST_XML,
  BLUETOOTH_SERVICE_KT,
  BUILD_GRADLE_KTS,
  MAIN_ACTIVITY_KT,
} from '../android/androidAppSource';
import { ARDUINO_FIRMWARE_SOURCE } from '../firmware/arduinoSketch';

export const AndroidAppGuide: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<'manifest' | 'service' | 'activity' | 'gradle'>('service');
  const [copied, setCopied] = useState(false);
  const [copiedSketch, setCopiedSketch] = useState(false);

  const fileMap = {
    manifest: {
      name: 'AndroidManifest.xml',
      path: 'app/src/main/AndroidManifest.xml',
      content: ANDROID_MANIFEST_XML,
    },
    service: {
      name: 'BluetoothSPPService.kt',
      path: 'app/src/main/java/com/hydrosense/app/BluetoothSPPService.kt',
      content: BLUETOOTH_SERVICE_KT,
    },
    activity: {
      name: 'MainActivity.kt',
      path: 'app/src/main/java/com/hydrosense/app/MainActivity.kt',
      content: MAIN_ACTIVITY_KT,
    },
    gradle: {
      name: 'build.gradle.kts',
      path: 'app/build.gradle.kts',
      content: BUILD_GRADLE_KTS,
    },
  };

  const currentFile = fileMap[selectedFile];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadArduino = () => {
    const blob = new Blob([ARDUINO_FIRMWARE_SOURCE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HydroSense_Firmware.ino';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Overview & Dual Connectivity Architecture */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Native Android & Dual Connectivity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              HC-05 Bluetooth Classic SPP with Auto-Reconnect + USB OTG
            </p>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          {/* Card 1: Bluetooth Classic Auto-Reconnect */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <RefreshCw className="h-4 w-4 text-emerald-800 dark:text-emerald-400" />
              <span>Automatic Reconnection to HC-05</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              The native Android service saves the MAC address of your paired HC-05 in persistent storage. Upon app launch or after temporary link loss, it automatically connects silently without re-prompting or losing stream sync.
            </p>
            <div className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">
              UUID: 00001101-0000-1000-8000-00805F9B34FB (SPP)
            </div>
          </div>

          {/* Card 2: USB OTG on Android */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Cable className="h-4 w-4 text-blue-500" />
              <span>USB Serial & Android USB OTG</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Connect directly via USB cable on desktop browsers (Chrome, Edge) or on Android devices using a standard USB-C OTG adapter. The desktop and mobile app use the exact same 9600 baud packet parser.
            </p>
            <div className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">
              Baud: 9600 · 8 Data Bits · 1 Stop Bit · No Parity
            </div>
          </div>

        </div>

        {/* Pairing Instructions */}
        <div className="mt-4 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
          <span className="font-bold text-slate-900 dark:text-white block">
            HC-05 Pairing Instructions (PIN: 1234 or 0000)
          </span>
          <p className="text-[11px] leading-relaxed">
            1. Power your Arduino with the HC-05 connected. The red LED on HC-05 will flash rapidly.
            <br />
            2. In Android <strong>Settings &gt; Bluetooth</strong>, tap <em>Pair new device</em>, choose <code>HC-05</code>, and enter PIN <code>1234</code>.
            <br />
            3. Open HydroSense on Android. The app automatically claims the connection and shows confirmed live water telemetry!
          </p>
        </div>

        {/* GitHub Actions Offline APK Card */}
        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-tr from-cyan-950/60 to-slate-900 border border-cyan-500/30 text-xs text-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-cyan-400" />
              <span>Automated GitHub Actions APK Builder</span>
            </span>
            <span className="text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30">
              100% Offline Ready
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            The repository includes a ready-to-run GitHub Actions workflow (<code>.github/workflows/build-apk.yml</code>).
            When you push to GitHub, it automatically bundles the web app and compiles a standalone Android APK.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <strong className="text-cyan-400 block mb-0.5">1. Push to GitHub</strong>
              <span>Push to main or run manual workflow dispatch.</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <strong className="text-cyan-400 block mb-0.5">2. Actions Build</strong>
              <span>GitHub runner builds offline app & generates APK.</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <strong className="text-cyan-400 block mb-0.5">3. Download APK</strong>
              <span>Download APK artifact directly to your phone.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Code Inspector */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['service', 'activity', 'manifest', 'gradle'] as const).map((fileKey) => (
              <button
                key={fileKey}
                onClick={() => setSelectedFile(fileKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  selectedFile === fileKey
                    ? 'bg-slate-900 text-white dark:bg-cyan-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {fileMap[fileKey].name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
            <button
              onClick={handleDownloadFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-cyan-600 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-cyan-500 shadow-sm transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-400 mb-2">
          File: <strong className="text-slate-700 dark:text-slate-200">{currentFile.path}</strong>
        </div>

        <div className="rounded-2xl bg-slate-950 p-3.5 sm:p-4 font-mono text-xs text-slate-200 overflow-x-auto touch-scroll max-h-[440px] border border-slate-800 shadow-inner">
          <pre className="leading-relaxed">
            <code>{currentFile.content}</code>
          </pre>
        </div>
      </div>

      {/* Arduino Firmware Download Action */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-500" />
            HydroSense_Firmware.ino (Arduino C++)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Calibrated firmware v3.0.0 with authoritative logic and EEPROM persistence
          </p>
        </div>

        <button
          onClick={handleDownloadArduino}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-600 text-white font-bold text-xs hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-600/20 shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>Download Arduino Sketch</span>
        </button>
      </div>

    </div>
  );
};
