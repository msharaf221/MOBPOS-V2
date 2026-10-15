import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  WalletCards,
  PackageSearch,
  Store,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'sales' | 'safes' | 'inventory' | 'settings';

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
    { id: 'sales' as NavTab, label: 'المبيعات', icon: ReceiptText },
    { id: 'safes' as NavTab, label: 'الخزائن', icon: WalletCards },
    {
      id: 'inventory' as NavTab,
      label: 'المخزون',
      icon: PackageSearch,
      badge: pendingLowStockCount > 0 ? pendingLowStockCount : undefined,
    },
    { id: 'settings' as NavTab, label: 'الفروع', icon: Store },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-2xl border-t border-slate-800/80 safe-bottom">
      <div className="max-w-md mx-auto grid grid-cols-5 px-2 py-1.5">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-sky-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <div className="relative">
                <Icon
                  size={20}
                  className={`transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.4]' : 'stroke-[1.8]'
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[15px] h-[15px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 tracking-tight leading-tight ${isActive ? 'text-sky-400 font-bold' : 'text-slate-400'}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -bottom-0.5 w-6 h-1 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
