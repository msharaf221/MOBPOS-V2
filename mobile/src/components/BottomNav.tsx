import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  WalletCards,
  PackageSearch,
  Zap,
} from 'lucide-react';
import { triggerHaptic } from '../utils/sound';

export type NavTab = 'dashboard' | 'pos' | 'sales' | 'safes' | 'inventory' | 'settings';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  pendingLowStockCount?: number;
  activeMaintenanceCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  pendingLowStockCount = 0,
}) => {
  const tabs = [
    { id: 'dashboard' as NavTab, label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'sales' as NavTab, label: 'الفواتير', icon: ReceiptText },
    { id: 'pos' as NavTab, label: 'كاشير ⚡', icon: Zap, isCenter: true },
    { id: 'safes' as NavTab, label: 'الخزائن', icon: WalletCards },
    {
      id: 'inventory' as NavTab,
      label: 'المخزون',
      icon: PackageSearch,
      badge: pendingLowStockCount > 0 ? pendingLowStockCount : undefined,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 safe-bottom pointer-events-none">
      <nav className="max-w-md mx-auto bg-slate-900/90 backdrop-blur-2xl border border-white/[0.09] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.9)] rounded-[28px] p-1.5 pointer-events-auto">
        <div className="grid grid-cols-5 gap-1 items-center">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            if (tab.isCenter) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onTabChange(tab.id);
                    triggerHaptic('medium');
                  }}
                  className="relative flex flex-col items-center justify-center -mt-5 py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 group focus:outline-none"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black transition-all ${
                    isActive
                      ? 'bg-gradient-to-tr from-cyan-400 via-sky-300 to-emerald-300 text-slate-950 shadow-[0_0_24px_rgba(6,182,212,0.8)] scale-105 border-2 border-white'
                      : 'bg-gradient-to-tr from-cyan-500 via-sky-400 to-emerald-400 text-slate-950 shadow-[0_8px_20px_rgba(6,182,212,0.45)] border-2 border-slate-900'
                  }`}>
                    <Zap size={22} className="fill-slate-950 text-slate-950 animate-pulse" />
                  </div>
                  <span className="text-[10px] font-black text-cyan-300 mt-1 tracking-tight">
                    {tab.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onTabChange(tab.id);
                  triggerHaptic('light');
                }}
                className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'text-cyan-400 font-bold bg-white/[0.06] shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon
                    size={20}
                    className={`transition-all duration-200 ${
                      isActive ? 'scale-110 stroke-[2.4] text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'stroke-[1.8]'
                    }`}
                  />
                  {tab.badge && (
                    <span className="absolute -top-1 -right-2 px-1.5 min-w-[16px] h-[16px] rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow-lg shadow-rose-500/50 animate-pulse font-mono">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] mt-1 tracking-tight leading-none ${isActive ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute -bottom-1 w-5 h-1 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
