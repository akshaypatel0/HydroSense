import React from 'react';
import { Droplets, Settings, Smartphone, Waves, Wrench } from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { ActiveTab } from './TopBar';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lang: Language;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  setActiveTab,
  lang,
}) => {
  const t = TRANSLATIONS[lang];

  // Clean, focused 4-tab mobile navigation without unnecessary clutter
  const tabs: Array<{ id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'dashboard', label: t.navDashboard, icon: Waves },
    { id: 'usage', label: t.navUsage, icon: Droplets },
    { id: 'calibration', label: t.navCalibration, icon: Wrench },
    { id: 'hardware', label: 'APK & Setup', icon: Smartphone },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 dark:border-slate-800/80 dark:bg-slate-950/95 backdrop-blur-2xl shadow-lg shadow-black/10 select-none"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-14 sm:h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center h-full py-1.5 active:scale-95 transition-all touch-manipulation ${
                isActive
                  ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
              }`}
            >
              <div
                className={`relative p-1.5 rounded-xl transition-colors ${
                  isActive ? 'bg-cyan-50 dark:bg-cyan-950/60' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.4]' : 'stroke-[1.8]'
                  }`}
                />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[76px] leading-tight">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-6 h-0.5 rounded-full bg-cyan-600 dark:bg-cyan-400 shadow-sm shadow-cyan-500/50" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
