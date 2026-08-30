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
import { buildImeiStockIndex } from '../utils/stockCounts';

const MAX_TEXT_LENGTH = 2_000;
/** نافذة تنبيه الضمان — نفس قيمة محرك التنبيهات (alerts.ts). */
const WARRANTY_ALERT_DAYS = 30;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const validText = (value: unknown, max = MAX_TEXT_LENGTH): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

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

  // Components receive validated collection updates rather than the raw
  // IndexedDB setters. This keeps identity, roles, balances, and references
  // protected even when a UI callback is called with forged data.
  const updateUsers = useCallback((nextUsers: User[]) => {
    if (!Array.isArray(nextUsers) || nextUsers.length === 0) return;
    const ids = new Set<string>();
    const usernames = new Set<string>();
    if (!nextUsers.every(user => {
      if (!user || !validText(user.id, 200) || !validText(user.username, 100) || !validText(user.name, 200) ||
          typeof user.password !== 'string' || user.password.length > 20_000 ||
          !['admin', 'manager', 'staff'].includes(user.role) || typeof user.createdAt !== 'string' ||
          ids.has(user.id) || usernames.has(user.username.toLowerCase())) return false;
      ids.add(user.id); usernames.add(user.username.toLowerCase());
      return true;
    }) || !nextUsers.some(user => user.role === 'admin')) return;
    if (currentUser) {
      const updatedCurrent = nextUsers.find(user => user.id === currentUser.id);
      if (!updatedCurrent || updatedCurrent.role !== currentUser.role) return;
      setCurrentUser(updatedCurrent);
    }
    setUsers(nextUsers);
  }, [currentUser, setCurrentUser, setUsers]);

  const updateSuppliers = useCallback((nextSuppliers: Supplier[]) => {
    if (!Array.isArray(nextSuppliers)) return;
    const ids = new Set<string>();
    const currentIds = new Set(nextSuppliers.map(s => s.id));
    if (!nextSuppliers.every(supplier => {
      if (!supplier || !validText(supplier.id, 200) || !validText(supplier.name, 200) ||
          typeof supplier.phone !== 'string' || supplier.phone.length > 50 || typeof supplier.address !== 'string' ||
          !isFiniteNumber(supplier.balance) || ids.has(supplier.id)) return false;
      ids.add(supplier.id);
      return true;
    })) return;
    // Never allow removing a supplier referenced by a stock-waste record.
    if (suppliers.some(s => !currentIds.has(s.id) && stockWastes.some(w => w.supplierId === s.id))) return;
    const normalized = nextSuppliers.map(supplier => {
      const existing = suppliers.find(s => s.id === supplier.id);
      return {
        ...supplier,
        name: supplier.name.trim(), phone: supplier.phone.trim(), address: supplier.address.trim(),
        // Supplier balances are derived from purchasing/ledger operations.
        balance: existing ? existing.balance : 0,
      };
    });
    setSuppliers(normalized);
  }, [setSuppliers, stockWastes, suppliers]);

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
    if (!newPassword || newPassword.length < 6 || newPassword.length > 512) {
      return { ok: false, error: 'كلمة المرور الجديدة يجب أن تكون بين 6 و512 حرفاً' };
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
    const name = customer.name?.trim();
    const phone = customer.phone?.trim();
    if (!validText(name, 200) || !validText(phone, 50) || (customer.address || '').length > MAX_TEXT_LENGTH) {
      return null;
    }
    if (customers.some(c => c.phone.trim() === phone)) return null;

    const newCustomer: Customer = {
      name,
      phone,
      address: (customer.address || '').trim(),
      id: uuidv4(),
      balance: 0,
      createdAt: new Date().toISOString()
    };
    setCustomers(prev => [...prev, newCustomer]);
    return newCustomer;
  }, [customers, setCustomers]);

  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    const name = updates.name?.trim();
    const phone = updates.phone?.trim();
    if (updates.name !== undefined && !validText(name, 200)) return;
    if (updates.phone !== undefined && !validText(phone, 50)) return;
    if (updates.address !== undefined && updates.address.length > MAX_TEXT_LENGTH) return;
    if (phone && customers.some(c => c.id !== id && c.phone.trim() === phone)) return;

    // Balance, identity, and creation time are ledger-owned fields. They must
    // never be writable from an edit form or an untrusted caller.
    const safeUpdates: Partial<Customer> = {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(updates.address !== undefined ? { address: updates.address.trim() } : {}),
    };
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...safeUpdates } : c));
  }, [customers, setCustomers]);

  const deleteCustomer = useCallback((id: string): { ok: boolean; error?: string } => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return { ok: false, error: 'العميل غير موجود' };
    if ((customer.balance || 0) !== 0 || sales.some(s => s.customerId === id) || imeiUnits.some(u => u.customerId === id)) {
      return { ok: false, error: 'لا يمكن حذف عميل له رصيد أو فواتير أو أجهزة مرتبطة؛ للحفاظ على السجل المالي' };
    }
    setCustomers(prev => prev.filter(c => c.id !== id));
    return { ok: true };
  }, [customers, sales, imeiUnits, setCustomers]);

  const recordCustomerPayment = useCallback((customerId: string, amount: number, safeId: string, notes: string) => {
    const customer = customers.find(c => c.id === customerId);
    const safe = safes.find(s => s.id === safeId);
    if (!customer || !safe || !isFiniteNumber(amount) || amount <= 0 || amount > Math.max(0, customer.balance || 0)) return null;
    const safeNotes = typeof notes === 'string' ? notes.slice(0, MAX_TEXT_LENGTH) : '';

    // Decrease customer debt
    setCustomers(prev => prev.map(c => 
      c.id === customerId ? { ...c, balance: roundMoney(Math.max(0, (c.balance || 0) - amount)) } : c
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
      description: `دفعة من حساب العميل${safeNotes ? ` - ${safeNotes}` : ''}`,
      referenceId: customerId,
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [...prev, transaction]);
    return transaction;
  }, [currentUser, customers, safes, setCustomers, setSafes, setTransactions]);

  const recordWalletTransaction = useCallback((
    type: 'deposit' | 'withdrawal',
    amount: number,
    fee: number,
    cost: number,
    walletId: string,
    cashSafeId: string,
    notes: string
  ) => {
    const wallet = safes.find(s => s.id === walletId);
    const cashSafe = safes.find(s => s.id === cashSafeId);
    if (!wallet || !cashSafe || !isFiniteNumber(amount) || amount <= 0 || !isFiniteNumber(fee) || fee < 0 ||
        fee > amount || !isFiniteNumber(cost) || cost < 0 || typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH) return null;
    const walletOut = type === 'deposit' ? amount + cost : 0;
    const cashOut = type === 'withdrawal' ? amount - fee : 0;
    if ((type === 'deposit' && wallet.balance < walletOut) ||
        (type === 'withdrawal' && (wallet.balance < amount || cashSafe.balance < cashOut))) return null;
    const profit = roundMoney(fee - cost);

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
  }, [currentUser, safes, setSafes, setTransactions]);

  // Category functions
  const addCategory = useCallback((category: Omit<Category, 'id'>) => {
    if (!validText(category.name, 200) || !['device', 'accessory', 'spare_part'].includes(category.type)) return null;
    if (categories.some(c => c.name.trim().toLowerCase() === category.name.trim().toLowerCase())) return null;
    const newCategory: Category = { name: category.name.trim(), type: category.type, id: uuidv4() };
    setCategories(prev => [...prev, newCategory]);
    return newCategory;
  }, [categories, setCategories]);

  // Inventory functions
  //
  // الدالة كانت بترجع null في كل حالات الرفض من غير ما تفرّق بينهم، وصفحة
  // المخزون كانت بتتجاهل القيمة وترجّع الفورم — يعني المنتج بيضيع من غير أي
  // رسالة («الإضافة علّقت»). بقى فيه سبب صريح يرجع مع الرفض، والكود بقى
  // اختياريًا يتولّد تلقائيًا زي ما يعمل شاشة POS.
  const normalizeCode = (value: unknown): string => String(value ?? '').trim().toLowerCase();
  const generateProductCode = useCallback((): string => {
    const taken = new Set(inventory.map(i => normalizeCode(i.code)));
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = `P-${Date.now().toString(36).slice(-5)}${attempt ? '-' + attempt : ''}`.toUpperCase();
      if (!taken.has(normalizeCode(candidate))) return candidate;
    }
    return `P-${Date.now().toString(36).toUpperCase()}`;
  }, [inventory]);

  const addInventoryItem = useCallback((item: Omit<InventoryItem, 'id' | 'createdAt'>): InventoryItem | null => {
    const trimmedName = typeof item.name === 'string' ? item.name.trim() : '';
    const trimmedCode = typeof item.code === 'string' ? item.code.trim() : '';
    const trimmedBarcode = typeof item.barcode === 'string' ? item.barcode.trim() : '';
    const finalCode = trimmedCode || generateProductCode();

    if (!validText(trimmedName, 200)) return null;
    if (!validText(finalCode, 100) || trimmedBarcode.length > 100) return null;
    if (!categories.some(c => c.id === item.categoryId)) return null;
    if (!isFiniteNumber(item.costPrice) || item.costPrice < 0 || !isFiniteNumber(item.sellPrice) || item.sellPrice < 0) return null;
    if (!Number.isInteger(item.quantity) || item.quantity < 0 || !Number.isInteger(item.minQuantity) || item.minQuantity < 0) return null;
    if (typeof item.hasIMEI !== 'boolean') return null;
    if (item.hasIMEI && item.quantity !== 0) return null;

    // مقارنة موحّدة (trim + حالة واحدة) للباركود والكود — كانت الباركود
    // بتتقارن خام فالفرق بمسافة واحدة يعدي من الواجهة ويرفض في المتجر بصمت.
    const normalizedCode = normalizeCode(finalCode);
    const duplicate = inventory.find(i =>
      normalizeCode(i.code) === normalizedCode ||
      (trimmedBarcode && normalizeCode(i.barcode) === normalizeCode(trimmedBarcode))
    );
    if (duplicate) return null;

    const newItem: InventoryItem = {
      ...item,
      name: trimmedName, code: finalCode, barcode: trimmedBarcode,
      costPrice: roundMoney(item.costPrice), sellPrice: roundMoney(item.sellPrice),
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    setInventory(prev => [...prev, newItem]);
    return newItem;
  }, [categories, generateProductCode, inventory, setInventory]);

  // كانت الترجّع undefined في كل حالات الرفض، فالتعديل كان «مابيحفظش» من غير
  // أي سبب واضح. بترجع دلوقتي ok/error نفس شكل deleteInventoryItem.
  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>): { ok: boolean; error?: string } => {
    const existing = inventory.find(i => i.id === id);
    if (!existing) return { ok: false, error: 'المنتج غير موجود' };
    if (updates.name !== undefined && !validText(updates.name, 200)) return { ok: false, error: 'اسم المنتج مطلوب (200 حرف كحد أقصى)' };
    if (updates.code !== undefined && !validText(updates.code, 100)) return { ok: false, error: 'الكود مطلوب (100 حرف كحد أقصى)' };
    if (updates.barcode !== undefined && (typeof updates.barcode !== 'string' || updates.barcode.length > 100)) return { ok: false, error: 'الباركود طويل جدًا (100 حرف كحد أقصى)' };
    if (updates.categoryId !== undefined && !categories.some(c => c.id === updates.categoryId)) return { ok: false, error: 'اختر فئة صحيحة' };
    for (const value of [updates.costPrice, updates.sellPrice, updates.quantity, updates.minQuantity]) {
      if (value !== undefined && (!isFiniteNumber(value) || value < 0)) return { ok: false, error: 'لا يمكن أن تكون الأسعار أو الكميات بقيم سالبة أو غير رقمية' };
    }
    if (updates.quantity !== undefined && !Number.isInteger(updates.quantity)) return { ok: false, error: 'الكمية يجب أن تكون عددًا صحيحًا' };
    if (updates.minQuantity !== undefined && !Number.isInteger(updates.minQuantity)) return { ok: false, error: 'حد الطلب يجب أن يكون عددًا صحيحًا' };
    if (existing.hasIMEI && updates.quantity !== undefined && updates.quantity !== 0) return { ok: false, error: 'كمية منتجات الـ IMEI تُحسب من الوحدات، عدّلها من شاشة IMEI' };
    if (updates.hasIMEI === true && (updates.quantity ?? existing.quantity) !== 0) return { ok: false, error: 'تحويل منتج إلى IMEI يتطلب أن تكون الكمية صفرًا' };
    if (updates.hasIMEI === false && existing.hasIMEI && imeiUnits.some(u => u.inventoryId === id)) return { ok: false, error: 'لا يمكن إلغاء خاصية IMEI والمنتج له وحدات مسجلة' };
    if (updates.code && inventory.some(i => i.id !== id && normalizeCode(i.code) === normalizeCode(updates.code))) {
      return { ok: false, error: 'هذا الكود مستخدم بالفعل في منتج آخر' };
    }
    if (updates.barcode && inventory.some(i => i.id !== id && normalizeCode(i.barcode) === normalizeCode(updates.barcode))) {
      return { ok: false, error: 'هذا الباركود مستخدم بالفعل في منتج آخر' };
    }

    const safeUpdates: Partial<InventoryItem> = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.createdAt;
    if (safeUpdates.name) safeUpdates.name = safeUpdates.name.trim();
    if (safeUpdates.code) safeUpdates.code = safeUpdates.code.trim();
    if (safeUpdates.barcode !== undefined) safeUpdates.barcode = safeUpdates.barcode.trim();
    if (safeUpdates.costPrice !== undefined) safeUpdates.costPrice = roundMoney(safeUpdates.costPrice);
    if (safeUpdates.sellPrice !== undefined) safeUpdates.sellPrice = roundMoney(safeUpdates.sellPrice);
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...safeUpdates } : i));
    return { ok: true };
  }, [categories, inventory, setInventory]);

  const deleteInventoryItem = useCallback((id: string): { ok: boolean; error?: string } => {
    if (imeiUnits.some(u => u.inventoryId === id) || sales.some(s => s.items.some(i => i.inventoryId === id)) ||
        maintenance.some(m => m.parts.some(p => p.inventoryId === id))) {
      return { ok: false, error: 'لا يمكن حذف منتج مرتبط بفواتير أو أجهزة IMEI أو صيانة' };
    }
    setInventory(prev => prev.filter(i => i.id !== id));
    return { ok: true };
  }, [imeiUnits, sales, maintenance, setInventory]);

  // IMEI functions
  const addIMEIUnit = useCallback((unit: Omit<IMEIUnit, 'id' | 'createdAt'>) => {
    const inventoryItem = inventory.find(i => i.id === unit.inventoryId);
    const imei1 = unit.imei1?.trim();
    const imei2 = unit.imei2?.trim() || '';
    const statuses: IMEIUnit['status'][] = ['available', 'sold', 'returned', 'maintenance', 'wasted'];
    if (!inventoryItem?.hasIMEI || !validText(imei1, 40) || imei1 === imei2 ||
        (imei2 && imei2.length > 40) || !statuses.includes(unit.status) ||
        !isFiniteNumber(unit.purchasePrice) || unit.purchasePrice < 0 ||
        imeiUnits.some(u => u.imei1 === imei1 || u.imei2 === imei1 || (imei2 && (u.imei1 === imei2 || u.imei2 === imei2)))) return null;
    const newUnit: IMEIUnit = {
      ...unit,
      imei1, imei2,
      purchasePrice: roundMoney(unit.purchasePrice),
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    setImeiUnits(prev => [...prev, newUnit]);
    return newUnit;
  }, [inventory, imeiUnits, setImeiUnits]);

  const updateIMEIUnit = useCallback((id: string, updates: Partial<IMEIUnit>) => {
    const existing = imeiUnits.find(u => u.id === id);
    if (!existing) return;
    if (updates.inventoryId !== undefined && !inventory.some(i => i.id === updates.inventoryId && i.hasIMEI)) return;
    if (updates.imei1 !== undefined && !validText(updates.imei1, 40)) return;
    if (updates.imei2 !== undefined && updates.imei2.length > 40) return;
    if (updates.purchasePrice !== undefined && (!isFiniteNumber(updates.purchasePrice) || updates.purchasePrice < 0)) return;
    if (updates.imei1 && imeiUnits.some(u => u.id !== id && (u.imei1 === updates.imei1 || u.imei2 === updates.imei1))) return;
    if (updates.imei2 && imeiUnits.some(u => u.id !== id && (u.imei1 === updates.imei2 || u.imei2 === updates.imei2))) return;
    const safeUpdates = { ...updates, ...(updates.purchasePrice !== undefined ? { purchasePrice: roundMoney(updates.purchasePrice) } : {}) };
    delete safeUpdates.id;
    delete safeUpdates.createdAt;
    setImeiUnits(prev => prev.map(u => u.id === id ? { ...u, ...safeUpdates } : u));
  }, [imeiUnits, inventory, setImeiUnits]);

  const deleteIMEIUnit = useCallback((id: string): { ok: boolean; error?: string } => {
    const unit = imeiUnits.find(u => u.id === id);
    if (!unit) return { ok: false, error: 'وحدة IMEI غير موجودة' };
    if (unit.status === 'sold' || sales.some(s => s.items.some(i => i.imeiUnitId === id))) {
      return { ok: false, error: 'لا يمكن حذف جهاز تم بيعه؛ استخدم المرتجع للحفاظ على السجل' };
    }
    setImeiUnits(prev => prev.filter(u => u.id !== id));
    return { ok: true };
  }, [imeiUnits, sales, setImeiUnits]);

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
  ): Sale | null => {
    if (!Array.isArray(items) || items.length === 0 || !isFiniteNumber(discount) || discount < 0 ||
        !isFiniteNumber(paidAmount) || paidAmount < 0 || !['cash', 'card', 'installment'].includes(paymentMethod)) return null;

    const customer = customerId ? customers.find(c => c.id === customerId) : undefined;
    const safe = safes.find(s => s.id === safeId);
    if ((customerId && !customer) || !safe || typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH) return null;

    const quantitiesToDeduct: Record<string, number> = {};
    const usedIMEI = new Set<string>();
    const saleItems: SaleItem[] = [];
    for (const item of items) {
      const inventoryItem = inventory.find(inv => inv.id === item.inventoryId);
      if (!inventoryItem || !isPositiveInteger(item.quantity) || !isFiniteNumber(item.unitPrice) || item.unitPrice < 0) return null;

      if (item.imeiUnitId) {
        const unit = imeiUnits.find(u => u.id === item.imeiUnitId);
        if (!inventoryItem.hasIMEI || item.quantity !== 1 || !unit || unit.inventoryId !== inventoryItem.id ||
            unit.status !== 'available' || usedIMEI.has(unit.id)) return null;
        usedIMEI.add(unit.id);
      } else {
        if (inventoryItem.hasIMEI) return null;
        quantitiesToDeduct[inventoryItem.id] = (quantitiesToDeduct[inventoryItem.id] || 0) + item.quantity;
      }

      const costPrice = item.imeiUnitId
        ? imeiUnits.find(u => u.id === item.imeiUnitId)?.purchasePrice || 0
        : inventoryItem.costPrice;
      const total = roundMoney(item.unitPrice * item.quantity);
      if (!isFiniteNumber(costPrice) || costPrice < 0 || !isFiniteNumber(total)) return null;
      saleItems.push({
        id: uuidv4(),
        inventoryId: inventoryItem.id,
        imeiUnitId: item.imeiUnitId,
        quantity: item.quantity,
        unitPrice: roundMoney(item.unitPrice),
        costPrice: roundMoney(costPrice),
        total,
        returnedQuantity: 0,
      });
    }

    for (const [inventoryId, quantity] of Object.entries(quantitiesToDeduct)) {
      const item = inventory.find(inv => inv.id === inventoryId);
      if (!item || quantity > item.quantity) return null;
    }

    const subtotal = roundMoney(saleItems.reduce((sum, item) => sum + item.total, 0));
    if (discount > subtotal) return null;
    const total = roundMoney(subtotal - discount);
    if (paidAmount > total) return null;
    const remaining = roundMoney(total - paidAmount);
    if (remaining > 0 && !customer) return null;
    const profit = roundMoney(saleItems.reduce((sum, item) => sum + (item.total - item.costPrice * item.quantity), 0) - discount);

    const newSale: Sale = {
      id: uuidv4(),
      invoiceNumber: generateInvoiceNumber(),
      customerId,
      items: saleItems,
      subtotal,
      discount: roundMoney(discount),
      total,
      paid: roundMoney(paidAmount),
      remaining,
      profit,
      paymentMethod,
      cashierId: currentUser?.id || '',
      safeId,
      notes: notes.slice(0, MAX_TEXT_LENGTH),
      createdAt: new Date().toISOString()
    };

    // The validations above run against one snapshot and the functional state
    // updates below preserve each individual write. UI double-submit is
    // guarded separately, while this layer prevents negative stock and stale
    // IMEI units from being recorded in the first place.
    saleItems.forEach(item => {
      if (item.imeiUnitId) {
        updateIMEIUnit(item.imeiUnitId, {
          status: 'sold', saleId: newSale.id, customerId
        });
      }
    });
    setInventory(prev => prev.map(inv => {
      const deduct = quantitiesToDeduct[inv.id];
      return deduct ? { ...inv, quantity: inv.quantity - deduct } : inv;
    }));
    setSafes(prev => prev.map(s => s.id === safeId ? { ...s, balance: roundMoney(s.balance + paidAmount) } : s));

    if (remaining > 0 && customerId) {
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, balance: roundMoney((c.balance || 0) + remaining) } : c));
    }

    if (paidAmount > 0) {
      const transaction: Transaction = {
        id: uuidv4(), type: 'sale', amount: roundMoney(paidAmount),
        description: `فاتورة بيع ${newSale.invoiceNumber}`,
        referenceId: newSale.id, safeId, userId: currentUser?.id || '',
        createdAt: newSale.createdAt
      };
      setTransactions(prev => [...prev, transaction]);
    }
    setSales(prev => [...prev, newSale]);
    return newSale;
  }, [currentUser, customers, generateInvoiceNumber, imeiUnits, inventory, safes, setCustomers, setInventory, setImeiUnits, setSafes, setSales, setTransactions, updateIMEIUnit]);

  const processSaleReturn = useCallback((
    saleId: string,
    saleItemId: string,
    quantity: number,
    reason: string
  ) => {
    const sale = sales.find(s => s.id === saleId);
    const saleItem = sale?.items.find(item => item.id === saleItemId);
    if (!sale || !saleItem || !isPositiveInteger(quantity) || typeof reason !== 'string' || reason.length > MAX_TEXT_LENGTH ||
        !isFiniteNumber(sale.total) || sale.total < 0 || !isFiniteNumber(sale.subtotal) || sale.subtotal < 0 ||
        !isFiniteNumber(sale.discount) || sale.discount < 0 || !isFiniteNumber(sale.paid) || sale.paid < 0 ||
        !isFiniteNumber(saleItem.total) || saleItem.total < 0 || !isPositiveInteger(saleItem.quantity)) return null;

    const alreadyReturned = saleItem.returnedQuantity || 0;
    if (!Number.isInteger(alreadyReturned) || alreadyReturned < 0 || alreadyReturned > saleItem.quantity) return null;
    const returnableQuantity = saleItem.quantity - alreadyReturned;
    if (quantity > returnableQuantity) return null;
    if (saleItem.imeiUnitId && quantity !== 1) return null;

    // Allocate the invoice discount proportionally. The previous code refunded
    // the pre-discount line total, which inflated both cash refunds and debt
    // forgiveness whenever an invoice had a discount.
    const grossRefund = roundMoney((saleItem.total / saleItem.quantity) * quantity);
    const discountShare = sale.subtotal > 0 ? roundMoney(sale.discount * grossRefund / sale.subtotal) : 0;
    const refundAmount = roundMoney(Math.max(0, grossRefund - discountShare));
    const paidRatio = sale.total > 0 ? Math.min(1, Math.max(0, sale.paid / sale.total)) : 0;
    const cashRefund = roundMoney(refundAmount * paidRatio);
    const debtForgiven = roundMoney(refundAmount - cashRefund);
    if (cashRefund > 0 && !safes.some(s => s.id === sale.safeId)) return null;
    const now = new Date().toISOString();
    const returnRecord: SaleReturn = {
      id: uuidv4(), saleId, saleItemId, inventoryId: saleItem.inventoryId,
      imeiUnitId: saleItem.imeiUnitId, quantity, refundAmount: cashRefund,
      reason: reason.trim(), createdAt: now, processedBy: currentUser?.id || ''
    };

    setSaleReturns(prev => [...prev, returnRecord]);
    setSales(prev => prev.map(s => {
      if (s.id !== saleId) return s;
      return {
        ...s,
        subtotal: roundMoney(Math.max(0, s.subtotal - grossRefund)),
        discount: roundMoney(Math.max(0, s.discount - discountShare)),
        total: roundMoney(Math.max(0, s.total - refundAmount)),
        paid: roundMoney(Math.max(0, s.paid - cashRefund)),
        remaining: roundMoney(Math.max(0, s.remaining - debtForgiven)),
        profit: roundMoney(s.profit - (grossRefund - saleItem.costPrice * quantity - discountShare)),
        items: s.items.map(item => item.id === saleItemId
          ? { ...item, returnedQuantity: (item.returnedQuantity || 0) + quantity } : item)
      };
    }));

    if (saleItem.imeiUnitId) {
      updateIMEIUnit(saleItem.imeiUnitId, { status: 'available', saleId: '', customerId: '' });
    } else {
      setInventory(prev => prev.map(inv => inv.id === saleItem.inventoryId
        ? { ...inv, quantity: inv.quantity + quantity } : inv));
    }

    if (cashRefund > 0) {
      setSafes(prev => prev.map(s => s.id === sale.safeId
        ? { ...s, balance: roundMoney(s.balance - cashRefund) } : s));
      setTransactions(prev => [...prev, {
        id: uuidv4(), type: 'return', amount: -cashRefund,
        description: `مرتجع ${sale.invoiceNumber}`, referenceId: returnRecord.id,
        safeId: sale.safeId, userId: currentUser?.id || '', createdAt: now
      }]);
    }
    if (debtForgiven > 0 && sale.customerId) {
      setCustomers(prev => prev.map(c => c.id === sale.customerId
        ? { ...c, balance: roundMoney(Math.max(0, c.balance - debtForgiven)) } : c));
    }
    return returnRecord;
  }, [currentUser, safes, sales, setCustomers, setInventory, setSaleReturns, setSales, setSafes, setTransactions, updateIMEIUnit]);

  const recordStockWaste = useCallback((
    inventoryId: string,
    quantity: number,
    supplierId: string,
    reason: string,
    notes: string
  ) => {
    const item = inventory.find(inv => inv.id === inventoryId);
    if (!item || !isPositiveInteger(quantity) || quantity > (item.hasIMEI ? imeiUnits.filter(u => u.inventoryId === inventoryId && u.status === 'available').length : item.quantity) ||
        typeof supplierId !== 'string' || typeof reason !== 'string' || reason.length > MAX_TEXT_LENGTH ||
        typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH ||
        (supplierId && !suppliers.some(s => s.id === supplierId))) return null;

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
  }, [currentUser, imeiUnits, inventory, setInventory, setStockWastes, setTransactions, suppliers, updateIMEIUnit]);

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
    if (!validText(title, 200) || !Array.isArray(rows) || rows.length === 0 || typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH) return null;
    const rowIds = new Set<string>();
    if (!rows.every(row => {
      if (!row || !inventory.some(inv => inv.id === row.inventoryId) || rowIds.has(row.inventoryId) ||
          !Number.isInteger(row.countedQuantity) || row.countedQuantity < 0 || typeof row.notes !== 'string' || row.notes.length > MAX_TEXT_LENGTH) return false;
      rowIds.add(row.inventoryId);
      return true;
    })) return null;
    const nowIso = new Date().toISOString();
    const auditItems: InventoryAuditItem[] = rows.map(row => {
      const item = inventory.find(inv => inv.id === row.inventoryId);
      const category = categories.find(cat => cat.id === item?.categoryId);
      const systemQuantity = item ? getInventoryAuditQuantity(item) : 0;
      const countedQuantity = row.countedQuantity;
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

    if (!Array.isArray(audit.items) || audit.items.some(row =>
      !row || typeof row.inventoryId !== 'string' || !inventory.some(item => item.id === row.inventoryId) ||
      !Number.isInteger(row.countedQuantity) || row.countedQuantity < 0
    )) return null;

    const newQuantities: Record<string, number> = {};
    audit.items.forEach(row => {
      if (!row.hasIMEI && inventory.some(item => item.id === row.inventoryId)) newQuantities[row.inventoryId] = row.countedQuantity;
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
  }, [inventory, inventoryAudits, setInventory, setInventoryAudits]);

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
    const sideTypes: SideAccountEntryType[] = ['receivable', 'payable', 'incoming', 'outgoing'];
    const impacts: SideAccountImpact[] = ['none', 'main_safe', 'capital', 'separate_safe'];
    const amount = input.amount;
    const paidAmount = input.paidAmount;
    if (!validText(input.partyName, 200) || !sideTypes.includes(input.type) || !impacts.includes(input.impact) ||
        !isFiniteNumber(amount) || amount <= 0 || !isFiniteNumber(paidAmount) || paidAmount < 0 || paidAmount > amount ||
        typeof input.description !== 'string' || input.description.length > MAX_TEXT_LENGTH ||
        typeof input.notes !== 'string' || input.notes.length > MAX_TEXT_LENGTH ||
        typeof input.dueDate !== 'string' || input.dueDate.length > 30 ||
        (input.newSafeName !== undefined && input.newSafeName.length > 200)) return null;

    let safeId = input.safeId;
    if (input.impact === 'separate_safe' && !input.newSafeName?.trim()) return null;
    if (input.impact !== 'separate_safe' && input.impact !== 'none' &&
        (!safeId || !safes.some(s => s.id === safeId))) {
      safeId = safes.find(s => s.isDefault)?.id || safes[0]?.id || '';
      if (!safeId) return null;
    }
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

    const safePaidAmount = roundMoney(paidAmount);
    const remaining = Math.max(0, roundMoney(amount - safePaidAmount));
    const newEntry: SideAccountEntry = {
      id: uuidv4(),
      partyName: input.partyName.trim(),
      type: input.type,
      impact: input.impact,
      amount: roundMoney(amount),
      paidAmount: safePaidAmount,
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
    if (updates.notes !== undefined && (typeof updates.notes !== 'string' || updates.notes.length > MAX_TEXT_LENGTH)) return;
    if (updates.dueDate !== undefined && (typeof updates.dueDate !== 'string' || updates.dueDate.length > 30)) return;
    if (updates.safeId !== undefined && !safes.some(s => s.id === updates.safeId)) return;
    if (updates.paidAmount !== undefined) {
      if (!isFiniteNumber(updates.paidAmount) || updates.paidAmount < 0 || updates.paidAmount > entry.amount) return;
      paidAmount = roundMoney(updates.paidAmount);
      const delta = roundMoney(paidAmount - entry.paidAmount);

      // Settling a receivable/payable moves real cash — unlike
      // incoming/outgoing entries, this wasn't recorded against any safe at
      // creation time, so record it now against the chosen (or default) safe.
      if (delta !== 0 && (entry.type === 'receivable' || entry.type === 'payable')) {
        const settlementTransactions = transactions.filter(t => t.referenceId === entry.id && t.safeId);
        const lastSettlementSafeId = settlementTransactions[settlementTransactions.length - 1]?.safeId;
        const targetSafeId = delta < 0
          ? (lastSettlementSafeId || entry.safeId || '')
          : (updates.safeId || entry.safeId || safes.find(s => s.isDefault)?.id || safes[0]?.id || '');
        if (!targetSafeId || !safes.some(s => s.id === targetSafeId)) return;
        {
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

    const status = entry.type === 'receivable' || entry.type === 'payable'
      ? paidAmount >= entry.amount ? 'settled' : paidAmount > 0 ? 'partial' : 'open'
      : entry.status;
    const safeUpdates = {
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate } : {}),
      ...(updates.safeId !== undefined ? { safeId: updates.safeId } : {}),
      paidAmount,
      status,
    };

    setSideAccountEntries(prev => prev.map(e => (e.id === id ? { ...e, ...safeUpdates } : e)));
  }, [currentUser, safes, sideAccountEntries, transactions, setSafes, setSideAccountEntries, setTransactions]);

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
    if (!validText(data.customerName, 200) || !validText(data.customerPhone, 50) || !validText(data.deviceType, 200) ||
        typeof data.deviceModel !== 'string' || data.deviceModel.length > MAX_TEXT_LENGTH ||
        typeof data.imeiLink !== 'string' || data.imeiLink.length > 40 || typeof data.problem !== 'string' || data.problem.length > MAX_TEXT_LENGTH ||
        typeof data.diagnosis !== 'string' || data.diagnosis.length > MAX_TEXT_LENGTH ||
        !isFiniteNumber(data.estimatedCost) || data.estimatedCost < 0 || typeof data.technicianId !== 'string' || data.technicianId.length > 100 ||
        typeof data.safeId !== 'string' || data.safeId.length > 100 || typeof data.receivedAt !== 'string' ||
        typeof data.notes !== 'string' || data.notes.length > MAX_TEXT_LENGTH) return null;
    const newMaintenance: Maintenance = {
      ...data,
      customerName: data.customerName.trim(), customerPhone: data.customerPhone.trim(), deviceType: data.deviceType.trim(),
      estimatedCost: roundMoney(data.estimatedCost),
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
    const existing = maintenance.find(m => m.id === id);
    if (!existing || existing.status === 'delivered' || existing.status === 'cancelled') return;
    const validStatuses: Maintenance['status'][] = ['received', 'in_progress', 'completed', 'cancelled'];
    if (updates.status !== undefined && !validStatuses.includes(updates.status)) return;
    for (const value of [updates.estimatedCost, updates.additionalExpenses, updates.collectedAmount]) {
      if (value !== undefined && (!isFiniteNumber(value) || value < 0)) return;
    }
    for (const value of [updates.customerName, updates.customerPhone, updates.deviceType, updates.deviceModel, updates.imeiLink, updates.problem, updates.diagnosis, updates.notes]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH)) return;
    }
    const safeUpdates: Partial<Maintenance> = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.ticketNumber;
    delete safeUpdates.parts;
    delete safeUpdates.finalCost;
    delete safeUpdates.profit;
    delete safeUpdates.deliveredAt;
    if (safeUpdates.estimatedCost !== undefined) safeUpdates.estimatedCost = roundMoney(safeUpdates.estimatedCost);
    if (safeUpdates.additionalExpenses !== undefined) safeUpdates.additionalExpenses = roundMoney(safeUpdates.additionalExpenses);
    if (safeUpdates.collectedAmount !== undefined) safeUpdates.collectedAmount = roundMoney(safeUpdates.collectedAmount);
    setMaintenance(prev => prev.map(m => m.id === id ? { ...m, ...safeUpdates } : m));
  }, [maintenance, setMaintenance]);

  const addMaintenancePart = useCallback((maintenanceId: string, part: Omit<MaintenancePart, 'id'>) => {
    const maint = maintenance.find(m => m.id === maintenanceId);
    if (!maint || maint.status === 'delivered' || maint.status === 'cancelled' || typeof part.inventoryId !== 'string' ||
        !isPositiveInteger(part.quantity) || !validText(part.name, 200) || !isFiniteNumber(part.unitCost) || part.unitCost < 0) return null;

    let safePart: MaintenancePart;
    if (part.inventoryId.startsWith('manual-')) {
      safePart = { ...part, name: part.name.trim(), unitCost: roundMoney(part.unitCost), total: roundMoney(part.unitCost * part.quantity), id: uuidv4() };
    } else {
      const inventoryItem = inventory.find(inv => inv.id === part.inventoryId);
      if (!inventoryItem || inventoryItem.hasIMEI || inventoryItem.quantity < part.quantity) return null;
      // Use current inventory values rather than trusting a client-provided
      // name/cost/total, then deduct exactly the amount recorded in the part.
      safePart = {
        id: uuidv4(), inventoryId: inventoryItem.id, name: inventoryItem.name,
        quantity: part.quantity, unitCost: roundMoney(inventoryItem.costPrice),
        total: roundMoney(inventoryItem.costPrice * part.quantity)
      };
    }

    setMaintenance(prev => prev.map(m => m.id === maintenanceId ? { ...m, parts: [...m.parts, safePart] } : m));
    if (!safePart.inventoryId.startsWith('manual-')) {
      setInventory(prev => prev.map(inv => inv.id === safePart.inventoryId
        ? { ...inv, quantity: inv.quantity - safePart.quantity } : inv));
    }
    return safePart;
  }, [inventory, maintenance, setInventory, setMaintenance]);

  const removeMaintenancePart = useCallback((maintenanceId: string, partId: string) => {
    const maint = maintenance.find(m => m.id === maintenanceId);
    const part = maint?.parts.find(p => p.id === partId);
    if (!maint || !part || maint.status === 'delivered' || maint.status === 'cancelled') return;
    
    if (!part.inventoryId.startsWith('manual-')) {
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
    const safe = safes.find(s => s.id === safeId);
    if (!maint || !safe || maint.status !== 'completed' || !isFiniteNumber(collectedAmount) || collectedAmount < 0) return null;

    const partsCost = maint.parts.reduce((sum, p) => sum + (isFiniteNumber(p.total) && p.total >= 0 ? p.total : 0), 0);
    const additionalExpenses = isFiniteNumber(maint.additionalExpenses) && maint.additionalExpenses >= 0 ? maint.additionalExpenses : 0;
    const finalAmount = roundMoney(collectedAmount);
    const profit = roundMoney(finalAmount - partsCost - additionalExpenses);

    setMaintenance(prev => prev.map(m => m.id === id ? {
      ...m,
      status: 'delivered', collectedAmount: finalAmount, finalCost: finalAmount,
      profit, deliveredAt: new Date().toISOString(), safeId
    } : m));

    // Update safe balance
    setSafes(prev => prev.map(s => 
      s.id === safeId ? { ...s, balance: roundMoney(s.balance + finalAmount) } : s
    ));

    // Add transaction
    const transaction: Transaction = {
      id: uuidv4(),
      type: 'maintenance',
      amount: finalAmount,
      description: `صيانة ${maint.ticketNumber}`,
      referenceId: id,
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [...prev, transaction]);
  }, [currentUser, maintenance, setMaintenance, safes, setSafes, setTransactions]);

  // Safe functions
  const addSafe = useCallback((safe: Omit<Safe, 'id'>) => {
    const validTypes: NonNullable<Safe['type']>[] = ['cash', 'ewallet', 'bank'];
    if (!validText(safe.name, 200) || !isFiniteNumber(safe.balance) || safe.balance < 0 || typeof safe.isDefault !== 'boolean' ||
        (safe.type !== undefined && !validTypes.includes(safe.type)) || safes.some(s => s.name.trim() === safe.name.trim())) return null;
    const newSafe: Safe = { ...safe, name: safe.name.trim(), balance: roundMoney(safe.balance), id: uuidv4() };
    setSafes(prev => [...prev.map(s => newSafe.isDefault ? { ...s, isDefault: false } : s), newSafe]);
    return newSafe;
  }, [safes, setSafes]);

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
    if (!safes.some(s => s.id === safeId) || !isFiniteNumber(amount) || amount <= 0 || !validText(description, MAX_TEXT_LENGTH)) return null;
    const finalAmount = roundMoney(type === 'expense' ? -amount : amount);
    
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
  }, [currentUser, safes, setTransactions, setSafes]);

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
    const from = safes.find(s => s.id === fromId);
    const to = safes.find(s => s.id === toId);
    if (!from || !to || fromId === toId || !isFiniteNumber(amount) || amount <= 0 || amount > from.balance) return null;
    const transferAmount = roundMoney(amount);
    setSafes(prev => prev.map(s => {
      if (s.id === fromId) return { ...s, balance: roundMoney(s.balance - transferAmount) };
      if (s.id === toId) return { ...s, balance: roundMoney(s.balance + transferAmount) };
      return s;
    }));

    // Add transactions
    const timestamp = new Date().toISOString();
    setTransactions(prev => [
      ...prev,
      {
        id: uuidv4(),
        type: 'transfer',
        amount: -transferAmount,
        description: 'تحويل للخزنة أخرى',
        referenceId: '',
        safeId: fromId,
        userId: currentUser?.id || '',
        createdAt: timestamp
      },
      {
        id: uuidv4(),
        type: 'transfer',
        amount: transferAmount,
        description: 'تحويل من خزنة أخرى',
        referenceId: '',
        safeId: toId,
        userId: currentUser?.id || '',
        createdAt: timestamp
      }
    ]);
  }, [currentUser, safes, setSafes, setTransactions]);

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
    // فهرس واحد O(imeiUnits) بدل مسح كامل لكل منتج — مرتين (كانت 4 مسحات).
    const { availableStockOf } = buildImeiStockIndex(imeiUnits);
    const lowStockItems = inventory.reduce<Array<InventoryItem & { realQuantity: number }>>((acc, i) => {
      const realQuantity = availableStockOf(i);
      if (realQuantity <= i.minQuantity) acc.push({ ...i, realQuantity });
      return acc;
    }, []);

    // تاريخ «بعد 30 يوم» كان بيتبني من الصفر لكل وحدة IMEI في كل إحصائية.
    const warrantyWindowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + WARRANTY_ALERT_DAYS);
    const expiringWarranties = imeiUnits.filter(u => {
      if (!u.warrantyEndDate || u.status !== 'sold') return false;
      const warrantyDate = new Date(u.warrantyEndDate);
      if (Number.isNaN(warrantyDate.getTime())) return false;
      return warrantyDate <= warrantyWindowEnd && warrantyDate >= today;
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
    updateUsers,
    updateSuppliers,
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
