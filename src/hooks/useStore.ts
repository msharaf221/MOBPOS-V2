import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIndexedDB, useIndexedDBSetting, indexedDBUtils } from './useIndexedDB';
import { v4 as uuidv4 } from 'uuid';
import { hashPasswordForStorage, verifyLoginPassword, needsRehash } from '../utils/passwords';
import {
  User, Customer, Category, InventoryItem, IMEIUnit,
  Sale, SaleItem, SaleReturn, Maintenance, MaintenancePart, Safe, Transaction, Supplier, Notification,
  StockWaste, InventoryAudit, InventoryAuditItem, SideAccountEntry, SideAccountEntryType,
  SideAccountImpact, AppSettings
} from '../types';
import {
  initialUsers, initialCustomers, initialCategories, initialInventory,
  initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes,
  initialTransactions, initialSuppliers, initialStockWastes, initialInventoryAudits,
  initialSideAccountEntries, initialNotifications
} from '../data/initialData';
import { buildAutoNotifications, mergeAutoNotifications } from '../utils/alerts';

export const defaultAppSettings: AppSettings = {

  shopName: 'MOBPOS',
  shopPhone: '01000000000',
  shopAddress: 'القاهرة - مصر',
  receiptFooter: 'شكراً لتعاملكم معنا 💙',
  notifSound: true,
  autoRefresh: true,
  shopLogo: undefined,
  accentColor: '#3b82f6',
  themeStyle: 'default'
};

// Main store hook
export function useStore() {
  // State using IndexedDB
  const [users, setUsers, usersLoading] = useIndexedDB<User>('users', initialUsers);
  const [customers, setCustomers, customersLoading] = useIndexedDB<Customer>('customers', initialCustomers);
  const [categories, setCategories, categoriesLoading] = useIndexedDB<Category>('categories', initialCategories);
  const [inventory, setInventory, inventoryLoading] = useIndexedDB<InventoryItem>('inventory', initialInventory);
  const [imeiUnits, setImeiUnits, imeiLoading] = useIndexedDB<IMEIUnit>('imeiUnits', initialIMEIUnits);
  const [sales, setSales, salesLoading] = useIndexedDB<Sale>('sales', initialSales);
  const [saleReturns, setSaleReturns, saleReturnsLoading] = useIndexedDB<SaleReturn>('saleReturns', initialSaleReturns);
  const [maintenance, setMaintenance, maintenanceLoading] = useIndexedDB<Maintenance>('maintenance', initialMaintenance);
  const [safes, setSafes, safesLoading] = useIndexedDB<Safe>('safes', initialSafes);
  const [transactions, setTransactions, transactionsLoading] = useIndexedDB<Transaction>('transactions', initialTransactions);
  const [suppliers, setSuppliers, suppliersLoading] = useIndexedDB<Supplier>('suppliers', initialSuppliers);
  const [stockWastes, setStockWastes, stockWastesLoading] = useIndexedDB<StockWaste>('stockWastes', initialStockWastes);
  const [inventoryAudits, setInventoryAudits, inventoryAuditsLoading] = useIndexedDB<InventoryAudit>('inventoryAudits', initialInventoryAudits);
  const [sideAccountEntries, setSideAccountEntries, sideAccountEntriesLoading] = useIndexedDB<SideAccountEntry>('sideAccountEntries', initialSideAccountEntries);
  const [notifications, setNotifications, notificationsLoading] = useIndexedDB<Notification>('notifications', initialNotifications);
  
  // Settings
  // ⚠️  الجلسة (المستخدم الحالي) محفوظة في الذاكرة فقط — عمداً مش مخزنة في
  // IndexedDB: عند قفل التطبيق أو النظام (أو حتى انقطاع الكهرباء) الجلسة
  // بتتلمس أوتوماتيك، وكل ما النظام يتفتح تاني تظهر شاشة تسجيل الدخول
  // (اسم المستخدم + كلمة المرور) — مفيش حد يلاقي حساب فاتح وبيانات مكشوفة.
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const userLoading = false;
  const [isDarkMode, setIsDarkMode, darkModeLoading] = useIndexedDBSetting<boolean>('darkMode', false);
  const [appSettings, setAppSettings, appSettingsLoading] = useIndexedDBSetting<AppSettings>('shopSettings', defaultAppSettings);

  // تنظيف لمرة واحدة عند أول تشغيل بعد الترقية:
  // الإصدارات القديمة (≤1.0.1) كانت بتخزن الجلسة في IndexedDB — لو في جلسة
  // قديمة متبقية من نسخة قديمة، امسحها عشان ما يتفتحش التطبيق على حساب فاتح.
  useEffect(() => {
    indexedDBUtils.remove('appSettings', 'currentUser').catch(() => {
      /* ما فيش مفتاح قديم — لا حاجة للتنظيف */
    });
  }, []);

  // Loading state
  const isLoading = usersLoading || customersLoading || categoriesLoading || 
    inventoryLoading || imeiLoading || salesLoading || maintenanceLoading ||
    saleReturnsLoading || safesLoading || transactionsLoading || suppliersLoading || stockWastesLoading ||
    inventoryAuditsLoading || sideAccountEntriesLoading || notificationsLoading ||
    userLoading || darkModeLoading || appSettingsLoading;

  // Auth functions
  // كلمات السر مخزنة مجزأة (PBKDF2-HMAC-SHA-256 بملح فريد) مع توافق رجعي
  // للهاشات القديمة (SHA-256/نص عادي) وإجبار تغيير كلمة المرور الافتراضية.
  const login = useCallback(async (username: string, password: string): Promise<User | null> => {
    const user = users.find(u => u.username === username);
    if (!user) return null;
    const ok = await verifyLoginPassword(password, user.password);
    if (!ok) return null;

    let sessionUser = user;
    const isDefaultAdminPw = user.password === 'admin123';
    if (user.mustChangePassword || isDefaultAdminPw) {
      sessionUser = { ...user, mustChangePassword: true };
    } else if (needsRehash(user.password)) {
      // ترقية الحساب القديم (نص عادي أو تجزئة قديمة) إلى تجزئة PBKDF2 مملّحة
      const hash = await hashPasswordForStorage(password);
      sessionUser = { ...user, password: hash, mustChangePassword: false };
      setUsers(prev => prev.map(u => (u.id === user.id ? sessionUser : u)));
    }
    setCurrentUser(sessionUser);
    return sessionUser;
  }, [users, setUsers, setCurrentUser]);

  const logout = useCallback(() => {
    setCurrentUser(null);
  }, [setCurrentUser]);

  // Change a user's password (validates the old one first, stores hashed)
  const changePassword = useCallback(async (
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'المستخدم غير موجود' };
    const oldOk = await verifyLoginPassword(oldPassword, user.password);
    if (!oldOk) return { ok: false, error: 'كلمة المرور الحالية غير صحيحة' };
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' };
    }
    if (newPassword === oldPassword) {
      return { ok: false, error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' };
    }

    const hash = await hashPasswordForStorage(newPassword);
    const updated: User = { ...user, password: hash, mustChangePassword: false };
    setUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
    // Keep the active session in sync
    if (currentUser?.id === userId) {
      setCurrentUser(updated);
    }
    return { ok: true };
  }, [users, currentUser, setUsers, setCurrentUser]);

  // Customer functions
  const addCustomer = useCallback((customer: Omit<Customer, 'id' | 'createdAt' | 'balance'>) => {
    const newCustomer: Customer = {
      ...customer,
      id: uuidv4(),
      balance: 0,
      createdAt: new Date().toISOString()
    };
    setCustomers(prev => [...prev, newCustomer]);
    return newCustomer;
  }, [setCustomers]);

  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [setCustomers]);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  }, [setCustomers]);

  const recordCustomerPayment = useCallback((customerId: string, amount: number, safeId: string, notes: string) => {
    // Decrease customer debt
    setCustomers(prev => prev.map(c => 
      c.id === customerId ? { ...c, balance: (c.balance || 0) - amount } : c
    ));
    // Increase safe balance
    setSafes(prev => prev.map(s => 
      s.id === safeId ? { ...s, balance: s.balance + amount } : s
    ));
    // Record transaction
    const transaction: Transaction = {
      id: uuidv4(),
      type: 'customer_payment',
      amount,
      description: `دفعة من حساب العميل${notes ? ` - ${notes}` : ''}`,
      referenceId: customerId,
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [...prev, transaction]);
    return transaction;
  }, [currentUser, setCustomers, setSafes, setTransactions]);

  const recordWalletTransaction = useCallback((
    type: 'deposit' | 'withdrawal',
    amount: number,
    fee: number,
    cost: number,
    walletId: string,
    cashSafeId: string,
    notes: string
  ) => {
    const profit = fee - cost;

    // Update safes
    setSafes(prev => prev.map(s => {
      let newBalance = s.balance;
      if (s.id === walletId) {
        newBalance += type === 'deposit' ? -(amount + cost) : amount;
      }
      if (s.id === cashSafeId) {
        newBalance += type === 'deposit' ? (amount + fee) : -(amount - fee);
      }
      return s.balance !== newBalance ? { ...s, balance: newBalance } : s;
    }));

    const transactionId = uuidv4();
    const transactionsToAdd: Transaction[] = [];

    // Main transaction
    transactionsToAdd.push({
      id: transactionId,
      type: type === 'deposit' ? 'wallet_deposit' : 'wallet_withdrawal',
      amount,
      description: `عملية ${type === 'deposit' ? 'إيداع' : 'سحب'} محفظة${notes ? ` - ${notes}` : ''}`,
      referenceId: walletId,
      safeId: cashSafeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    });

    // Profit transaction
    if (profit > 0) {
      transactionsToAdd.push({
        id: uuidv4(),
        type: 'income',
        amount: profit,
        description: `أرباح عملية ${type === 'deposit' ? 'إيداع' : 'سحب'} محفظة`,
        referenceId: transactionId,
        safeId: cashSafeId,
        userId: currentUser?.id || '',
        createdAt: new Date().toISOString()
      });
    }

    setTransactions(prev => [...prev, ...transactionsToAdd]);
    return transactionsToAdd;
  }, [currentUser, setSafes, setTransactions]);

  // Category functions
  const addCategory = useCallback((category: Omit<Category, 'id'>) => {
    const newCategory: Category = { ...category, id: uuidv4() };
    setCategories(prev => [...prev, newCategory]);
    return newCategory;
  }, [setCategories]);

  // Inventory functions
  const addInventoryItem = useCallback((item: Omit<InventoryItem, 'id' | 'createdAt'>) => {
    const newItem: InventoryItem = {
      ...item,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    setInventory(prev => [...prev, newItem]);
    return newItem;
  }, [setInventory]);

  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, [setInventory]);

  const deleteInventoryItem = useCallback((id: string) => {
    setInventory(prev => prev.filter(i => i.id !== id));
  }, [setInventory]);

  // IMEI functions
  const addIMEIUnit = useCallback((unit: Omit<IMEIUnit, 'id' | 'createdAt'>) => {
    const newUnit: IMEIUnit = {
      ...unit,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    setImeiUnits(prev => [...prev, newUnit]);
    return newUnit;
  }, [setImeiUnits]);

  const updateIMEIUnit = useCallback((id: string, updates: Partial<IMEIUnit>) => {
    setImeiUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, [setImeiUnits]);

  const deleteIMEIUnit = useCallback((id: string) => {
    setImeiUnits(prev => prev.filter(u => u.id !== id));
  }, [setImeiUnits]);

  const findIMEIByNumber = useCallback((imei: string) => {
    return imeiUnits.find(u => u.imei1 === imei || u.imei2 === imei);
  }, [imeiUnits]);

  const getIMEIHistory = useCallback((imei: string) => {
    const unit = imeiUnits.find(u => u.imei1 === imei || u.imei2 === imei);
    if (!unit) return null;
    
    const relatedSales = sales.filter(s => s.items.some(i => i.imeiUnitId === unit.id));
    const relatedMaintenance = maintenance.filter(m => m.imeiLink === imei);
    
    return {
      unit,
      sales: relatedSales,
      maintenance: relatedMaintenance
    };
  }, [imeiUnits, sales, maintenance]);

  // Sales functions
  const generateInvoiceNumber = useCallback(() => {
    const year = new Date().getFullYear();
    const count = sales.filter(s => s.invoiceNumber.includes(year.toString())).length + 1;
    return `INV-${year}-${count.toString().padStart(4, '0')}`;
  }, [sales]);

  const createSale = useCallback((
    customerId: string,
    items: Omit<SaleItem, 'id' | 'returnedQuantity'>[],
    discount: number,
    paidAmount: number,
    paymentMethod: 'cash' | 'card' | 'installment',
    safeId: string,
    notes: string
  ) => {
    const saleItems: SaleItem[] = items.map(item => ({
      ...item,
      returnedQuantity: 0,
      id: uuidv4()
    }));

    const subtotal = saleItems.reduce((sum, item) => sum + item.total, 0);
    const total = subtotal - discount;
    const remaining = total - paidAmount;
    const profit = saleItems.reduce((sum, item) => sum + (item.total - (item.costPrice * item.quantity)), 0) - discount;

    const newSale: Sale = {
      id: uuidv4(),
      invoiceNumber: generateInvoiceNumber(),
      customerId,
      items: saleItems,
      subtotal,
      discount,
      total,
      paid: paidAmount,
      remaining,
      profit,
      paymentMethod,
      cashierId: currentUser?.id || '',
      safeId,
      notes,
      createdAt: new Date().toISOString()
    };

    // Update IMEI units status
    saleItems.forEach(item => {
      if (item.imeiUnitId) {
        updateIMEIUnit(item.imeiUnitId, {
          status: 'sold',
          saleId: newSale.id,
          customerId
        });
      }
    });

    // Update inventory quantities for non-IMEI items (group by product to avoid race conditions)
    const quantitiesToDeduct: Record<string, number> = {};
    saleItems.forEach(item => {
      if (!item.imeiUnitId) {
        quantitiesToDeduct[item.inventoryId] = (quantitiesToDeduct[item.inventoryId] || 0) + item.quantity;
      }
    });
    setInventory(prev => prev.map(inv => {
      const deduct = quantitiesToDeduct[inv.id];
      return deduct ? { ...inv, quantity: Math.max(0, inv.quantity - deduct) } : inv;
    }));

    // Update safe balance with paidAmount instead of total
    setSafes(prev => prev.map(s => 
      s.id === safeId ? { ...s, balance: s.balance + paidAmount } : s
    ));

    // Update customer balance if there's remaining amount
    if (remaining > 0 && customerId) {
      setCustomers(prev => prev.map(c => 
        c.id === customerId ? { ...c, balance: (c.balance || 0) + remaining } : c
      ));
    }

    // Add transaction for the paid amount
    const transaction: Transaction = {
      id: uuidv4(),
      type: 'sale',
      amount: paidAmount,
      description: `فاتورة بيع ${newSale.invoiceNumber}`,
      referenceId: newSale.id,
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [...prev, transaction]);

    setSales(prev => [...prev, newSale]);
    return newSale;
  }, [currentUser, generateInvoiceNumber, inventory, updateIMEIUnit, setInventory, setSafes, setCustomers, setTransactions, setSales]);

  const processSaleReturn = useCallback((
    saleId: string,
    saleItemId: string,
    quantity: number,
    reason: string
  ) => {
    const sale = sales.find(s => s.id === saleId);
    const saleItem = sale?.items.find(item => item.id === saleItemId);
    if (!sale || !saleItem) return null;

    const alreadyReturned = saleItem.returnedQuantity || 0;
    const returnableQuantity = saleItem.quantity - alreadyReturned;
    if (quantity <= 0 || quantity > returnableQuantity) return null;

    // A returned item is only worth as much cash-back as was actually
    // collected for it. On installment sales (paid < total), refunding the
    // full item price from the safe would pay out cash that was never
    // received; the unpaid portion is instead forgiven from the customer's
    // debt (they no longer owe for an item they gave back).
    const refundAmount = (saleItem.total / saleItem.quantity) * quantity;
    const paidRatio = sale.total > 0 ? Math.min(1, sale.paid / sale.total) : 0;
    const cashRefund = Math.round(refundAmount * paidRatio * 100) / 100;
    const debtForgiven = Math.round((refundAmount - cashRefund) * 100) / 100;
    const now = new Date().toISOString();
    const returnRecord: SaleReturn = {
      id: uuidv4(),
      saleId,
      saleItemId,
      inventoryId: saleItem.inventoryId,
      imeiUnitId: saleItem.imeiUnitId,
      quantity,
      refundAmount: cashRefund,
      reason,
      createdAt: now,
      processedBy: currentUser?.id || ''
    };

    setSaleReturns(prev => [...prev, returnRecord]);

    setSales(prev => prev.map(s => {
      if (s.id !== saleId) return s;
      return {
        ...s,
        items: s.items.map(item =>
          item.id === saleItemId
            ? { ...item, returnedQuantity: (item.returnedQuantity || 0) + quantity }
            : item
        )
      };
    }));

    if (saleItem.imeiUnitId) {
      updateIMEIUnit(saleItem.imeiUnitId, {
        status: 'available',
        saleId: '',
        customerId: ''
      });
    } else {
      setInventory(prev => prev.map(inv =>
        inv.id === saleItem.inventoryId
          ? { ...inv, quantity: inv.quantity + quantity }
          : inv
      ));
    }

    if (cashRefund > 0) {
      setSafes(prev => prev.map(s =>
        s.id === sale.safeId ? { ...s, balance: s.balance - cashRefund } : s
      ));

      const transaction: Transaction = {
        id: uuidv4(),
        type: 'return',
        amount: -cashRefund,
        description: `مرتجع ${sale.invoiceNumber}`,
        referenceId: returnRecord.id,
        safeId: sale.safeId,
        userId: currentUser?.id || '',
        createdAt: now
      };
      setTransactions(prev => [...prev, transaction]);
    }

    if (debtForgiven > 0 && sale.customerId) {
      setCustomers(prev => prev.map(c =>
        c.id === sale.customerId ? { ...c, balance: c.balance - debtForgiven } : c
      ));
    }

    return returnRecord;
  }, [currentUser, sales, setSaleReturns, setSales, updateIMEIUnit, setInventory, setSafes, setTransactions, setCustomers]);

  const recordStockWaste = useCallback((
    inventoryId: string,
    quantity: number,
    supplierId: string,
    reason: string,
    notes: string
  ) => {
    const item = inventory.find(inv => inv.id === inventoryId);
    if (!item || quantity <= 0) return null;

    if (item.hasIMEI) {
      const availableUnits = imeiUnits
        .filter(unit => unit.inventoryId === inventoryId && unit.status === 'available')
        .slice(0, quantity);

      if (availableUnits.length !== quantity) return null;

      availableUnits.forEach(unit => {
        updateIMEIUnit(unit.id, {
          status: 'wasted',
          saleId: '',
          customerId: '',
          notes: notes || unit.notes
        });
      });
    } else {
      if (item.quantity < quantity) return null;

      setInventory(prev => prev.map(inv =>
        inv.id === inventoryId
          ? { ...inv, quantity: inv.quantity - quantity }
          : inv
      ));
    }

    const totalCost = item.costPrice * quantity;
    const now = new Date().toISOString();
    const wasteRecord: StockWaste = {
      id: uuidv4(),
      inventoryId,
      supplierId,
      quantity,
      unitCost: item.costPrice,
      totalCost,
      reason,
      notes,
      createdAt: now,
      userId: currentUser?.id || ''
    };
    setStockWastes(prev => [...prev, wasteRecord]);

    // Record the loss in the transaction ledger (no safe is touched — no cash
    // actually moves — but Finance.tsx's income/expense totals are otherwise
    // blind to waste, understating expenses and overstating net profit).
    if (totalCost > 0) {
      const transaction: Transaction = {
        id: uuidv4(),
        type: 'waste',
        amount: -totalCost,
        description: `هالك: ${item.name} ×${quantity}`,
        referenceId: wasteRecord.id,
        safeId: '',
        userId: currentUser?.id || '',
        createdAt: now
      };
      setTransactions(prev => [...prev, transaction]);
    }

    return wasteRecord;
  }, [currentUser, imeiUnits, inventory, setInventory, setStockWastes, setTransactions, updateIMEIUnit]);

  // Inventory audit functions
  const getInventoryAuditQuantity = useCallback((item: InventoryItem) => {
    if (item.hasIMEI) {
      return imeiUnits.filter(u => u.inventoryId === item.id && u.status === 'available').length;
    }
    return item.quantity;
  }, [imeiUnits]);

  const generateAuditNumber = useCallback(() => {
    const year = new Date().getFullYear();
    const count = inventoryAudits.filter(a => a.auditNumber.includes(year.toString())).length + 1;
    return `AUD-${year}-${count.toString().padStart(4, '0')}`;
  }, [inventoryAudits]);

  const createInventoryAudit = useCallback((
    title: string,
    rows: Array<{ inventoryId: string; countedQuantity: number; notes: string }>,
    notes: string,
    applyNow: boolean
  ) => {
    const nowIso = new Date().toISOString();
    const auditItems: InventoryAuditItem[] = rows.map(row => {
      const item = inventory.find(inv => inv.id === row.inventoryId);
      const category = categories.find(cat => cat.id === item?.categoryId);
      const systemQuantity = item ? getInventoryAuditQuantity(item) : 0;
      const countedQuantity = Math.max(0, Number(row.countedQuantity) || 0);
      const difference = countedQuantity - systemQuantity;
      const costPrice = item?.costPrice || 0;
      return {
        id: uuidv4(),
        inventoryId: row.inventoryId,
        productName: item?.name || 'منتج محذوف',
        code: item?.code || '',
        categoryName: category?.name || '',
        hasIMEI: !!item?.hasIMEI,
        costPrice,
        systemQuantity,
        countedQuantity,
        difference,
        differenceCost: difference * costPrice,
        notes: row.notes || ''
      };
    });

    const newAudit: InventoryAudit = {
      id: uuidv4(),
      auditNumber: generateAuditNumber(),
      title: title || `جرد ${new Date().toLocaleDateString('ar-EG')}`,
      status: applyNow ? 'applied' : 'draft',
      items: auditItems,
      totalShortage: auditItems.filter(i => i.difference < 0).reduce((sum, i) => sum + Math.abs(i.difference), 0),
      totalSurplus: auditItems.filter(i => i.difference > 0).reduce((sum, i) => sum + i.difference, 0),
      netDifferenceCost: auditItems.reduce((sum, i) => sum + i.differenceCost, 0),
      notes,
      userId: currentUser?.id || '',
      createdAt: nowIso,
      appliedAt: applyNow ? nowIso : ''
    };

    if (applyNow) {
      const newQuantities: Record<string, number> = {};
      auditItems.forEach(row => {
        if (!row.hasIMEI) newQuantities[row.inventoryId] = row.countedQuantity;
      });
      setInventory(prev => prev.map(item =>
        Object.prototype.hasOwnProperty.call(newQuantities, item.id)
          ? { ...item, quantity: newQuantities[item.id] }
          : item
      ));
    }

    setInventoryAudits(prev => [...prev, newAudit]);
    return newAudit;
  }, [categories, currentUser, generateAuditNumber, getInventoryAuditQuantity, inventory, setInventory, setInventoryAudits]);

  const applyInventoryAudit = useCallback((auditId: string) => {
    const audit = inventoryAudits.find(a => a.id === auditId);
    if (!audit || audit.status === 'applied') return null;

    const newQuantities: Record<string, number> = {};
    audit.items.forEach(row => {
      if (!row.hasIMEI) newQuantities[row.inventoryId] = row.countedQuantity;
    });

    setInventory(prev => prev.map(item =>
      Object.prototype.hasOwnProperty.call(newQuantities, item.id)
        ? { ...item, quantity: newQuantities[item.id] }
        : item
    ));

    const appliedAt = new Date().toISOString();
    const updatedAudit: InventoryAudit = { ...audit, status: 'applied', appliedAt };
    setInventoryAudits(prev => prev.map(a => a.id === auditId ? updatedAudit : a));
    return updatedAudit;
  }, [inventoryAudits, setInventory, setInventoryAudits]);

  const deleteInventoryAudit = useCallback((auditId: string) => {
    setInventoryAudits(prev => prev.filter(a => a.id !== auditId));
  }, [setInventoryAudits]);

  // Side accounts functions
  const addSideAccountEntry = useCallback((input: {
    partyName: string;
    type: SideAccountEntryType;
    impact: SideAccountImpact;
    amount: number;
    paidAmount: number;
    description: string;
    notes: string;
    safeId: string;
    dueDate: string;
    newSafeName?: string;
  }) => {
    const amount = Math.abs(Number(input.amount) || 0);
    if (!input.partyName || amount <= 0) return null;

    let safeId = input.safeId;
    let safeDelta = 0;
    let transactionId = '';
    const nowIso = new Date().toISOString();
    const cashMovement = input.type === 'incoming' || input.type === 'outgoing';

    if (input.impact === 'separate_safe' && input.newSafeName?.trim()) {
      const newSafe: Safe = {
        id: uuidv4(),
        name: input.newSafeName.trim(),
        balance: 0,
        isDefault: false,
        type: 'cash'
      };
      safeId = newSafe.id;
      setSafes(prev => [...prev, newSafe]);
    }

    if (cashMovement && input.impact !== 'none') {
      safeDelta = input.type === 'incoming' ? amount : -amount;
      if (!safeId) {
        safeId = safes.find(s => s.isDefault)?.id || safes[0]?.id || '';
      }

      if (safeId) {
        setSafes(prev => prev.map(s => s.id === safeId ? { ...s, balance: s.balance + safeDelta } : s));
      }

      transactionId = uuidv4();
      const transaction: Transaction = {
        id: transactionId,
        type: input.impact === 'capital' ? 'capital' : 'side_account',
        amount: safeDelta,
        description: `${input.impact === 'capital' ? 'رأس مال' : 'حساب جانبي'} - ${input.description || input.partyName}`,
        referenceId: '',
        safeId,
        userId: currentUser?.id || '',
        createdAt: nowIso
      };
      setTransactions(prev => [...prev, transaction]);
    }

    const remaining = Math.max(0, amount - Math.abs(Number(input.paidAmount) || 0));
    const newEntry: SideAccountEntry = {
      id: uuidv4(),
      partyName: input.partyName.trim(),
      type: input.type,
      impact: input.impact,
      amount,
      paidAmount: Math.min(amount, Math.abs(Number(input.paidAmount) || 0)),
      status: input.type === 'receivable' || input.type === 'payable'
        ? (remaining <= 0 ? 'settled' : remaining < amount ? 'partial' : 'open')
        : 'settled',
      description: input.description,
      notes: input.notes,
      safeId,
      safeDelta,
      transactionId,
      userId: currentUser?.id || '',
      createdAt: nowIso,
      dueDate: input.dueDate
    };
    setSideAccountEntries(prev => [...prev, newEntry]);
    return newEntry;
  }, [currentUser, safes, setSafes, setSideAccountEntries, setTransactions]);

  const updateSideAccountEntry = useCallback((
    id: string,
    updates: Partial<Pick<SideAccountEntry, 'paidAmount' | 'status' | 'notes' | 'dueDate'>> & { safeId?: string }
  ) => {
    const entry = sideAccountEntries.find(e => e.id === id);
    if (!entry) return;

    let paidAmount = entry.paidAmount;
    if (updates.paidAmount !== undefined) {
      paidAmount = Math.min(entry.amount, Math.max(0, Number(updates.paidAmount) || 0));
      const delta = Math.round((paidAmount - entry.paidAmount) * 100) / 100;

      // Settling a receivable/payable moves real cash — unlike
      // incoming/outgoing entries, this wasn't recorded against any safe at
      // creation time, so record it now against the chosen (or default) safe.
      if (delta !== 0 && (entry.type === 'receivable' || entry.type === 'payable')) {
        const targetSafeId = updates.safeId || entry.safeId || safes.find(s => s.isDefault)?.id || safes[0]?.id || '';
        if (targetSafeId) {
          // Collecting a receivable = cash in; paying off a payable = cash out.
          const safeDelta = entry.type === 'receivable' ? delta : -delta;
          setSafes(prev => prev.map(s => s.id === targetSafeId ? { ...s, balance: s.balance + safeDelta } : s));

          const transaction: Transaction = {
            id: uuidv4(),
            type: 'side_account',
            amount: safeDelta,
            description: `${entry.type === 'receivable' ? 'تحصيل' : 'سداد'} حساب جانبي - ${entry.partyName}`,
            referenceId: entry.id,
            safeId: targetSafeId,
            userId: currentUser?.id || '',
            createdAt: new Date().toISOString()
          };
          setTransactions(prev => [...prev, transaction]);
        }
      }
    }

    const status = updates.status || (
      entry.type === 'receivable' || entry.type === 'payable'
        ? paidAmount >= entry.amount ? 'settled' : paidAmount > 0 ? 'partial' : 'open'
        : entry.status
    );

    setSideAccountEntries(prev => prev.map(e => (e.id === id ? { ...e, ...updates, paidAmount, status } : e)));
  }, [currentUser, safes, sideAccountEntries, setSafes, setSideAccountEntries, setTransactions]);

  const deleteSideAccountEntry = useCallback((id: string) => {
    const entry = sideAccountEntries.find(e => e.id === id);
    if (!entry) return;

    // Reverse every cash effect this entry ever had:
    //  - the original cash movement (capital / side_account transaction)
    //  - settlement transactions created for receivable/payable entries
    // The original transaction uses entry.transactionId, while each settlement
    // uses referenceId = entry.id, so both are matched here.
    const relatedTransactions = transactions.filter(t =>
      t.id === entry.transactionId || t.referenceId === entry.id
    );
    const deltasBySafe: Record<string, number> = {};
    relatedTransactions.forEach(t => {
      if (t.safeId) deltasBySafe[t.safeId] = (deltasBySafe[t.safeId] || 0) + t.amount;
    });

    if (Object.keys(deltasBySafe).length > 0) {
      setSafes(prev => prev.map(s =>
        deltasBySafe[s.id]
          ? { ...s, balance: Math.round((s.balance - deltasBySafe[s.id]) * 100) / 100 }
          : s
      ));
    }

    if (relatedTransactions.length > 0) {
      const idsToRemove = new Set(relatedTransactions.map(t => t.id));
      setTransactions(prev => prev.filter(t => !idsToRemove.has(t.id)));
    }

    setSideAccountEntries(prev => prev.filter(e => e.id !== id));
  }, [sideAccountEntries, transactions, setSafes, setSideAccountEntries, setTransactions]);

  // Maintenance functions
  const generateTicketNumber = useCallback(() => {
    const year = new Date().getFullYear();
    const count = maintenance.filter(m => m.ticketNumber.includes(year.toString())).length + 1;
    return `MNT-${year}-${count.toString().padStart(3, '0')}`;
  }, [maintenance]);

  const createMaintenance = useCallback((data: Omit<Maintenance, 'id' | 'ticketNumber' | 'status' | 'finalCost' | 'collectedAmount' | 'parts' | 'additionalExpenses' | 'profit' | 'completedAt' | 'deliveredAt'>) => {
    const newMaintenance: Maintenance = {
      ...data,
      id: uuidv4(),
      ticketNumber: generateTicketNumber(),
      status: 'received',
      finalCost: 0,
      collectedAmount: 0,
      parts: [],
      additionalExpenses: 0,
      profit: 0,
      completedAt: '',
      deliveredAt: ''
    };
    setMaintenance(prev => [...prev, newMaintenance]);
    return newMaintenance;
  }, [generateTicketNumber, setMaintenance]);

  const updateMaintenance = useCallback((id: string, updates: Partial<Maintenance>) => {
    setMaintenance(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, [setMaintenance]);

  const addMaintenancePart = useCallback((maintenanceId: string, part: Omit<MaintenancePart, 'id'>) => {
    const newPart: MaintenancePart = { ...part, id: uuidv4() };
    
    setMaintenance(prev => prev.map(m => {
      if (m.id === maintenanceId) {
        return { ...m, parts: [...m.parts, newPart] };
      }
      return m;
    }));

    // Deduct from inventory (use functional update for accuracy)
    if (!part.inventoryId.startsWith('manual-')) {
      setInventory(prev => prev.map(inv =>
        inv.id === part.inventoryId
          ? { ...inv, quantity: Math.max(0, inv.quantity - part.quantity) }
          : inv
      ));
    }

    return newPart;
  }, [setInventory, setMaintenance]);

  const removeMaintenancePart = useCallback((maintenanceId: string, partId: string) => {
    const maint = maintenance.find(m => m.id === maintenanceId);
    const part = maint?.parts.find(p => p.id === partId);
    
    if (part && !part.inventoryId.startsWith('manual-')) {
      // Return to inventory (use functional update for accuracy)
      setInventory(prev => prev.map(inv =>
        inv.id === part.inventoryId
          ? { ...inv, quantity: inv.quantity + part.quantity }
          : inv
      ));
    }

    setMaintenance(prev => prev.map(m => {
      if (m.id === maintenanceId) {
        return { ...m, parts: m.parts.filter(p => p.id !== partId) };
      }
      return m;
    }));
  }, [maintenance, setInventory, setMaintenance]);

  const deliverMaintenance = useCallback((id: string, collectedAmount: number, safeId: string) => {
    const maint = maintenance.find(m => m.id === id);
    if (!maint) return;

    const partsCost = maint.parts.reduce((sum, p) => sum + p.total, 0);
    const profit = collectedAmount - partsCost - maint.additionalExpenses;

    updateMaintenance(id, {
      status: 'delivered',
      collectedAmount,
      finalCost: collectedAmount,
      profit,
      deliveredAt: new Date().toISOString(),
      safeId
    });

    // Update safe balance
    setSafes(prev => prev.map(s => 
      s.id === safeId ? { ...s, balance: s.balance + collectedAmount } : s
    ));

    // Add transaction
    const transaction: Transaction = {
      id: uuidv4(),
      type: 'maintenance',
      amount: collectedAmount,
      description: `صيانة ${maint.ticketNumber}`,
      referenceId: id,
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [...prev, transaction]);
  }, [maintenance, currentUser, updateMaintenance, setSafes, setTransactions]);

  // Safe functions
  const addSafe = useCallback((safe: Omit<Safe, 'id'>) => {
    const newSafe: Safe = { ...safe, id: uuidv4() };
    setSafes(prev => [...prev, newSafe]);
    return newSafe;
  }, [setSafes]);

  // Transaction functions (for manual income/expense)
  const deleteSafe = useCallback((id: string): { ok: boolean; error?: string } => {
    if (currentUser?.role !== 'admin') {
      return { ok: false, error: 'حذف الخزانة متاح لمدير النظام فقط' };
    }

    const safe = safes.find(s => s.id === id);
    if (!safe) return { ok: false, error: 'الخزنة غير موجودة' };
    if (safe.isDefault) return { ok: false, error: 'لا يمكن حذف الخزنة الافتراضية' };
    if (safes.length <= 1) return { ok: false, error: 'لا يمكن حذف آخر خزنة في النظام' };
    if ((safe.balance || 0) !== 0) {
      return { ok: false, error: 'رصيد الخزنة غير صفري — حوّل الرصيد إلى خزنة أخرى أو صفّره أولاً' };
    }
    const hasHistory = transactions.some(t => t.safeId === id)
      || sideAccountEntries.some(e => e.safeId === id);
    if (hasHistory) {
      return { ok: false, error: 'توجد حركات أو حسابات جانبية مرتبطة بهذه الخزنة — لا يمكن حذفها للحفاظ على السجلات المالية' };
    }

    setSafes(prev => prev.filter(s => s.id !== id));
    return { ok: true };
  }, [currentUser, safes, transactions, sideAccountEntries, setSafes]);

  const addTransaction = useCallback((
    type: 'income' | 'expense',
    amount: number,
    description: string,
    safeId: string
  ) => {
    const finalAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    
    const transaction: Transaction = {
      id: uuidv4(),
      type,
      amount: finalAmount,
      description,
      referenceId: '',
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [...prev, transaction]);

    // Update safe balance
    setSafes(prev => prev.map(s => 
      s.id === safeId ? { ...s, balance: s.balance + finalAmount } : s
    ));

    return transaction;
  }, [currentUser, setTransactions, setSafes]);

  const deleteTransaction = useCallback((id: string) => {
    const trans = transactions.find(t => t.id === id);
    if (trans && (trans.type === 'income' || trans.type === 'expense')) {
      // Reverse the effect on safe balance
      setSafes(prev => prev.map(s => 
        s.id === trans.safeId ? { ...s, balance: s.balance - trans.amount } : s
      ));
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, [transactions, setSafes, setTransactions]);

  const transferBetweenSafes = useCallback((fromId: string, toId: string, amount: number) => {
    setSafes(prev => prev.map(s => {
      if (s.id === fromId) return { ...s, balance: s.balance - amount };
      if (s.id === toId) return { ...s, balance: s.balance + amount };
      return s;
    }));

    // Add transactions
    const timestamp = new Date().toISOString();
    setTransactions(prev => [
      ...prev,
      {
        id: uuidv4(),
        type: 'transfer',
        amount: -amount,
        description: 'تحويل للخزنة أخرى',
        referenceId: '',
        safeId: fromId,
        userId: currentUser?.id || '',
        createdAt: timestamp
      },
      {
        id: uuidv4(),
        type: 'transfer',
        amount,
        description: 'تحويل من خزنة أخرى',
        referenceId: '',
        safeId: toId,
        userId: currentUser?.id || '',
        createdAt: timestamp
      }
    ]);
  }, [currentUser, setSafes, setTransactions]);

  // ── Notifications engine ────────────────────────────────────────────────
  // Alerts derived from the shop's real data (low stock, expiring warranties,
  // delayed repairs, outstanding debts). Ids are deterministic, so the merge
  // below can diff the stored list against the live one: new alerts appear,
  // alerts whose condition was fixed disappear on their own, and the
  // read/dismissed state of the survivors is preserved.
  const autoAlerts = useMemo(
    () => buildAutoNotifications({ inventory, imeiUnits, maintenance, customers }),
    [inventory, imeiUnits, maintenance, customers]
  );

  useEffect(() => {
    if (notificationsLoading) return;
    // `mergeAutoNotifications` returns the very same array reference when
    // nothing actually changed, which keeps this effect from looping.
    const next = mergeAutoNotifications(notifications, autoAlerts);
    if (next !== notifications) setNotifications(next);
  }, [autoAlerts, notifications, notificationsLoading, setNotifications]);

  const markNotificationAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, [setNotifications]);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, [setNotifications]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.flatMap(n => {
      if (n.id !== id) return [n];
      // Auto alerts are kept but flagged dismissed, so the engine will not
      // resurrect them while their condition still holds. Anything else
      // (imported/legacy rows) is removed for good.
      return n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : [];
    }));
  }, [setNotifications]);

  const clearAllNotifications = useCallback(() => {
    setNotifications(prev => prev.flatMap(n =>
      n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : []
    ));
  }, [setNotifications]);

  // Statistics
  const getStatistics = useMemo(() => {
    const today = new Date();
    // Compare by LOCAL calendar day — using toISOString() here would shift
    // the day boundary by the timezone offset and corrupt "today" stats.
    const isSameLocalDay = (iso: string) => {
      const d = new Date(iso);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    };

    const todaySales = sales.filter(s => isSameLocalDay(s.createdAt));
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthSales = sales.filter(s => new Date(s.createdAt) >= monthStart);
    const monthRevenue = monthSales.reduce((sum, s) => sum + s.total, 0);
    const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);

    const returnRefunds = saleReturns.reduce((sum, saleReturn) => sum + saleReturn.refundAmount, 0);
    const wasteCost = stockWastes.reduce((sum, waste) => sum + waste.totalCost, 0);

    const totalSafesBalance = safes.reduce((sum, s) => sum + s.balance, 0);

    const availableIMEI = imeiUnits.filter(u => u.status === 'available').length;
    const soldIMEI = imeiUnits.filter(u => u.status === 'sold').length;

    const pendingMaintenance = maintenance.filter(m => m.status === 'received' || m.status === 'in_progress').length;
    const completedMaintenance = maintenance.filter(m => m.status === 'delivered').length;

    // Low stock uses the same "real quantity" rule as the Inventory page: for
    // device templates the stock is the number of available IMEI units, not the
    // template's `quantity` field (which is 0 for IMEI products).
    const lowStockItems = inventory
      .filter(i => {
        const realQuantity = i.hasIMEI
          ? imeiUnits.filter(u => u.inventoryId === i.id && u.status === 'available').length
          : i.quantity;
        return realQuantity <= i.minQuantity;
      })
      .map(i => {
        const realQuantity = i.hasIMEI
          ? imeiUnits.filter(u => u.inventoryId === i.id && u.status === 'available').length
          : i.quantity;
        return { ...i, realQuantity };
      });

    const expiringWarranties = imeiUnits.filter(u => {
      if (!u.warrantyEndDate || u.status !== 'sold') return false;
      const warrantyDate = new Date(u.warrantyEndDate);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      return warrantyDate <= thirtyDaysFromNow && warrantyDate >= today;
    });

    return {
      todaySales: todaySales.length,
      todayRevenue,
      todayProfit,
      monthSales: monthSales.length,
      monthRevenue,
      monthProfit,
      netMonthRevenue: monthRevenue - returnRefunds,
      netMonthProfit: monthProfit - returnRefunds - wasteCost,
      totalSafesBalance,
      availableIMEI,
      soldIMEI,
      pendingMaintenance,
      completedMaintenance,
      lowStockItems,
      expiringWarranties,
      totalCustomers: customers.length,
      returnRefunds,
      wasteCost,
      returnCount: saleReturns.length,
      wasteCount: stockWastes.length
    };
  }, [sales, saleReturns, stockWastes, safes, imeiUnits, maintenance, inventory, customers]);

  // Reset all data — atomically replace every store with defaults
  const resetAllData = useCallback(async () => {
    const defaultData = {
      users: initialUsers,
      customers: initialCustomers,
      categories: initialCategories,
      inventory: initialInventory,
      imeiUnits: initialIMEIUnits,
      sales: initialSales,
      saleReturns: initialSaleReturns,
      maintenance: initialMaintenance,
      safes: initialSafes,
      transactions: initialTransactions,
      suppliers: initialSuppliers,
      stockWastes: initialStockWastes,
      inventoryAudits: initialInventoryAudits,
      sideAccountEntries: initialSideAccountEntries,
      notifications: initialNotifications,
    };

    // Atomically clear + repopulate each store (guaranteed clean slate)
    await indexedDBUtils.resetAllStores(defaultData);
  }, []);

  return {
    // Loading state
    isLoading,

    // State
    users,
    currentUser,
    customers,
    categories,
    inventory,
    imeiUnits,
    sales,
    saleReturns,
    maintenance,
    safes,
    transactions,
    suppliers,
    stockWastes,
    inventoryAudits,
    sideAccountEntries,
    notifications,
    isDarkMode,
    appSettings,

    // Setters
    setUsers,
    setCurrentUser,
    setCustomers,
    setCategories,
    setInventory,
    setImeiUnits,
    setSales,
    setSaleReturns,
    setMaintenance,
    setSafes,
    setTransactions,
    setSuppliers,
    setStockWastes,
    setInventoryAudits,
    setSideAccountEntries,
    setNotifications,
    setIsDarkMode,
    setAppSettings,

    // Auth
    login,
    logout,
    changePassword,

    // Customers
    addCustomer,
    updateCustomer,
    deleteCustomer,
    recordCustomerPayment,
    recordWalletTransaction,

    // Categories
    addCategory,

    // Inventory
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,

    // IMEI
    addIMEIUnit,
    updateIMEIUnit,
    deleteIMEIUnit,
    findIMEIByNumber,
    getIMEIHistory,

    // Sales
    generateInvoiceNumber,
    createSale,
    processSaleReturn,

    // Waste
    recordStockWaste,

    // Inventory audits
    createInventoryAudit,
    applyInventoryAudit,
    deleteInventoryAudit,

    // Side accounts
    addSideAccountEntry,
    updateSideAccountEntry,
    deleteSideAccountEntry,

    // Maintenance
    generateTicketNumber,
    createMaintenance,
    updateMaintenance,
    addMaintenancePart,
    removeMaintenancePart,
    deliverMaintenance,

    // Safes
    addSafe,
    deleteSafe,
    transferBetweenSafes,

    // Transactions
    addTransaction,
    deleteTransaction,

    // Notifications
    markNotificationAsRead,
    markAllNotificationsAsRead,
    dismissNotification,
    clearAllNotifications,

    // Stats
    getStatistics,

    // Utils
    resetAllData
  };
}
