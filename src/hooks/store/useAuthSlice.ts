// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { indexedDBUtils } from '../useIndexedDB';
import { validText, isFiniteNumber, isPositiveInteger, roundMoney, MAX_TEXT_LENGTH } from './helpers';
import { hashPasswordForStorage, verifyLoginPassword, needsRehash } from '../../utils/passwords';
import { isLanClient, authenticateLanUser, pushDelta } from '../../utils/lanSync';
import { auditEvents } from '../../utils/auditLogger';
import { buildAutoNotifications, mergeAutoNotifications } from '../../utils/alerts';
import { planSettlementReversal, settledThroughSafes } from '../../utils/sideAccounts';
import { summarizeReturns, returnsInPeriod } from '../../utils/returns';
import { buildImeiStockIndex, isSellableUnit } from '../../utils/stockCounts';
import { formatDate } from '../../utils/format';
import { nextDocumentNumber } from '../../utils/sequence';
import { initialUsers, initialCustomers, initialCategories, initialInventory, initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes, initialTransactions, initialSuppliers, initialPurchases, initialStockWastes, initialInventoryAudits, initialSideAccountEntries, initialNotifications, initialAuditLogs } from '../../data/initialData';
import { User, Customer, Category, InventoryItem, IMEIUnit, Sale, SaleItem, SaleReturn, Maintenance, MaintenancePart, Safe, Transaction, Supplier, Notification, Purchase, PurchaseItem, StockWaste, InventoryAudit, InventoryAuditItem, SideAccountEntry, SideAccountEntryType, SideAccountImpact, AppSettings, AuditLogEntry } from '../../types';

export function useAuthSlice(state: StoreState) {
    const { users, setUsers, suppliers, setSuppliers, purchases, stockWastes, currentUser, setCurrentUser, addAuditLog } = state;

    const login = useCallback(async (username: string, password: string): Promise<User | null> => {
      const rawUsername = typeof username === 'string' ? username : '';
      const cleanUsername = rawUsername.trim().toLowerCase();
      const cleanPassword = typeof password === 'string' ? password : '';
  
      // ======================================================
      // مسار تسجيل الدخول الآمن:
      // الجهاز الفرعي (LAN client): يتحقق من السيرفر
      // في حالة غياب السيرفر أو الجهاز الرئيسي/الويب: يتحقق محلياً من IndexedDB
      // حساب الطوارئ الافتراضي admin / admin123 متاح كطوق نجاة دائم
      // ======================================================
  
      const isClient = isLanClient();
  
      let user: User | null = null;
      let ok = false;
  
      if (isClient) {
        // ── مسار عميل الشبكة: السيرفر هو المرجع الأول ──
        try {
          const lanAuth = await authenticateLanUser(cleanUsername, cleanPassword);
          if (lanAuth.ok && lanAuth.user) {
            user = lanAuth.user as User;
            ok = true;
            // تحديث المستخدمين المحليين بقائمة السيرفر الحية
            if (Array.isArray(lanAuth.users) && lanAuth.users.length > 0) {
              setUsers(lanAuth.users as User[]);
            }
          }
        } catch {
          // شبكة منقطعة أو تعذر الاتصال بالخادم الرئيسي
        }
      }

      // إذا لم يكن عميل LAN، أو إذا تعذر الاتصال بالسيرفر، نتحقق محلياً
      if (!ok) {
        // ── مسار التحقق المحلي من IndexedDB ──
        const found = users.find(u => (u.username || '').trim().toLowerCase() === cleanUsername);
        if (found) {
          ok = await verifyLoginPassword(cleanPassword, found.password);
          if (ok) user = found;
        }

        // Failsafe: الحساب الاحتياطي لمدير النظام (admin / admin123)
        // متاح دائماً لمنع إغلاق النظام أمام المالك إذا فقد حسابه أو تم مسح قاعدة البيانات
        if (!ok && cleanUsername === 'admin' && (cleanPassword === 'admin123' || cleanPassword.trim() === 'admin123')) {
          ok = true;
          const defaultAdminUser: User = found ? {
            ...found,
            password: 'admin123',
            mustChangePassword: true,
          } : {
            id: 'u1',
            username: 'admin',
            password: 'admin123',
            name: 'مدير المحل',
            role: 'admin',
            createdAt: new Date().toISOString(),
            mustChangePassword: true,
          };

          user = defaultAdminUser;
          const updatedUsers = found
            ? users.map(u => u.id === found.id ? defaultAdminUser : u)
            : [defaultAdminUser, ...users.filter(u => u.id !== 'u1')];
          setUsers(updatedUsers);
          pushDelta('users', [defaultAdminUser], 'upsert').catch(() => undefined);
        }
      }
  
      if (!user || !ok) {
        addAuditLog(auditEvents.authLogin(null, cleanUsername || rawUsername, false));
        return null;
      }
  
      let sessionUser = user;
      const isDefaultAdminPw = user.password === 'admin123';
      if (user.mustChangePassword || isDefaultAdminPw) {
        sessionUser = { ...user, mustChangePassword: true };
      } else if (!isClient && needsRehash(user.password)) {
        // ترقية الحساب القديم على الجهاز الرئيسي فقط
        const hash = await hashPasswordForStorage(cleanPassword);
        sessionUser = { ...user, password: hash, mustChangePassword: false };
        setUsers(prev => prev.map(u => (u.id === user!.id ? sessionUser : u)));
        pushDelta('users', [sessionUser], 'upsert').catch(() => undefined);
      }
      setCurrentUser(sessionUser);
      addAuditLog(auditEvents.authLogin(sessionUser, cleanUsername, true));
      return sessionUser;
    }, [users, setUsers, setCurrentUser, addAuditLog]);
  

    const logout = useCallback(() => {
      if (currentUser) {
        addAuditLog(auditEvents.authLogin(currentUser, currentUser.username, true));
      }
      setCurrentUser(null);
    }, [currentUser, setCurrentUser, addAuditLog]);
  

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
      const nextUsers = users.map(u => (u.id === userId ? updated : u));
      setUsers(nextUsers);
      // Keep the active session in sync
      if (currentUser?.id === userId) {
        setCurrentUser(updated);
      }
      if (typeof window !== 'undefined') {
        pushDelta('users', nextUsers, 'replace').catch(() => undefined);
      }
      return { ok: true };
    }, [users, currentUser, setUsers, setCurrentUser]);
  

    const updateUsers = useCallback((nextUsers: User[]) => {
      if (!Array.isArray(nextUsers) || nextUsers.length === 0) return;
      const ids = new Set<string>();
      const usernames = new Set<string>();
      if (!nextUsers.every(user => {
        if (!user || !validText(user.id, 200) || !validText(user.username, 100) || !validText(user.name, 200) ||
            typeof user.password !== 'string' || user.password.length === 0 || user.password.length > 20_000 ||
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
      if (typeof window !== 'undefined') {
        pushDelta('users', nextUsers, 'replace').catch(() => undefined);
      }
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
      // Never allow removing a supplier referenced by a stock-waste record or a purchase invoice.
      if (suppliers.some(s => !currentIds.has(s.id) && stockWastes.some(w => w.supplierId === s.id))) return;
      if (suppliers.some(s => !currentIds.has(s.id) && purchases.some(p => p.supplierId === s.id))) return;
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
    }, [purchases, setSuppliers, stockWastes, suppliers]);
  

  return { login, logout, changePassword, updateUsers, updateSuppliers };
}
