import { useCallback } from 'react';
import { StoreState } from './types';
import { validText, isFiniteNumber, denyUnlessRole } from './helpers';
import { hashPasswordForStorage, verifyLoginPassword, needsRehash } from '../../utils/passwords';
import { isLanClient, authenticateLanUser, pushDelta, clearLanSession } from '../../utils/lanSync';
import { auditEvents } from '../../utils/auditLogger';
import { User, Supplier } from '../../types';

export function useAuthSlice(state: StoreState) {
    const { users, setUsers, appSettings, suppliers, setSuppliers, purchases, stockWastes, currentUser, setCurrentUser, addAuditLog } = state;

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
            // 🔴 SECURITY: الخادم لم يعد يرسل قائمة المستخدمين في رد المصادقة
            // (كانت تحتوي هاشات كلمات المرور). القائمة تصل عبر مزامنة البيانات
            // بعد الجلسة (SSE + fetchCentralData) بدلاً من نقطة الدخول.
          }
        } catch {
          // شبكة منقطعة أو تعذر الاتصال بالخادم الرئيسي
        }
      }

      // إذا لم يكن عميل LAN، أو إذا تعذر الاتصال بالسيرفر، نتحقق محلياً
      if (!ok) {
        // ── مسار التحقق المحلي من IndexedDB (مطابقة اسم المستخدم أو الاسم الظاهر) ──
        const found = users.find(u => {
          const uName = (u.username || '').trim().toLowerCase();
          const dName = (u.name || '').trim().toLowerCase();
          return uName === cleanUsername || dName === cleanUsername;
        });

        if (found) {
          ok = await verifyLoginPassword(cleanPassword, found.password);
          if (ok) user = found;
        }

        // دعم رمز PIN الشبكة لو تم إدخاله ككلمة مرور
        const configuredPin = (appSettings?.lanPin || '').trim();
        if (!ok && configuredPin && (cleanPassword === configuredPin || cleanPassword.trim() === configuredPin || cleanUsername === configuredPin)) {
          ok = true;
          user = found || users.find(u => u.role === 'admin') || users[0];
        }

        // Failsafe: الحساب الاحتياطي لمدير النظام (admin / admin123)
        // يُقبل فقط إذا كانت كلمة المرور المخزنة لا تزال الافتراضية 'admin123' أو لم يكن هناك مستخدمين
        const isDefaultAdminPw = found ? found.password === 'admin123' : users.length === 0;
        if (!ok && isDefaultAdminPw && (cleanUsername === 'admin' || cleanUsername === 'مدير المحل') && (cleanPassword === 'admin123' || cleanPassword.trim() === 'admin123')) {
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
          if (!found) {
            setUsers([defaultAdminUser, ...users.filter(u => u.id !== 'u1')]);
            pushDelta('users', [defaultAdminUser], 'upsert').catch(() => undefined);
          }
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
    }, [users, setUsers, appSettings, setCurrentUser, addAuditLog]);
  

    const logout = useCallback(() => {
      clearLanSession();
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
      const denied = denyUnlessRole(currentUser, 'admin', 'إدارة المستخدمين متاحة لمدير النظام فقط');
      if (denied) {
        console.warn(`[useAuthSlice] ${denied.error}`);
        return;
      }
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
