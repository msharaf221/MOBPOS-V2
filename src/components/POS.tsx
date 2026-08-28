import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote,
  Printer, User, X, Check, ShoppingBag, Calendar,
  Volume2, VolumeX, Sparkles, Clock, AlertCircle,
  HelpCircle, RotateCcw, PlusCircle, CheckCircle2,
  Barcode as BarcodeIcon
} from 'lucide-react';
import { Customer, InventoryItem, IMEIUnit, Safe, Category, SaleItem } from '../types';
import { printReceipt } from '../utils/print';
import { posSound } from '../utils/audio';

interface POSProps {
  inventory: InventoryItem[];
  imeiUnits: IMEIUnit[];
  customers: Customer[];
  categories: Category[];
  safes: Safe[];
  shopName: string;
  receiptFooter: string;
  onCreateSale: (
    customerId: string,
    items: Omit<SaleItem, 'id'>[],
    discount: number,
    paidAmount: number,
    paymentMethod: 'cash' | 'card' | 'installment',
    safeId: string,
    notes: string
  ) => { invoiceNumber: string };
  onAddCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'balance'>) => Customer;
  onAddInventoryItem?: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => InventoryItem;
}

export interface CartItem {
  inventoryId: string;
  imeiUnitId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  costPrice: number;
  total: number;
  hasIMEI: boolean;
  imei1?: string;
  maxStock: number;
}

interface ParkedSale {
  id: string;
  timestamp: string;
  cart: CartItem[];
  customer: Customer | null;
  discount: number;
  discountType: 'fixed' | 'percent';
  notes: string;
  total: number;
}

interface ScanToast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

interface ConfettiPiece {
  id: number;
  color: string;
  size: number;
  tx: number;
  ty: number;
  rot: number;
  delay: number;
}

export default function POS({
  inventory,
  imeiUnits,
  customers,
  categories,
  safes,
  shopName,
  receiptFooter,
  onCreateSale,
  onAddCustomer,
  onAddInventoryItem
}: POSProps) {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number | ''>('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'installment'>('cash');
  const [selectedSafe, setSelectedSafe] = useState(safes.find(s => s.isDefault)?.id || safes[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [cashReceived, setCashReceived] = useState<number | ''>('');
  const [activeMultiplier, setActiveMultiplier] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(posSound.isEnabled());

  // Highlighting & Visual cues
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ScanToast | null>(null);
  const [saleCelebration, setSaleCelebration] = useState<ConfettiPiece[] | null>(null);

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showIMEIModal, setShowIMEIModal] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showParkedModal, setShowParkedModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Modal context states
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [imeiSearch, setImeiSearch] = useState('');
  const [lastSale, setLastSale] = useState<{
    items: CartItem[];
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    remaining: number;
    change: number;
    paymentMethod: string;
    customer: Customer | null;
    invoiceNumber: string;
    date: string;
  } | null>(null);

  // Quick product modal form
  const [quickProduct, setQuickProduct] = useState({
    name: '',
    barcode: '',
    code: '',
    categoryId: categories[0]?.id || '',
    sellPrice: 0,
    costPrice: 0,
    quantity: 10
  });

  // Customer form inside modal
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });

  // Parked / Held invoices
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>(() => {
    try {
      const saved = localStorage.getItem('pos_parked_sales');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save parked sales
  useEffect(() => {
    try {
      localStorage.setItem('pos_parked_sales', JSON.stringify(parkedSales));
    } catch {
      // Ignore
    }
  }, [parkedSales]);

  // Refs
  const searchRef = useRef<HTMLInputElement>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Auto focus search on mount and when returning to window
  useEffect(() => {
    const focusSearch = () => {
      // Only focus if no modal is open and not focusing another input
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT';
      if (!isInput) {
        searchRef.current?.focus();
      }
    };
    focusSearch();
    window.addEventListener('focus', focusSearch);
    return () => window.removeEventListener('focus', focusSearch);
  }, []);

  // Update selected safe if safes change
  useEffect(() => {
    if (!selectedSafe && safes.length > 0) {
      setSelectedSafe(safes.find(s => s.isDefault)?.id || safes[0].id);
    }
  }, [safes, selectedSafe]);

  // Show toast message with auto-dismiss
  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev));
    }, 2800);
  }, []);

  // Get available IMEI units for a product
  const getAvailableIMEIs = useCallback((inventoryId: string) => {
    return imeiUnits.filter(
      unit => unit.inventoryId === inventoryId && unit.status === 'available'
    );
  }, [imeiUnits]);

  // Calculate actual stock for any item
  const getItemAvailableStock = useCallback((item: InventoryItem) => {
    if (item.hasIMEI) {
      return getAvailableIMEIs(item.id).length;
    }
    return item.quantity;
  }, [getAvailableIMEIs]);

  // Flash highlight an item in cart
  const triggerHighlight = useCallback((id: string) => {
    setHighlightedId(id);
    setTimeout(() => {
      setHighlightedId(prev => (prev === id ? null : prev));
    }, 1200);
  }, []);

  // Add item to cart with quantity
  const addToCart = useCallback((item: InventoryItem, imeiUnit?: IMEIUnit, requestedQty = 1) => {
    const qtyToAdd = Math.max(1, requestedQty);

    if (item.hasIMEI) {
      // If no IMEI unit specified, open IMEI picker
      if (!imeiUnit) {
        const availableUnits = getAvailableIMEIs(item.id);
        if (availableUnits.length === 0) {
          posSound.playError();
          showToast(`لا توجد أجهزة متاحة في المخزون من ${item.name}`, 'error');
          return;
        }
        if (availableUnits.length === 1) {
          // Auto add the single available unit directly!
          imeiUnit = availableUnits[0];
        } else {
          setSelectedInventoryItem(item);
          setImeiSearch('');
          setShowIMEIModal(true);
          return;
        }
      }

      // Check if this specific IMEI unit is already in cart
      const existing = cart.find(c => c.imeiUnitId === imeiUnit?.id);
      if (existing) {
        posSound.playError();
        showToast('هذا الجهاز (IMEI) موجود بالفعل في السلة', 'warning');
        triggerHighlight(existing.imeiUnitId || existing.inventoryId);
        return;
      }

      const newCartItem: CartItem = {
        inventoryId: item.id,
        imeiUnitId: imeiUnit.id,
        name: `${item.name} (${imeiUnit.color} - ${imeiUnit.storage})`,
        quantity: 1,
        unitPrice: item.sellPrice,
        originalPrice: item.sellPrice,
        costPrice: imeiUnit.purchasePrice || item.costPrice,
        total: item.sellPrice,
        hasIMEI: true,
        imei1: imeiUnit.imei1,
        maxStock: 1
      };

      setCart(prev => [newCartItem, ...prev]);
      posSound.playBeep();
      showToast(`تمت إضافة الجهاز: ${item.name} (${imeiUnit.imei1})`, 'success');
      triggerHighlight(imeiUnit.id);
    } else {
      // Non-IMEI item
      const availableStock = item.quantity;
      if (availableStock <= 0) {
        posSound.playError();
        showToast(`المنتج "${item.name}" غير متاح في المخزون (الكمية: 0)`, 'error');
        return;
      }

      const existingIndex = cart.findIndex(c => c.inventoryId === item.id && !c.hasIMEI);
      if (existingIndex >= 0) {
        const currentQty = cart[existingIndex].quantity;
        const newQty = currentQty + qtyToAdd;

        if (newQty > availableStock) {
          posSound.playError();
          const added = Math.max(0, availableStock - currentQty);
          if (added > 0) {
            setCart(prev => {
              const updated = [...prev];
              updated[existingIndex].quantity = availableStock;
              updated[existingIndex].total = availableStock * updated[existingIndex].unitPrice;
              return updated;
            });
            posSound.playBeep();
            showToast(`تمت زيادة الكمية للحد الأقصى المتاح (${availableStock})`, 'warning');
            triggerHighlight(item.id);
          } else {
            showToast(`الكمية في السلة (${currentQty}) وصلت للحد الأقصى المتاح بالمخزن (${availableStock})`, 'warning');
            triggerHighlight(item.id);
          }
          return;
        }

        setCart(prev => {
          const updated = [...prev];
          updated[existingIndex].quantity = newQty;
          updated[existingIndex].total = newQty * updated[existingIndex].unitPrice;
          return updated;
        });
        posSound.playBeep();
        showToast(`+${qtyToAdd} ${item.name} (الإجمالي: ${newQty})`, 'success');
        triggerHighlight(item.id);
      } else {
        const finalQty = Math.min(qtyToAdd, availableStock);
        const newCartItem: CartItem = {
          inventoryId: item.id,
          name: item.name,
          quantity: finalQty,
          unitPrice: item.sellPrice,
          originalPrice: item.sellPrice,
          costPrice: item.costPrice,
          total: finalQty * item.sellPrice,
          hasIMEI: false,
          maxStock: availableStock
        };

        setCart(prev => [newCartItem, ...prev]);
        posSound.playBeep();
        showToast(`تمت إضافة "${item.name}" (${finalQty} قطعة)`, 'success');
        triggerHighlight(item.id);

        if (qtyToAdd > availableStock) {
          showToast(`تمت إضافة ${availableStock} فقط لعدم توفر كمية إضافية`, 'warning');
        }
      }
    }

    // Reset search & active multiplier
    setSearchTerm('');
    setActiveMultiplier(1);
    searchRef.current?.focus();
  }, [cart, getAvailableIMEIs, showToast, triggerHighlight]);

  // Core Smart Barcode / Code / IMEI Handler
  const processBarcodeScan = useCallback((rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    // Check for multiplier format (e.g., "5*622123456" or "622123456*5")
    let targetBarcode = trimmed;
    let multiplier = activeMultiplier;

    if (trimmed.includes('*')) {
      const parts = trimmed.split('*');
      if (parts.length === 2) {
        if (!isNaN(Number(parts[0])) && Number(parts[0]) > 0 && parts[1]) {
          multiplier = Math.floor(Number(parts[0]));
          targetBarcode = parts[1].trim();
        } else if (!isNaN(Number(parts[1])) && Number(parts[1]) > 0 && parts[0]) {
          multiplier = Math.floor(Number(parts[1]));
          targetBarcode = parts[0].trim();
        }
      }
    }

    const cleanCode = targetBarcode.toLowerCase();

    // 1. Direct match on IMEI number
    const matchingImeiUnit = imeiUnits.find(
      u => (u.imei1.toLowerCase() === cleanCode || u.imei2?.toLowerCase() === cleanCode) && u.status === 'available'
    );
    if (matchingImeiUnit) {
      const parentItem = inventory.find(i => i.id === matchingImeiUnit.inventoryId);
      if (parentItem) {
        addToCart(parentItem, matchingImeiUnit, 1);
        return;
      }
    }

    // 2. Exact match on Product Barcode
    const matchingByBarcode = inventory.find(
      i => i.barcode && i.barcode.trim() === targetBarcode
    );
    if (matchingByBarcode) {
      addToCart(matchingByBarcode, undefined, multiplier);
      return;
    }

    // 3. Exact match on Product Code
    const matchingByCode = inventory.find(
      i => i.code && i.code.trim().toLowerCase() === cleanCode
    );
    if (matchingByCode) {
      addToCart(matchingByCode, undefined, multiplier);
      return;
    }

    // 4. Exact match on Product Name
    const matchingByName = inventory.find(
      i => i.name.trim().toLowerCase() === cleanCode
    );
    if (matchingByName) {
      addToCart(matchingByName, undefined, multiplier);
      return;
    }

    // 5. If only 1 product matches partial name/code/barcode
    const partialMatches = inventory.filter(i =>
      i.name.toLowerCase().includes(cleanCode) ||
      i.code.toLowerCase().includes(cleanCode) ||
      (i.barcode && i.barcode.includes(targetBarcode))
    );
    if (partialMatches.length === 1) {
      addToCart(partialMatches[0], undefined, multiplier);
      return;
    }

    // Not found: error tone + offer quick product addition!
    posSound.playError();
    showToast(`⚠️ الصنف بالرمز "${targetBarcode}" غير مسجل في النظام`, 'error');

    // Pre-fill quick add modal
    setQuickProduct({
      name: '',
      barcode: targetBarcode,
      code: '',
      categoryId: categories[0]?.id || '',
      sellPrice: 0,
      costPrice: 0,
      quantity: 10
    });
    setShowQuickAddModal(true);
    setSearchTerm('');
  }, [activeMultiplier, addToCart, categories, imeiUnits, inventory, showToast]);

  // Global Hardware Barcode Scanner Listener
  // Hardware scanners type very rapidly (<45ms per character) followed by Enter or Tab
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If typing in normal inputs (like customer modal or notes), don't intercept unless it's a super fast scanner
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const isSearchInput = target === searchRef.current;

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Handle Enter / Tab from scanner or search input
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (barcodeBufferRef.current.length > 2) {
          const scannedCode = barcodeBufferRef.current;
          barcodeBufferRef.current = '';
          e.preventDefault();
          processBarcodeScan(scannedCode);
          return;
        }
        if (isSearchInput && searchTerm.trim()) {
          e.preventDefault();
          processBarcodeScan(searchTerm);
          return;
        }
      }

      // Capture single printable character into scanner buffer if fast typing (< 60ms) or when not in any other input
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!isInput) {
          barcodeBufferRef.current += e.key;
          // Timeout buffer after 500ms of inactivity
          setTimeout(() => {
            if (Date.now() - lastKeyTimeRef.current > 400) {
              barcodeBufferRef.current = '';
            }
          }, 450);
        } else if (interval < 50) {
          barcodeBufferRef.current += e.key;
        } else {
          barcodeBufferRef.current = e.key;
        }
      }

      // Keyboard Shortcuts
      if (e.key === 'F2' || (e.key === '/' && !isInput)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        showToast('تم تفعيل قارئ الباركود ⚡', 'info');
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          completeSale();
        } else {
          showToast('السلة فارغة!', 'warning');
        }
      } else if (e.key === 'F8' || (e.altKey && e.key.toLowerCase() === 'c')) {
        e.preventDefault();
        setShowCustomerModal(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        parkCurrentSale();
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowQuickAddModal(true);
      } else if (e.key === 'Escape') {
        setShowCustomerModal(false);
        setShowIMEIModal(false);
        setShowReceipt(false);
        setShowShortcutsModal(false);
        setShowParkedModal(false);
        setShowQuickAddModal(false);
        setSearchTerm('');
        searchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  // Update cart item quantity directly
  const handleQuantityDirect = (index: number, val: number | string) => {
    const item = cart[index];
    if (item.hasIMEI) return;

    const invItem = inventory.find(i => i.id === item.inventoryId);
    const max = invItem ? invItem.quantity : item.maxStock;

    let numVal = typeof val === 'string' ? parseInt(val, 10) : val;

    if (isNaN(numVal) || numVal < 1) {
      numVal = 1;
    }

    if (numVal > max) {
      posSound.playError();
      showToast(`الكمية المتاحة في المخزن هي ${max} فقط`, 'warning');
      numVal = max;
    }

    setCart(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: numVal,
        total: numVal * updated[index].unitPrice
      };
      return updated;
    });
  };

  // Delta update quantity (+1, -1)
  const updateQuantityDelta = (index: number, delta: number) => {
    const item = cart[index];
    if (item.hasIMEI) return;

    const invItem = inventory.find(i => i.id === item.inventoryId);
    const max = invItem ? invItem.quantity : item.maxStock;
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      removeFromCart(index);
    } else if (newQty <= max) {
      setCart(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          quantity: newQty,
          total: newQty * updated[index].unitPrice
        };
        return updated;
      });
      posSound.playBeep(1800, 0.05);
    } else {
      posSound.playError();
      showToast(`الكمية المتاحة في المخزن غير كافية (المتاح: ${max})`, 'warning');
    }
  };

  // Update item unit price
  const updateUnitPrice = (index: number, newPrice: number) => {
    const validPrice = isNaN(newPrice) || newPrice < 0 ? 0 : newPrice;
    setCart(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        unitPrice: validPrice,
        total: updated[index].quantity * validPrice
      };
      return updated;
    });
  };

  // Remove from cart
  const removeFromCart = (index: number) => {
    const item = cart[index];
    setCart(prev => prev.filter((_, i) => i !== index));
    showToast(`تم حذف "${item.name}" من السلة`, 'info');
    searchRef.current?.focus();
  };

  // Clear cart
  const clearCart = () => {
    if (cart.length === 0) return;
    if (confirm('هل أنت متأكد من إفراغ السلة بالكامل؟')) {
      setCart([]);
      setDiscount('');
      setNotes('');
      setCashReceived('');
      showToast('تم إفراغ السلة', 'info');
      searchRef.current?.focus();
    }
  };

  // Totals calculation
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);

  const discountAmount = useMemo(() => {
    const rawDisc = Number(discount) || 0;
    if (rawDisc <= 0) return 0;
    if (discountType === 'percent') {
      return Math.min(subtotal, (subtotal * rawDisc) / 100);
    }
    return Math.min(subtotal, rawDisc);
  }, [discount, discountType, subtotal]);

  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  const cashChange = useMemo(() => {
    if (paymentMethod !== 'cash' || !cashReceived || Number(cashReceived) < total) {
      return 0;
    }
    return Number(cashReceived) - total;
  }, [paymentMethod, cashReceived, total]);

  // Filter products for catalog
  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return inventory.filter(item => {
      const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
      if (!matchesCategory) return false;

      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        (item.barcode && item.barcode.includes(term))
      );
    });
  }, [inventory, selectedCategory, searchTerm]);

  // Complete Sale
  const completeSale = () => {
    if (cart.length === 0) {
      posSound.playError();
      showToast('السلة فارغة، أضف منتجات أولاً', 'error');
      return;
    }

    if (paymentMethod === 'installment' && !selectedCustomer) {
      posSound.playError();
      showToast('يجب اختيار عميل لتسجيل البيع الآجل', 'error');
      setShowCustomerModal(true);
      return;
    }

    if (paymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < total) {
      posSound.playError();
      showToast(`المستلم من العميل أقل من المطلوب (${formatCurrency(total)})`, 'error');
      return;
    }

    const saleItems: Omit<SaleItem, 'id'>[] = cart.map(item => ({
      inventoryId: item.inventoryId,
      imeiUnitId: item.imeiUnitId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: item.costPrice,
      total: item.total,
      returnedQuantity: 0
    }));

    let finalPaidAmount = total;
    if (paymentMethod === 'installment') {
      const rawPaidAmount = Number(paidAmount) || 0;
      const clampedPaidAmount = Math.min(Math.max(rawPaidAmount, 0), total);
      if (clampedPaidAmount !== rawPaidAmount) {
        posSound.playError();
        showToast('المبلغ المدفوع يجب أن يكون بين 0 والإجمالي، تم تصحيحه تلقائياً', 'error');
      }
      finalPaidAmount = clampedPaidAmount;
    }

    const safeToUse = selectedSafe || safes[0]?.id || '';

    const saleResult = onCreateSale(
      selectedCustomer?.id || '',
      saleItems,
      discountAmount,
      finalPaidAmount,
      paymentMethod,
      safeToUse,
      notes
    );

    // Play pleasant success chime!
    posSound.playSuccess();

    // Fire a brief confetti + checkmark celebration (purely visual, non-blocking)
    const confettiColors = ['#F59E0B', '#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899'];
    const pieceCount = 18;
    const pieces: ConfettiPiece[] = Array.from({ length: pieceCount }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / pieceCount + (Math.random() - 0.5) * 0.4;
      const distance = 70 + Math.random() * 60;
      return {
        id: i,
        color: confettiColors[i % confettiColors.length],
        size: 6 + Math.random() * 5,
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        rot: Math.random() * 360,
        delay: Math.random() * 0.08
      };
    });
    setSaleCelebration(pieces);
    setTimeout(() => setSaleCelebration(null), 1100);

    // Setup receipt
    setLastSale({
      items: [...cart],
      subtotal,
      discount: discountAmount,
      total,
      paid: finalPaidAmount,
      remaining: Math.max(0, total - finalPaidAmount),
      change: cashChange,
      paymentMethod,
      customer: selectedCustomer,
      invoiceNumber: saleResult.invoiceNumber,
      date: new Date().toLocaleDateString(localStorage.getItem('app_locale') || 'ar-EG')
    });
    setShowReceipt(true);

    // Reset active cart
    setCart([]);
    setDiscount('');
    setSelectedCustomer(null);
    setNotes('');
    setPaidAmount('');
    setCashReceived('');
    setActiveMultiplier(1);
  };

  // Park / Hold current sale
  const parkCurrentSale = () => {
    if (cart.length === 0) {
      showToast('السلة فارغة، لا يوجد شيء لتعليقه', 'warning');
      return;
    }
    const newParked: ParkedSale = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      cart: [...cart],
      customer: selectedCustomer,
      discount: Number(discount) || 0,
      discountType,
      notes,
      total
    };
    setParkedSales(prev => [newParked, ...prev]);
    setCart([]);
    setDiscount('');
    setSelectedCustomer(null);
    setNotes('');
    setCashReceived('');
    showToast('تم تعليق الفاتورة بنجاح ⏱️', 'success');
  };

  // Restore parked sale
  const restoreParkedSale = (parked: ParkedSale) => {
    if (cart.length > 0) {
      if (!confirm('توجد أصناف حالياً بالسلة. هل تريد استبدالها بالفاتورة المعلقة؟')) {
        return;
      }
    }
    setCart(parked.cart);
    setSelectedCustomer(parked.customer);
    setDiscount(parked.discount || '');
    setDiscountType(parked.discountType || 'fixed');
    setNotes(parked.notes || '');
    setParkedSales(prev => prev.filter(p => p.id !== parked.id));
    setShowParkedModal(false);
    showToast('تم استرجاع الفاتورة المعلقة بنجاح', 'success');
  };

  // Add new customer
  const handleAddCustomer = () => {
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) {
      showToast('الاسم ورقم الهاتف مطلوبان', 'warning');
      return;
    }
    const created = onAddCustomer({
      name: newCustomer.name.trim(),
      phone: newCustomer.phone.trim(),
      address: newCustomer.address.trim()
    });
    setSelectedCustomer(created);
    setShowCustomerModal(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    showToast(`تمت إضافة العميل: ${created.name}`, 'success');
  };

  // Quick product addition directly from POS
  const handleQuickAddProduct = () => {
    if (!quickProduct.name.trim()) {
      showToast('اسم المنتج مطلوب', 'warning');
      return;
    }
    if (!onAddInventoryItem) {
      showToast('خاصية إضافة المنتج غير متاحة', 'error');
      return;
    }

    const created = onAddInventoryItem({
      name: quickProduct.name.trim(),
      code: quickProduct.code.trim() || `P-${Date.now().toString().slice(-4)}`,
      barcode: quickProduct.barcode.trim(),
      categoryId: quickProduct.categoryId || categories[0]?.id || '',
      costPrice: Number(quickProduct.costPrice) || 0,
      sellPrice: Number(quickProduct.sellPrice) || 0,
      quantity: Number(quickProduct.quantity) || 10,
      minQuantity: 3,
      hasIMEI: false
    });

    setShowQuickAddModal(false);
    // Add immediately to active cart!
    addToCart(created, undefined, 1);
    showToast(`تم تسجيل وإضافة "${created.name}" للسلة بنجاح!`, 'success');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(localStorage.getItem('app_locale') || 'ar-EG', {
      style: 'currency',
      currency: localStorage.getItem('app_currency') || 'EGP',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col md:flex-row gap-4 select-none">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn border text-sm font-bold ${
          toast.type === 'success' ? 'bg-green-600 text-white border-green-400' :
          toast.type === 'error' ? 'bg-red-600 text-white border-red-400' :
          toast.type === 'warning' ? 'bg-amber-500 text-white border-amber-300' :
          'bg-blue-600 text-white border-blue-400'
        }`}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'error' && <AlertCircle size={18} />}
          {toast.type === 'warning' && <AlertCircle size={18} />}
          {toast.type === 'info' && <Sparkles size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sale Success Celebration: checkmark pop + confetti burst */}
      {saleCelebration && (
        <div className="fixed inset-0 z-70 pointer-events-none flex items-center justify-center">
          <style>{`
            @keyframes posCelebrateCheck {
              0% { transform: scale(0.3); opacity: 0; }
              50% { transform: scale(1.15); opacity: 1; }
              70% { transform: scale(0.95); }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes posCelebrateFadeOut {
              0%, 70% { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes posConfettiBurst {
              0% { transform: translate(-50%, -50%) translate(0, 0) rotate(0deg); opacity: 1; }
              100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; }
            }
          `}</style>
          <div
            className="relative w-24 h-24"
            style={{ animation: 'posCelebrateFadeOut 1.1s ease-in forwards' }}
          >
            {saleCelebration.map(piece => (
              <span
                key={piece.id}
                className="absolute rounded-sm top-1/2 left-1/2"
                style={{
                  width: piece.size,
                  height: piece.size,
                  backgroundColor: piece.color,
                  ['--tx' as string]: `${piece.tx}px`,
                  ['--ty' as string]: `${piece.ty}px`,
                  ['--rot' as string]: `${piece.rot}deg`,
                  animation: `posConfettiBurst 0.9s ease-out ${piece.delay}s forwards`
                } as CSSProperties}
              />
            ))}
            <div
              className="absolute inset-0 rounded-full bg-green-500 shadow-2xl flex items-center justify-center border-4 border-white dark:border-gray-800"
              style={{ animation: 'posCelebrateCheck 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
            >
              <Check size={44} className="text-white" strokeWidth={3} />
            </div>
          </div>
        </div>
      )}

      {/* LEFT PANEL: Catalog & Scanner Search */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Top Action Bar & Barcode Scanner Input */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center gap-2">
            {/* Primary Scanner Input */}
            <div className="relative flex-1">
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-blue-600 dark:text-blue-400 pointer-events-none">
                <BarcodeIcon size={20} className="animate-pulse" />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    processBarcodeScan(searchTerm);
                  }
                }}
                placeholder="امسح الباركود أو ابحث بالاسم / الكود / IMEI (اضغط Enter للإضافة المباشرة)..."
                className="w-full py-3 pr-11 pl-20 bg-blue-50/50 dark:bg-gray-700/70 border-2 border-blue-400/60 dark:border-blue-500/50 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-white font-medium text-sm transition placeholder:text-gray-400"
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); searchRef.current?.focus(); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Sound Toggle */}
            <button
              onClick={() => {
                const newState = posSound.toggleSound();
                setSoundEnabled(newState);
                showToast(newState ? 'تم تفعيل الصوت 🔊' : 'تم كتم الصوت 🔇', 'info');
              }}
              title={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
              className={`p-3 rounded-xl border transition ${
                soundEnabled
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-600'
              }`}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            {/* Quick Add Product Button */}
            <button
              onClick={() => {
                setQuickProduct({
                  name: '',
                  barcode: '',
                  code: '',
                  categoryId: categories[0]?.id || '',
                  sellPrice: 0,
                  costPrice: 0,
                  quantity: 10
                });
                setShowQuickAddModal(true);
              }}
              title="إضافة صنف سريع (Alt+N)"
              className="px-3 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm flex items-center gap-1.5 transition shadow-sm"
            >
              <PlusCircle size={18} />
              <span className="hidden sm:inline">صنف سريع</span>
            </button>

            {/* Keyboard Shortcuts Helper */}
            <button
              onClick={() => setShowShortcutsModal(true)}
              title="اختصارات الكيبورد"
              className="p-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition"
            >
              <HelpCircle size={20} />
            </button>
          </div>

          {/* Quick Multipliers & Category Filters */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 text-xs">
            {/* Multiplier Chips */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <span className="text-gray-500 dark:text-gray-400 px-1.5 font-medium">الكمية:</span>
              {[1, 2, 3, 5, 10].map(multiplier => (
                <button
                  key={multiplier}
                  onClick={() => {
                    setActiveMultiplier(multiplier);
                    searchRef.current?.focus();
                    showToast(`تم ضبط مضاعف المسح على ×${multiplier}`, 'info');
                  }}
                  className={`px-2.5 py-1 rounded-md font-bold transition ${
                    activeMultiplier === multiplier
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  ×{multiplier}
                </button>
              ))}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition ${
                  selectedCategory === 'all'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-bold'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                الكل ({inventory.length})
              </button>
              {categories.map(cat => {
                const count = inventory.filter(i => i.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition ${
                      selectedCategory === cat.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Product Catalog Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
              <Search size={48} className="mb-3 opacity-40" />
              <p className="text-base font-medium">لا توجد منتجات مطابقة للبحث</p>
              {searchTerm && (
                <button
                  onClick={() => {
                    setQuickProduct({
                      name: searchTerm,
                      barcode: searchTerm,
                      code: '',
                      categoryId: categories[0]?.id || '',
                      sellPrice: 0,
                      costPrice: 0,
                      quantity: 10
                    });
                    setShowQuickAddModal(true);
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 transition"
                >
                  <Plus size={16} />
                  إضافة "{searchTerm}" كمنتج جديد سريع
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(item => {
                const category = categories.find(c => c.id === item.categoryId);
                const availableStock = getItemAvailableStock(item);
                const isOutOfStock = availableStock <= 0;
                const isLowStock = availableStock > 0 && availableStock <= 3;
                const inCart = cart.find(c => c.inventoryId === item.id);

                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item, undefined, activeMultiplier)}
                    disabled={isOutOfStock}
                    className={`
                      relative p-3.5 rounded-xl border text-right transition-all flex flex-col justify-between group
                      ${isOutOfStock
                        ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                        : 'bg-white dark:bg-gray-700/80 border-gray-200 dark:border-gray-600 hover:border-blue-500 hover:shadow-md active:scale-[0.98]'
                      }
                      ${inCart ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}
                    `}
                  >
                    {/* Top row: category & stock */}
                    <div className="flex items-center justify-between gap-1 w-full mb-1.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        category?.type === 'device' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' :
                        category?.type === 'accessory' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
                      }`}>
                        {category?.name || 'عام'}
                      </span>
                      
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        isOutOfStock ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                        isLowStock ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        {isOutOfStock ? 'نفذ' : `متاح: ${availableStock}`}
                      </span>
                    </div>

                    {/* Product Name */}
                    <h3 className="font-semibold text-gray-800 dark:text-white text-sm line-clamp-2 mb-2 leading-tight">
                      {item.name}
                    </h3>

                    {/* Barcode & Code hint */}
                    <div className="text-[11px] text-gray-400 dark:text-gray-400 font-mono mb-2 flex items-center justify-between">
                      <span>{item.code || '-'}</span>
                      {item.barcode && <span className="opacity-75">{item.barcode}</span>}
                    </div>

                    {/* Bottom Price */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-600/50">
                      <span className="text-base font-black text-blue-600 dark:text-blue-400">
                        {formatCurrency(item.sellPrice)}
                      </span>
                      {inCart && (
                        <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                          في السلة: {inCart.quantity}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Active Cart & Checkout */}
      <div className="w-full md:w-[420px] flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Cart Header: Customer & Parked Actions */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2 bg-gray-50/50 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="text-blue-600 dark:text-blue-400" size={20} />
              <h2 className="font-bold text-gray-800 dark:text-white text-base">
                سلة البيع ({cart.reduce((s, i) => s + i.quantity, 0)})
              </h2>
            </div>

            <div className="flex items-center gap-1">
              {/* Park Current Invoice */}
              <button
                onClick={parkCurrentSale}
                disabled={cart.length === 0}
                title="تعليق الفاتورة الحالية (F9)"
                className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Clock size={14} />
                <span>تعليق</span>
              </button>

              {/* Parked Sales List */}
              {parkedSales.length > 0 && (
                <button
                  onClick={() => setShowParkedModal(true)}
                  className="px-2.5 py-1.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-200 transition flex items-center gap-1"
                >
                  <RotateCcw size={14} />
                  <span>معلقة ({parkedSales.length})</span>
                </button>
              )}

              {/* Clear Cart */}
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  title="إفراغ السلة بالكامل"
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Customer Selection Card */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCustomerModal(true)}
              className="flex-1 flex items-center justify-between p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-500 transition text-right"
            >
              <div className="flex items-center gap-2 truncate">
                <User size={16} className="text-blue-600 shrink-0" />
                <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
                  {selectedCustomer ? selectedCustomer.name : 'اختر أو أضف عميل (F8)'}
                </span>
              </div>
              {selectedCustomer && (
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 font-mono">
                  {selectedCustomer.phone}
                </span>
              )}
            </button>

            {selectedCustomer && (
              <button
                onClick={() => setSelectedCustomer(null)}
                title="إلغاء تحديد العميل"
                className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-100 transition"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Cart Item Rows */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-6 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700/50 rounded-2xl flex items-center justify-center mb-3">
                <BarcodeIcon size={32} className="opacity-40" />
              </div>
              <p className="font-bold text-gray-600 dark:text-gray-300 mb-1">السلة فارغة</p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-[220px]">
                امسح باركود أي منتج أو اضغط عليه من القائمة لإضافته مباشرة
              </p>
            </div>
          ) : (
            cart.map((item, index) => {
              const isHighlighted = highlightedId === (item.imeiUnitId || item.inventoryId);
              const invItem = inventory.find(i => i.id === item.inventoryId);
              const maxStock = invItem ? invItem.quantity : item.maxStock;

              return (
                <div
                  key={`${item.inventoryId}-${item.imeiUnitId || index}`}
                  className={`
                    p-3 rounded-xl border transition-all duration-300
                    ${isHighlighted
                      ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-500 ring-2 ring-blue-400/50 scale-[1.01]'
                      : 'bg-gray-50/80 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600/80 hover:border-gray-300'
                    }
                  `}
                >
                  {/* Top: Name & Remove */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate leading-snug">
                        {item.name}
                      </h4>
                      {item.imei1 && (
                        <span className="inline-block mt-0.5 text-[11px] font-mono px-1.5 py-0.2 bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 rounded font-semibold">
                          IMEI: {item.imei1}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(index)}
                      className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                      title="حذف الصنف"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Middle: Fast Quantity Modifier & Editable Unit Price */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-200/60 dark:border-gray-600/60">
                    {/* Quantity Modifier */}
                    {!item.hasIMEI ? (
                      <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantityDelta(index, -1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition font-bold"
                          title="تقليل (-1)"
                        >
                          <Minus size={14} />
                        </button>

                        {/* Direct Editable Quantity Input */}
                        <input
                          type="number"
                          min="1"
                          max={maxStock}
                          value={item.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleQuantityDirect(index, e.target.value)}
                          className="w-12 text-center text-sm font-bold bg-transparent border-0 focus:ring-0 p-0 text-gray-900 dark:text-white"
                          title={`الكمية (الحد الأقصى المتاح بالمخزن: ${maxStock})`}
                        />

                        <button
                          onClick={() => updateQuantityDelta(index, 1)}
                          disabled={item.quantity >= maxStock}
                          className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                          title="زيادة (+1)"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">
                        جهاز 1×
                      </span>
                    )}

                    {/* Price & Row Total */}
                    <div className="flex items-center gap-2">
                      <div className="text-left">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateUnitPrice(index, Number(e.target.value))}
                          className="w-20 text-left text-xs font-mono p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                          title="تعديل سعر الوحدة"
                        />
                      </div>
                      <span className="text-sm font-black text-blue-600 dark:text-blue-400 min-w-[70px] text-left">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={cartEndRef} />
        </div>

        {/* Cart Summary & Payment Controls */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3 bg-gray-50/50 dark:bg-gray-800/80">
          {/* Discount Field */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-600 dark:text-gray-400 font-medium">الخصم:</span>
            <div className="flex items-center gap-1">
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-700">
                <button
                  type="button"
                  onClick={() => setDiscountType('fixed')}
                  className={`px-2 py-1 text-xs font-bold transition ${
                    discountType === 'fixed'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                  }`}
                >
                  ج.م
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={`px-2 py-1 text-xs font-bold transition ${
                    discountType === 'percent'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                  }`}
                >
                  %
                </button>
              </div>

              <input
                type="number"
                min="0"
                value={discount}
                placeholder="0"
                onChange={(e) => setDiscount(e.target.value ? Number(e.target.value) : '')}
                className="w-24 text-left p-1.5 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Subtotal & Total Display */}
          <div className="space-y-1 pt-1 border-t border-gray-200 dark:border-gray-700 text-xs">
            {discountAmount > 0 && (
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>الإجمالي قبل الخصم:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline font-black text-gray-900 dark:text-white">
              <span className="text-sm">المطلوب سداده:</span>
              <span className="text-xl text-blue-600 dark:text-blue-400">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition ${
                paymentMethod === 'cash'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Banknote size={15} />
              <span>نقدي</span>
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition ${
                paymentMethod === 'card'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <CreditCard size={15} />
              <span>بطاقة/فيزا</span>
            </button>
            <button
              onClick={() => setPaymentMethod('installment')}
              className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition ${
                paymentMethod === 'installment'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Calendar size={15} />
              <span>آجل</span>
            </button>
          </div>

          {/* Cash Calculator (When Cash is selected) */}
          {paymentMethod === 'cash' && (
            <div className="bg-white dark:bg-gray-700/60 p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300">المستلم من العميل:</span>
                <input
                  type="number"
                  min="0"
                  value={cashReceived}
                  placeholder={total.toString()}
                  onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : '')}
                  className="w-28 text-left p-1 text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              {/* Quick Cash Suggestions */}
              <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                <button
                  type="button"
                  onClick={() => setCashReceived(total)}
                  className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded font-bold hover:bg-blue-200 whitespace-nowrap"
                >
                  المضبوط
                </button>
                {[50, 100, 200, 500, 1000].filter(amount => amount >= total).slice(0, 3).map(amount => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCashReceived(amount)}
                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded font-medium hover:bg-gray-200 whitespace-nowrap"
                  >
                    {amount}
                  </button>
                ))}
              </div>

              {/* Change Return Display */}
              {Number(cashReceived) > total && (
                <div className="flex items-center justify-between text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg text-emerald-700 dark:text-emerald-300">
                  <span>الباقي للعميل:</span>
                  <span className="text-sm">{formatCurrency(cashChange)}</span>
                </div>
              )}
            </div>
          )}

          {/* Installment Paid Amount (When Installment is selected) */}
          {paymentMethod === 'installment' && (
            <div className="space-y-1 text-xs">
              <label className="block font-medium text-gray-700 dark:text-gray-300">
                المبلغ المدفوع مقدماً:
              </label>
              <input
                type="number"
                min="0"
                max={total}
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value ? Number(e.target.value) : '')}
                placeholder={`المتبقي كدين: ${formatCurrency(total - (Number(paidAmount) || 0))}`}
                className="w-full p-2 border border-purple-300 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold"
              />
              {!selectedCustomer && (
                <p className="text-red-500 text-[11px] font-bold">⚠️ يجب اختيار عميل لتسجيل البيع الآجل</p>
              )}
              {paidAmount !== '' && (Number(paidAmount) < 0 || Number(paidAmount) > total) && (
                <p className="text-red-500 text-[11px] font-bold">⚠️ المبلغ يجب أن يكون بين 0 و {formatCurrency(total)}</p>
              )}
            </div>
          )}

          {/* Safe Selection */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400 shrink-0">الخزنة:</span>
            <select
              value={selectedSafe}
              onChange={(e) => setSelectedSafe(e.target.value)}
              className="flex-1 p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs"
            >
              {safes.map(safe => (
                <option key={safe.id} value={safe.id}>{safe.name}</option>
              ))}
            </select>
          </div>

          {/* Complete Sale Button */}
          <button
            onClick={completeSale}
            disabled={cart.length === 0}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
          >
            <Check size={20} />
            <span>إتمام البيع وحفظ الفاتورة (F4)</span>
          </button>
        </div>
      </div>

      {/* QUICK PRODUCT ADD MODAL */}
      {showQuickAddModal && (
        <div className="modal-overlay" onClick={() => setShowQuickAddModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle size={22} />
                <h3 className="font-bold text-lg">إضافة صنف سريع للسلة</h3>
              </div>
              <button
                onClick={() => setShowQuickAddModal(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  اسم المنتج *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={quickProduct.name}
                  onChange={e => setQuickProduct(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثلاً: شاحن سامسونج 25W"
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    الباركود
                  </label>
                  <input
                    type="text"
                    value={quickProduct.barcode}
                    onChange={e => setQuickProduct(prev => ({ ...prev, barcode: e.target.value }))}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    الفئة *
                  </label>
                  <select
                    value={quickProduct.categoryId}
                    onChange={e => setQuickProduct(prev => ({ ...prev, categoryId: e.target.value }))}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    سعر البيع *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quickProduct.sellPrice || ''}
                    onChange={e => setQuickProduct(prev => ({ ...prev, sellPrice: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    سعر الشراء
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quickProduct.costPrice || ''}
                    onChange={e => setQuickProduct(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    الكمية الأولية
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quickProduct.quantity}
                    onChange={e => setQuickProduct(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-center"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowQuickAddModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleQuickAddProduct}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition flex items-center gap-1.5"
              >
                <Check size={18} />
                حفظ وإضافة للسلة مباشرة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARKED / HELD INVOICES MODAL */}
      {showParkedModal && (
        <div className="modal-overlay" onClick={() => setShowParkedModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 bg-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={20} />
                <h3 className="font-bold text-lg">الفواتير المعلقة ({parkedSales.length})</h3>
              </div>
              <button
                onClick={() => setShowParkedModal(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
              {parkedSales.length === 0 ? (
                <p className="text-center text-gray-500 py-8">لا توجد فواتير معلقة حالياً</p>
              ) : (
                parkedSales.map(parked => (
                  <div
                    key={parked.id}
                    className="p-3.5 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {parked.customer ? parked.customer.name : 'عميل نقدي'}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{parked.timestamp}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                        {parked.cart.length} أصناف • {parked.cart.map(i => `${i.name} (×${i.quantity})`).slice(0, 2).join('، ')}
                        {parked.cart.length > 2 && '...'}
                      </p>
                      <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-1">
                        {formatCurrency(parked.total)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => restoreParkedSale(parked)}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1"
                      >
                        <RotateCcw size={14} />
                        استرجاع
                      </button>
                      <button
                        onClick={() => setParkedSales(prev => prev.filter(p => p.id !== parked.id))}
                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition"
                        title="حذف الفاتورة المعلقة"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELPER MODAL */}
      {showShortcutsModal && (
        <div className="modal-overlay" onClick={() => setShowShortcutsModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle size={22} />
                <h3 className="font-bold text-lg">اختصارات لوحة المفاتيح السريعة</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-medium">التركيز على قارئ الباركود</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold">F2 أو /</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-medium">إتمام البيع وحفظ الفاتورة</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold">F4</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-medium">اختيار / إضافة عميل</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold">F8 أو Alt+C</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-medium">تعليق الفاتورة الحالية (Hold)</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold">F9</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-medium">إضافة صنف سريع</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold">Alt + N</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-medium">ضرب الكمية في الباركود</span>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-mono font-bold">مثال: 5*باركود</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-700 dark:text-gray-300 font-medium">إغلاق النوافذ / مسح البحث</span>
                <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold">Esc</kbd>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 text-center">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER SELECTION MODAL */}
      {showCustomerModal && (
        <div className="modal-overlay" onClick={() => setShowCustomerModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">اختيار أو إضافة عميل</h3>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Customer Search */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  autoFocus
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>

            {/* Customers List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {customers
                .filter(c =>
                  c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.phone.includes(customerSearch)
                )
                .map(customer => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowCustomerModal(false);
                      showToast(`تم اختيار العميل: ${customer.name}`, 'info');
                    }}
                    className="w-full p-3.5 hover:bg-blue-50 dark:hover:bg-gray-700 text-right transition flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white text-sm">{customer.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{customer.phone}</p>
                    </div>
                    {customer.balance !== 0 && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        customer.balance > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {customer.balance > 0 ? `عليه: ${formatCurrency(customer.balance)}` : `له: ${formatCurrency(Math.abs(customer.balance))}`}
                      </span>
                    )}
                  </button>
                ))}
            </div>

            {/* Add New Customer Section */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 space-y-2">
              <h4 className="font-bold text-gray-800 dark:text-white text-xs">إضافة عميل جديد سريع</h4>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="اسم العميل *"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                  className="p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <input
                  type="tel"
                  placeholder="رقم الهاتف *"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                  className="p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleAddCustomer}
                className="w-full py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 transition"
              >
                حفظ واختيار العميل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMEI SELECTION MODAL */}
      {showIMEIModal && selectedInventoryItem && (
        <div className="modal-overlay" onClick={() => setShowIMEIModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  اختر الجهاز - {selectedInventoryItem.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  الأجهزة المتاحة في المخزن ({getAvailableIMEIs(selectedInventoryItem.id).length})
                </p>
              </div>
              <button
                onClick={() => setShowIMEIModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* IMEI Filter */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                autoFocus
                value={imeiSearch}
                onChange={e => setImeiSearch(e.target.value)}
                placeholder="ابحث برقم الـ IMEI أو اللون أو السعة..."
                className="w-full py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white text-sm"
              />
            </div>

            {/* IMEI Units Grid */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {getAvailableIMEIs(selectedInventoryItem.id)
                .filter(u =>
                  u.imei1.includes(imeiSearch) ||
                  (u.imei2 && u.imei2.includes(imeiSearch)) ||
                  u.color.toLowerCase().includes(imeiSearch.toLowerCase()) ||
                  u.storage.toLowerCase().includes(imeiSearch.toLowerCase())
                )
                .map(unit => (
                  <button
                    key={unit.id}
                    onClick={() => {
                      addToCart(selectedInventoryItem, unit, 1);
                      setShowIMEIModal(false);
                      setSelectedInventoryItem(null);
                    }}
                    className="w-full p-3.5 border border-gray-200 dark:border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 text-right transition flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                          unit.condition === 'new' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                          unit.condition === 'used' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {unit.condition === 'new' ? 'جديد' : unit.condition === 'used' ? 'مستعمل' : 'مجدد'}
                        </span>
                        <span className="font-bold text-gray-900 dark:text-white text-sm">
                          {unit.color} - {unit.storage} {unit.ram ? `(${unit.ram})` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mt-1">
                        IMEI: {unit.imei1}
                      </p>
                    </div>

                    <p className="font-black text-blue-600 dark:text-blue-400 text-base">
                      {formatCurrency(selectedInventoryItem.sellPrice)}
                    </p>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT / INVOICE MODAL */}
      {showReceipt && lastSale && (
        <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
          <div
            className="print-section bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 print:shadow-none overflow-hidden animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 print:p-4" id="receipt-content">
              <div className="text-center mb-5 pb-4 border-b border-dashed border-gray-300 dark:border-gray-700">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">📱 {shopName}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">فاتورة مبيعات إلكترونية</p>
              </div>

              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700 font-medium">
                <div className="flex justify-between">
                  <span>رقم الفاتورة:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">{lastSale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ:</span>
                  <span>{lastSale.date}</span>
                </div>
                {lastSale.customer && (
                  <div className="flex justify-between">
                    <span>العميل:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{lastSale.customer.name} ({lastSale.customer.phone})</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>طريقة الدفع:</span>
                  <span className="font-bold">
                    {lastSale.paymentMethod === 'cash' ? 'نقدي' : lastSale.paymentMethod === 'card' ? 'بطاقة / فيزا' : 'آجل'}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2 mb-4">
                {lastSale.items.map((item, index) => (
                  <div key={index} className="flex justify-between text-xs">
                    <div className="flex-1 pr-2">
                      <p className="font-bold text-gray-900 dark:text-white">{item.name}</p>
                      {item.imei1 && (
                        <p className="text-[10px] text-gray-500 font-mono">IMEI: {item.imei1}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                    </div>
                    <span className="font-black text-gray-900 dark:text-white">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-dashed border-gray-300 dark:border-gray-700 pt-3 space-y-1.5 text-xs">
                {lastSale.discount > 0 && (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>الإجمالي الفرعي:</span>
                      <span>{formatCurrency(lastSale.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>الخصم:</span>
                      <span>- {formatCurrency(lastSale.discount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-black text-base text-gray-900 dark:text-white pt-1 border-t">
                  <span>الصافي المطلوب:</span>
                  <span className="text-blue-600">{formatCurrency(lastSale.total)}</span>
                </div>
                {lastSale.paymentMethod === 'installment' && (
                  <>
                    <div className="flex justify-between text-gray-600">
                      <span>المدفوع:</span>
                      <span>{formatCurrency(lastSale.paid)}</span>
                    </div>
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>المتبقي (آجل):</span>
                      <span>{formatCurrency(lastSale.remaining)}</span>
                    </div>
                  </>
                )}
                {lastSale.change > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>الباقي للعميل:</span>
                    <span>{formatCurrency(lastSale.change)}</span>
                  </div>
                )}
              </div>

              <div className="text-center mt-5 pt-3 border-t border-dashed border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                <p className="font-semibold">{receiptFooter || 'شكراً لتعاملكم معنا'}</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/60 border-t border-gray-200 dark:border-gray-700 flex gap-2 no-print">
              <button
                onClick={() => { printReceipt(); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow"
              >
                <Printer size={18} />
                <span>طباعة الفاتورة</span>
              </button>
              <button
                onClick={() => setShowReceipt(false)}
                className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-bold rounded-xl hover:bg-gray-300 transition"
              >
                إغلاق (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
