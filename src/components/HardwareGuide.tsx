import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CheckSquare,
  Cpu,
  Download,
  ExternalLink,
  FileCode,
  Layers,
  Radio,
  ShieldCheck,
  Square,
  Zap,
} from 'lucide-react';
import { ARDUINO_FIRMWARE_SOURCE } from '../firmware/arduinoSketch';

export const HardwareGuide: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    step1: false,
    step2: false,
    step3: false,
    step4: false,
    step5: false,
    step6: false,
    step7: false,
  });

  const handleCopySketch = () => {
    navigator.clipboard.writeText(ARDUINO_FIRMWARE_SOURCE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSketch = () => {
    const blob = new Blob([ARDUINO_FIRMWARE_SOURCE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HydroSense_Firmware.ino';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCheck = (id: string) => {
    setChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-6">
      
      {/* Wiring Schematic & Pinout Table Card */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Hardware Wiring & Circuit Schematic
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pin connections for Arduino Uno, Nano, or Mega with HC-SR04, Buzzer, and HC-05 Bluetooth
            </p>
          </div>
        </div>

        {/* Pin Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Hardware Module</th>
                <th className="px-4 py-3">Module Pin</th>
                <th className="px-4 py-3">Arduino Pin</th>
                <th className="px-4 py-3">Voltage / Electrical Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">HC-SR04 Ultrasonic</td>
                <td className="px-4 py-3">VCC / GND</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">5V / GND</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">Power supply rail (&gt;15mA)</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">HC-SR04 Ultrasonic</td>
                <td className="px-4 py-3">TRIG</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">Pin 9</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">10μs trigger pulse</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">HC-SR04 Ultrasonic</td>
                <td className="px-4 py-3">ECHO</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">Pin 10</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">Echo pulse duration input</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">HC-05 Bluetooth</td>
                <td className="px-4 py-3">TXD (Transmit)</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">Pin 2 (RX)</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">SoftwareSerial RX at 9600 baud</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">HC-05 Bluetooth</td>
                <td className="px-4 py-3">RXD (Receive)</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">Pin 3 (TX)</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">Use 1kΩ / 2kΩ divider: Arduino 5V to 3.3V</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">Active Alarm Buzzer</td>
                <td className="px-4 py-3">Positive (+)</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">Pin 8</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">Sounds on cutoff overflow or sensor fault</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">Status Heartbeat LED</td>
                <td className="px-4 py-3">Built-in LED</td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400">Pin 13</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-sans">Toggles every 1,000ms telemetry cycle</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Hardware Testing Checklist */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-800 dark:text-emerald-400" />
              Hardware Bench Testing Checklist
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Complete each verification step on your physical workbench before field deployment
            </p>
          </div>
          <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
            {completedCount} / 7 Verified
          </div>
        </div>

        <div className="space-y-3">
          {[
            {
              id: 'step1',
              title: '1. Power Rail Stability Check',
              desc: 'Confirm Arduino 5V and GND rails are stable. Ensure HC-SR04 ultrasonic sensor and HC-05 modules receive steady 5V power.',
            },
            {
              id: 'step2',
              title: '2. HC-SR04 Sensor Echo Calibration',
              desc: 'Move an object in front of HC-SR04 sensor from 5cm to 50cm. Verify sensor distance reading updates accurately and does not report SENSOR_TIMEOUT.',
            },
            {
              id: 'step3',
              title: '3. Step 1 Empty Calibration (CAL_EMPTY)',
              desc: 'With the tank empty, trigger Empty Calibration in Settings. Confirm Arduino sends ACK:CAL_EMPTY:OK and persists the empty distance to EEPROM.',
            },
            {
              id: 'step4',
              title: '4. Step 2 Full Calibration (CAL_FULL)',
              desc: 'Fill the tank with water and tap Set Full Level. Verify Arduino sends ACK:CAL_FULL:OK, recalculates water percentage, and stores the full reference.',
            },
            {
              id: 'step5',
              title: '5. High-Water Buzzer Safety Alarm',
              desc: 'Bring water level >= Cutoff (or bring target object close to sensor). Confirm that the Arduino firmware sounds the active buzzer alarm immediately.',
            },
            {
              id: 'step6',
              title: '6. HC-05 Bluetooth Pairing & Voltage Divider',
              desc: 'Verify HC-05 LED blinks slowly after pairing. Ensure 1k/2k resistor voltage divider is present on HC-05 RXD pin to protect 3.3V logic.',
            },
            {
              id: 'step7',
              title: '7. USB Web Serial 9600 Baud Protocol Framing',
              desc: 'Connect desktop web browser to Arduino COM port. Verify STATUS packets arrive every 1,000ms with intact key=value formatting.',
            },
          ].map((item) => (
            <div
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                checklist[item.id]
                  ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/50'
              }`}
            >
              <div className="mt-0.5 shrink-0 text-emerald-800 dark:text-emerald-400">
                {checklist[item.id] ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4 text-slate-400" />
                )}
              </div>
              <div>
                <span className={`text-xs font-bold block ${checklist[item.id] ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-900 dark:text-white'}`}>
                  {item.title}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Arduino Sketch Viewer & Downloader */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800/80 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCode className="h-4 w-4 text-cyan-500" />
              HydroSense_Firmware.ino (Arduino C++)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pure water-level telemetry, buzzer alarm, and EEPROM calibration (9600 baud)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySketch}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <FileCode className="h-3.5 w-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadSketch}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download .ino</span>
            </button>
          </div>
        </div>

        <div className="relative rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-[460px] border border-slate-800 shadow-inner">
          <pre className="leading-relaxed">
            <code>{ARDUINO_FIRMWARE_SOURCE}</code>
          </pre>
        </div>
      </div>

    </div>
  );
};
