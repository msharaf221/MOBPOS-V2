import React, { useState, useMemo } from 'react';
import {
  Search,
  Camera,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Check,
  User,
  Wallet,
  CreditCard,
  Smartphone,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  AlertCircle,
  Tag,
  Share2,
} from 'lucide-react';
import type { BranchConfig, BranchMetrics, InventoryItem, Customer, Safe, SaleRecord, SaleItem } from '../types';
import { formatCurrency, formatNumber } from '../utils/format';
import { playBeep, playCashRegister, triggerHaptic } from '../utils/sound';
import { CameraScannerModal } from './CameraScannerModal';
import { multiBranchManager } from '../services/MultiBranchManager';

interface POSTabProps {
  metrics: BranchMetrics;
  branches: BranchConfig[];
  selectedBranchId: string;
  hideAmounts: boolean;
  onSaleComplete: (sale: SaleRecord) => void;
  onOpenSettings: () => void;
}

interface CartEntry {
  item: InventoryItem;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  selectedImei?: string;
}

export const POSTab: React.FC<POSTabProps> = ({
  metrics,
  branches,
  selectedBranchId,
  hideAmounts,
  onSaleComplete,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Checkout form state
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'card' | 'debt'>('cash');
  const [selectedSafeId, setSelectedSafeId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customCustomerName, setCustomCustomerName] = useState<string>('');
  const [customCustomerPhone, setCustomCustomerPhone] = useState<string>('');
  const [paidInput, setPaidInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // IMEI selection modal state
  const [imeiModalItem, setImeiModalItem] = useState<InventoryItem | null>(null);
  const [manualImeiInput, setManualImeiInput] = useState('');

  // Active Branch
  const activeBranch = useMemo(() => {
    if (selectedBranchId !== 'all') {
      return branches.find(b => b.id === selectedBranchId) || branches[0] || null;
    }
    return branches.find(b => b.enabled) || branches[0] || null;
  }, [branches, selectedBranchId]);

  // Categories list derived from inventory
  const categories = useMemo(() => {
    const set = new Set<string>();
    metrics.inventoryList.forEach(it => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  }, [metrics.inventoryList]);

  // Filtered inventory list
  const filteredProducts = useMemo(() => {
    return metrics.inventoryList.filter(item => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = item.name.toLowerCase().includes(q);
      const matchBarcode = (item.barcode || '').toLowerCase().includes(q);
      const matchCat = (item.category || '').toLowerCase().includes(q);
      return matchName || matchBarcode || matchCat;
    });
  }, [metrics.inventoryList, selectedCategory, searchQuery]);

  // Totals calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, entry) => acc + entry.quantity * entry.unitPrice, 0);
  }, [cart]);

  const cartFinalTotal = useMemo(() => {
    return Math.max(0, cartSubtotal - (Number(discountAmount) || 0));
  }, [cartSubtotal, discountAmount]);

  const effectivePaidAmount = useMemo(() => {
    if (paymentMethod === 'debt') return 0;
    if (paidInput !== '') return Number(paidInput) || 0;
    return cartFinalTotal;
  }, [paymentMethod, paidInput, cartFinalTotal]);

  const remainingDebtAmount = useMemo(() => {
    return Math.max(0, cartFinalTotal - effectivePaidAmount);
  }, [cartFinalTotal, effectivePaidAmount]);

  // Add Item to Cart
  const handleAddToCart = (item: InventoryItem) => {
    if ((item.quantity || 0) <= 0) {
      triggerHaptic('warning');
      alert(`المنتج "${item.name}" غير متوفر في رصيد المخزن حالياً`);
      return;
    }

    if (item.hasImei) {
      setImeiModalItem(item);
      setManualImeiInput('');
      return;
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(entry => entry.item.id === item.id);
      if (existingIdx >= 0) {
        const next = [...prev];
        const nextQty = next[existingIdx].quantity + 1;
        if (nextQty > (item.quantity || 1)) {
          triggerHaptic('warning');
          alert(`الرصيد المتاح من (${item.name}) هو ${item.quantity} فقط`);
          return prev;
        }
        next[existingIdx] = { ...next[existingIdx], quantity: nextQty };
        return next;
      } else {
        return [
          ...prev,
          {
            item,
            quantity: 1,
            unitPrice: item.sellPrice || 0,
            costPrice: item.costPrice || 0,
          },
        ];
      }
    });

    playBeep();
    triggerHaptic('light');
  };

  const handleConfirmImei = (imei: string) => {
    if (!imeiModalItem) return;
    setCart(prev => [
      ...prev,
      {
        item: imeiModalItem,
        quantity: 1,
        unitPrice: imeiModalItem.sellPrice || 0,
        costPrice: imeiModalItem.costPrice || 0,
        selectedImei: imei.trim(),
      },
    ]);
    setImeiModalItem(null);
    setManualImeiInput('');
    playBeep();
    triggerHaptic('medium');
  };

  const handleUpdateQty = (index: number, delta: number) => {
    setCart(prev => {
      const entry = prev[index];
      if (!entry) return prev;
      const newQty = entry.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      if (newQty > (entry.item.quantity || 1) && !entry.selectedImei) {
        triggerHaptic('warning');
        alert(`أقصى كمية متاحة في المخزن هي ${entry.item.quantity}`);
        return prev;
      }
      const next = [...prev];
      next[index] = { ...entry, quantity: newQty };
      return next;
    });
    triggerHaptic('light');
  };

  const handleRemoveEntry = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
    triggerHaptic('medium');
  };

  // Barcode scanned callback
  const handleBarcodeScan = (scannedCode: string) => {
    const clean = scannedCode.trim().toLowerCase();
    const found = metrics.inventoryList.find(
      it => (it.barcode || '').toLowerCase() === clean || it.name.toLowerCase().includes(clean)
    );

    if (found) {
      handleAddToCart(found);
    } else {
      setSearchQuery(scannedCode);
      triggerHaptic('warning');
    }
  };

  // Submit and finalize the sale
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!activeBranch) {
      alert('يرجى تحديد فرع أو إضافة فرع أولاً من الإعدادات');
      return;
    }

    if (!activeBranch.supabaseUrl || !activeBranch.supabaseAnonKey) {
      alert('هذا الفرع غير مربوط بـ Supabase. يرجى إدخال الرابط والمفتاح في الإعدادات.');
      onOpenSettings();
      return;
    }

    setIsCheckingOut(true);
    setStatusMessage(null);

    try {
      // Find Safe
      const chosenSafe = selectedSafeId
        ? metrics.safesList.find(s => s.id === selectedSafeId)
        : metrics.safesList[0];

      // Find or build Customer
      const chosenCustomer = selectedCustomerId
        ? metrics.customersList.find(c => c.id === selectedCustomerId)
        : null;

      const customerName = chosenCustomer?.name || customCustomerName.trim() || 'عميل نقدي';
      const customerPhone = chosenCustomer?.phone || customCustomerPhone.trim() || '';

      const now = new Date();
      const invoiceNumber = `INV-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      let paymentLabel = 'نقدي (كاش)';
      if (paymentMethod === 'instapay') paymentLabel = 'إنستاباي / محفظة';
      else if (paymentMethod === 'card') paymentLabel = 'بطاقة / فيزا';
      else if (paymentMethod === 'debt') paymentLabel = 'آجل / تقسيط';

      const saleItems: SaleItem[] = cart.map((c, idx) => ({
        id: `sale_item_${Date.now()}_${idx}`,
        inventoryId: c.item.id,
        name: c.item.name,
        quantity: c.quantity,
        price: c.unitPrice,
        unitPrice: c.unitPrice,
        cost: c.costPrice || c.item.costPrice || 0,
        costPrice: c.costPrice || c.item.costPrice || 0,
        total: Number(c.unitPrice * c.quantity),
        returnedQuantity: 0,
        imei: c.selectedImei,
      }));

      const totalCost = cart.reduce((acc, c) => {
        const itemCost = Number(c.costPrice || c.item.costPrice || 0);
        return acc + c.quantity * itemCost;
      }, 0);
      const profit = totalCost > 0 ? Math.max(0, cartFinalTotal - totalCost) : 0;

      const saleRecord: SaleRecord = {
        id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        invoiceNumber,
        date: now.toISOString(),
        createdAt: now.toISOString(),
        total: cartSubtotal,
        discount: discountAmount,
        finalTotal: cartFinalTotal,
        paidAmount: effectivePaidAmount,
        remainingAmount: remainingDebtAmount,
        profit,
        paymentMethod: paymentLabel,
        safeId: chosenSafe?.id,
        safeName: chosenSafe?.name || 'الخزينة الرئيسية',
        cashierName: 'كاشير الموبايل',
        customerId: chosenCustomer?.id,
        customerName,
        customerPhone,
        items: saleItems,
        branchId: activeBranch.id,
        branchName: activeBranch.name,
        branchColor: activeBranch.color,
      };

      const deductions = cart.map(c => ({
        item: c.item,
        quantity: c.quantity,
      }));

      const res = await multiBranchManager.submitSale(activeBranch, saleRecord, {
        safe: chosenSafe,
        deductions,
        customer: chosenCustomer || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || 'تعذر إتمام الفاتورة');
      }

      playCashRegister();
      triggerHaptic('success');
      setCart([]);
      setIsCartOpen(false);
      setDiscountAmount(0);
      setPaidInput('');
      setCustomCustomerName('');
      setCustomCustomerPhone('');

      onSaleComplete(saleRecord);
    } catch (err: any) {
      console.error('[POSTab] Checkout error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء حفظ الفاتورة على السحابة',
      });
      triggerHaptic('warning');
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="space-y-3 pb-32 animate-in fade-in duration-200">
      {/* Top POS Action & Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث عن موبايل، إكسسوار، أو امسح الباركود..."
            className="w-full pr-10 pl-9 py-3 rounded-2xl bg-slate-900/90 border border-white/[0.08] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 font-sans shadow-lg transition"
          />
          <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Camera Barcode Scanner Button */}
        <button
          type="button"
          onClick={() => setIsScannerOpen(true)}
          className="p-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/25 active:scale-95 transition flex items-center justify-center shrink-0"
          title="مسح بالكاميرا"
        >
          <Camera size={19} />
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition active:scale-95 text-xs ${
            selectedCategory === 'all'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'bg-slate-900/80 border border-white/[0.06] text-slate-400 hover:text-white'
          }`}
        >
          جميع الأصناف ({metrics.inventoryList.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition active:scale-95 text-xs ${
              selectedCategory === cat
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'bg-slate-900/80 border border-white/[0.06] text-slate-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Active Branch Ticker */}
      {activeBranch && (
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeBranch.color }} />
            <span>نقطة البيع: <strong className="text-white">{activeBranch.name}</strong></span>
          </span>
          <span className="text-[10px] text-cyan-400 font-mono">
            المتاح: {filteredProducts.length} صنف
          </span>
        </div>
      )}

      {/* Product Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {filteredProducts.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-slate-500 text-xs space-y-2 glass-panel rounded-3xl p-6">
            <AlertCircle size={28} className="mx-auto text-slate-600" />
            <p className="font-bold text-slate-400">لا توجد منتجات مطابقة للبحث</p>
            <p className="text-[11px] text-slate-500">تأكد من تهيئة المخزن في شاشة الكاشير ورفع لقطة سحابية</p>
          </div>
        ) : (
          filteredProducts.map(product => {
            const inStock = (product.quantity || 0) > 0;
            const isLow = (product.quantity || 0) <= (product.minQuantity || 2);
            const inCartEntry = cart.find(c => c.item.id === product.id);

            return (
              <div
                key={product.id}
                onClick={() => handleAddToCart(product)}
                className={`p-3 rounded-2xl border transition-all duration-150 flex flex-col justify-between cursor-pointer active:scale-97 select-none relative overflow-hidden ${
                  inCartEntry
                    ? 'bg-slate-900 border-cyan-500/50 shadow-md shadow-cyan-500/15'
                    : 'bg-slate-900/85 hover:bg-slate-850 border-white/[0.07]'
                } ${!inStock ? 'opacity-50 grayscale' : ''}`}
              >
                {/* Cart badge indicator if already in cart */}
                {inCartEntry && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-cyan-500 text-slate-950 font-black text-[10px] font-mono shadow">
                    ×{inCartEntry.quantity}
                  </span>
                )}

                <div className="space-y-1">
                  <div className="text-[10px] text-cyan-400 font-bold truncate">
                    {product.category || 'عام'}
                  </div>
                  <h4 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                    {product.name}
                  </h4>
                </div>

                <div className="pt-2.5 mt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-white font-mono block">
                      {formatCurrency(product.sellPrice, hideAmounts)}
                    </span>
                    <span className={`text-[10px] font-bold ${!inStock ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-400'}`}>
                      {!inStock ? 'نفد' : `المتبقي: ${product.quantity}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={!inStock}
                    className="w-7 h-7 rounded-xl bg-cyan-500/20 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 flex items-center justify-center transition shrink-0 active:scale-90"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-3 pointer-events-none animate-in slide-in-from-bottom-3 duration-300">
          <div className="max-w-md mx-auto pointer-events-auto">
            <div
              onClick={() => setIsCartOpen(true)}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950/90 to-slate-900 border border-cyan-500/40 shadow-2xl backdrop-blur-xl flex items-center justify-between cursor-pointer active:scale-[0.985] transition"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-cyan-500/30">
                    <ShoppingCart size={20} />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center font-mono shadow">
                    {cart.reduce((a, b) => a + b.quantity, 0)}
                  </span>
                </div>

                <div>
                  <div className="text-[11px] text-slate-300 font-bold">سلة المبيعات</div>
                  <div className="text-sm font-black text-white font-mono">
                    {formatCurrency(cartFinalTotal, hideAmounts)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs shadow-md">
                <span>إتمام الفاتورة</span>
                <ChevronUp size={16} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart & Checkout Bottom Sheet Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border-t border-slate-750 rounded-t-[32px] p-5 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl animate-in slide-in-from-bottom-6 duration-300 text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <ShoppingCart size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">إتمام فاتورة البيع</h3>
                  <span className="text-[10px] text-slate-400">{cart.length} أصناف في الفاتورة</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {statusMessage && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                statusMessage.type === 'error' ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}>
                <AlertCircle size={15} />
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Cart Items List */}
            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar pr-0.5">
              {cart.map((entry, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-slate-950/70 border border-white/[0.06] flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-white text-xs truncate">{entry.item.name}</h5>
                    {entry.selectedImei && (
                      <span className="text-[10px] text-cyan-400 font-mono block">
                        سيريال: {entry.selectedImei}
                      </span>
                    )}
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatCurrency(entry.unitPrice, hideAmounts)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 bg-slate-800/80 rounded-xl p-1 border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(idx, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center font-bold"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-black font-mono text-white text-xs">
                        {entry.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(idx, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center font-bold"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer Section */}
            <div className="space-y-2 pt-2 border-t border-white/[0.08]">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <User size={13} className="text-cyan-400" />
                <span>بيانات العميل (اختياري):</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customCustomerName}
                  onChange={e => setCustomCustomerName(e.target.value)}
                  placeholder="اسم العميل..."
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="tel"
                  value={customCustomerPhone}
                  onChange={e => setCustomCustomerPhone(e.target.value)}
                  placeholder="رقم الهاتف..."
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono text-left"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-300">طريقة الدفع:</label>
              <div className="grid grid-cols-4 gap-1.5 text-xs">
                {[
                  { id: 'cash' as const, label: 'كاش 💵' },
                  { id: 'instapay' as const, label: 'إنستاباي 📱' },
                  { id: 'card' as const, label: 'فيزا 💳' },
                  { id: 'debt' as const, label: 'آجل ⏳' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(p.id);
                      triggerHaptic('light');
                    }}
                    className={`py-2 rounded-xl font-bold transition text-center active:scale-95 text-[11px] ${
                      paymentMethod === p.id
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                        : 'bg-slate-950 border border-white/[0.08] text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Safe Selector & Discount Input */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">الخزينة المستلمة:</label>
                <select
                  value={selectedSafeId}
                  onChange={e => setSelectedSafeId(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  {metrics.safesList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatCurrency(s.balance, hideAmounts)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">الخصم (ج.م):</label>
                <input
                  type="number"
                  min="0"
                  value={discountAmount || ''}
                  onChange={e => setDiscountAmount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-400 font-mono text-center font-bold"
                />
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/[0.08] space-y-1.5 font-mono">
              <div className="flex justify-between text-slate-400 text-xs">
                <span>المجموع الفرعي:</span>
                <span>{formatCurrency(cartSubtotal, hideAmounts)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-rose-400 text-xs font-bold">
                  <span>الخصم الممنوح:</span>
                  <span>- {formatCurrency(discountAmount, hideAmounts)}</span>
                </div>
              )}
              <div className="flex justify-between text-white font-black text-sm pt-1 border-t border-white/[0.08]">
                <span>صافي الفاتورة:</span>
                <span className="text-cyan-400 text-base">{formatCurrency(cartFinalTotal, hideAmounts)}</span>
              </div>
              {paymentMethod === 'debt' && (
                <div className="flex justify-between text-rose-300 text-xs pt-1">
                  <span>الرصيد الآجل على العميل:</span>
                  <span>{formatCurrency(remainingDebtAmount, hideAmounts)}</span>
                </div>
              )}
            </div>

            {/* Checkout Action Button */}
            <button
              type="button"
              disabled={isCheckingOut}
              onClick={handleCheckout}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:opacity-95 disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 active:scale-[0.985] transition flex items-center justify-center gap-2"
            >
              <Sparkles size={18} />
              <span>{isCheckingOut ? 'جارٍ تسجيل الفاتورة في السحابة...' : `تأكيد ودفع ${formatCurrency(cartFinalTotal, hideAmounts)}`}</span>
            </button>
          </div>
        </div>
      )}

      {/* IMEI Unit Selection Modal */}
      {imeiModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div>
                <h4 className="text-xs font-bold text-white">اختر سيريال الجهاز (IMEI)</h4>
                <p className="text-[10px] text-cyan-400 truncate">{imeiModalItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setImeiModalItem(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (manualImeiInput.trim()) {
                  handleConfirmImei(manualImeiInput);
                }
              }}
              className="space-y-3"
            >
              <input
                type="text"
                autoFocus
                value={manualImeiInput}
                onChange={e => setManualImeiInput(e.target.value)}
                placeholder="اكتب أو الصق رقم IMEI هنا (15 رقم)..."
                className="w-full px-3 py-3 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white font-mono text-center tracking-widest focus:outline-none focus:border-cyan-400"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!manualImeiInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition active:scale-95"
                >
                  إضافة للسلة
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImei('بدون سيريال')}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  تخطي السيريال
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScan}
      />
    </div>
  );
};
