import React from 'react';
import { Home, Sliders, Droplets, Settings } from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { ActiveNavTab } from '../types';

interface BottomNavBarProps {
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
  lang: Language;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  setActiveTab,
  lang,
}) => {
  const t = TRANSLATIONS[lang];

  // 4 Primary Navigation Sections required by HydroSense architecture:
  // HOME | CONTROL | USAGE | SETTINGS
  const tabs: Array<{
    id: ActiveNavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'home', label: t.navHome, icon: Home },
    { id: 'control', label: t.navControl, icon: Sliders },
    { id: 'usage', label: t.navUsage, icon: Droplets },
    { id: 'settings', label: t.navSettings, icon: Settings },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/90 bg-white/95 dark:border-slate-800/90 dark:bg-slate-950/95 backdrop-blur-2xl shadow-xl shadow-slate-900/10 select-none"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-15 sm:h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center h-full py-1 active:scale-95 transition-all touch-manipulation ${
                isActive
                  ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
              }`}
            >
              <div
                className={`relative p-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-600 dark:text-cyan-300 shadow-sm'
                    : 'bg-transparent text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.4]' : 'stroke-[1.8]'
                  }`}
                />
              </div>
              <span className="text-[11px] tracking-tight mt-0.5 truncate max-w-[76px] leading-tight font-semibold">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
