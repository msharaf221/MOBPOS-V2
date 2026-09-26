// ============================================================
//  مولّد سجل العمليات والرقابة (Audit Log Generator)
//  يولّد نصوصاً عربية واضحة ومباشرة يفهمها أي صاحب محل أو مدير
// ============================================================

import type { AuditLogEntry, AuditCategory, AuditSeverity, User } from '../types/index.ts';
import { formatCurrency } from './format.ts';
import { v4 as uuidv4 } from 'uuid';

export function roleToArabic(role: string): string {
  switch (role) {
    case 'admin':
      return 'المدير';
    case 'manager':
      return 'مشرف';
    case 'staff':
      return 'كاشير/فني';
    default:
      return role;
  }
}

export function categoryToArabic(cat: AuditCategory): string {
  switch (cat) {
    case 'sales':
      return 'مبيعات';
    case 'returns':
      return 'مرتجعات';
    case 'maintenance':
      return 'صيانة';
    case 'inventory':
      return 'المخزون';
    case 'finance':
      return 'المالية والخزنة';
    case 'purchases':
      return 'مشتريات وتوريد';
    case 'customers':
      return 'العملاء';
    case 'suppliers':
      return 'الموردين';
    case 'users':
      return 'المستخدمين';
    case 'auth':
      return 'أمان وتسجيل الدخول';
    case 'settings':
      return 'إعدادات النظام';
    default:
      return cat;
  }
}

export function createAuditEntry(params: {
  user?: User | null;
  category: AuditCategory;
  action: string;
  description: string;
  severity?: AuditSeverity;
  entityId?: string;
  details?: Record<string, unknown>;
  deviceName?: string;
}): AuditLogEntry {
  const user = params.user;
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    userId: user?.id || 'system',
    userName: user?.name || (user?.username ? user.username : 'النظام تلقائياً'),
    userRole: (user?.role as 'admin' | 'manager' | 'staff') || 'admin',
    category: params.category,
    action: params.action,
    description: params.description,
    severity: params.severity || 'info',
    entityId: params.entityId,
    details: params.details,
    deviceName: params.deviceName || (typeof window !== 'undefined' && (window as unknown as { electronAPI?: unknown }).electronAPI ? 'الجهاز الرئيسي' : 'جهاز فرعي (LAN)'),
  };
}

// ===== صانعو الأحداث اليومية بصياغة عربية واضحة ومباشرة =====

export const auditEvents = {
  // مبيعات
  saleCreated: (user: User | null, invoiceNumber: string, total: number, paid: number, customerName?: string, safeName?: string) => {
    const cust = customerName ? `للعميل "${customerName}"` : 'لعميل نقدي';
    const isCredit = paid < total;
    const paymentText = isCredit ? `مدفوع ${formatCurrency(paid)} ومتبقي ${formatCurrency(total - paid)} آجل` : 'مدفوعة بالكامل';
    return createAuditEntry({
      user,
      category: 'sales',
      action: 'فاتورة بيع جديدة',
      description: `قام ${user?.name || 'الكاشير'} بإنشاء فاتورة بيع رقم #${invoiceNumber} بقيمة ${formatCurrency(total)} ${cust} (${paymentText}) في ${safeName || 'الخزنة'}.`,
      severity: 'success',
      entityId: invoiceNumber,
      details: { invoiceNumber, total, paid, customerName, safeName },
    });
  },

  // مرتجع
  saleReturnProcessed: (user: User | null, invoiceNumber: string, refund: number, reason?: string, safeName?: string) => {
    return createAuditEntry({
      user,
      category: 'returns',
      action: 'مرتجع مبيعات',
      description: `قام ${user?.name || 'الكاشير'} بعمل مرتجع لفاتورة رقم #${invoiceNumber} بمبلغ رد ${formatCurrency(refund)} من ${safeName || 'الخزنة'}${reason ? ` (السبب: ${reason})` : ''} وإرجاع الأصناف للمخزون.`,
      severity: 'warning',
      entityId: invoiceNumber,
      details: { invoiceNumber, refund, reason, safeName },
    });
  },

  // مشتريات
  purchaseCreated: (user: User | null, invoiceNumber: string, supplierName: string, total: number, paid: number, safeName?: string) => {
    const isCredit = paid < total;
    const paymentText = isCredit ? `دُفع منها ${formatCurrency(paid)} والباقي ${formatCurrency(total - paid)} مديونية للمورد` : 'مدفوعة بالكامل';
    return createAuditEntry({
      user,
      category: 'purchases',
      action: 'فاتورة شراء بضاعة',
      description: `سجّل ${user?.name || 'المستخدم'} فاتورة شراء بضاعة من المورد "${supplierName}" برقم #${invoiceNumber} بإجمالي ${formatCurrency(total)} (${paymentText})${safeName ? ` من ${safeName}` : ''}.`,
      severity: 'info',
      entityId: invoiceNumber,
      details: { invoiceNumber, supplierName, total, paid, safeName },
    });
  },

  // صيانة
  maintenanceCreated: (user: User | null, ticketNumber: string, device: string, customer: string) => {
    return createAuditEntry({
      user,
      category: 'maintenance',
      action: 'استلام جهاز صيانة',
      description: `استلم ${user?.name || 'الفني'} جهاز صيانة (${device}) من العميل "${customer}" برقم تذكرة #${ticketNumber}.`,
      severity: 'info',
      entityId: ticketNumber,
      details: { ticketNumber, device, customer },
    });
  },

  maintenanceDelivered: (user: User | null, ticketNumber: string, customer: string, collected: number, safeName?: string) => {
    return createAuditEntry({
      user,
      category: 'maintenance',
      action: 'تسليم جهاز صيانة',
      description: `قام ${user?.name || 'الفني'} بتسليم جهاز الصيانة #${ticketNumber} للعميل "${customer}" وتحصيل مبلغ ${formatCurrency(collected)} تم إيداعه في ${safeName || 'الخزنة'}.`,
      severity: 'success',
      entityId: ticketNumber,
      details: { ticketNumber, customer, collected, safeName },
    });
  },

  maintenanceCancelled: (user: User | null, ticketNumber: string, device: string) => {
    return createAuditEntry({
      user,
      category: 'maintenance',
      action: 'إلغاء تذكرة صيانة',
      description: `قام ${user?.name || 'المستخدم'} بإلغاء تذكرة الصيانة #${ticketNumber} للجهاز (${device}) دون إصلاح.`,
      severity: 'warning',
      entityId: ticketNumber,
      details: { ticketNumber, device },
    });
  },

  // حركة خزنة
  safeTransaction: (user: User | null, type: string, amount: number, safeName: string, description: string) => {
    let typeAr = 'حركة مالية';
    let severity: AuditSeverity = 'info';
    if (type === 'income') { typeAr = 'إيداع نقدي'; severity = 'success'; }
    else if (type === 'expense') { typeAr = 'سحب مصروفات'; severity = 'warning'; }
    else if (type === 'transfer') { typeAr = 'تحويل بين الخزن'; severity = 'info'; }
    else if (type === 'capital') { typeAr = 'إيداع رأس مال'; severity = 'success'; }

    return createAuditEntry({
      user,
      category: 'finance',
      action: typeAr,
      description: `سجّل ${user?.name || 'المستخدم'} حركة [${typeAr}] بقيمة ${formatCurrency(amount)} في ${safeName}: "${description}".`,
      severity,
      details: { type, amount, safeName, description },
    });
  },

  // مخزون
  inventoryAdded: (user: User | null, itemName: string, quantity: number, price: number) => {
    return createAuditEntry({
      user,
      category: 'inventory',
      action: 'إضافة صنف جديد',
      description: `أضاف ${user?.name || 'المستخدم'} صنفاً جديداً للمخزون: "${itemName}" بسعر بيع ${formatCurrency(price)} وكمية افتتاحية (${quantity}).`,
      severity: 'info',
      details: { itemName, quantity, price },
    });
  },

  inventoryDeleted: (user: User | null, itemName: string) => {
    return createAuditEntry({
      user,
      category: 'inventory',
      action: 'حذف صنف من المخزون',
      description: `⚠️ تنبيه حرج: قام ${user?.name || 'المدير'} بحذف الصنف "${itemName}" نهائياً من قاعدة بيانات المخزون.`,
      severity: 'danger',
      details: { itemName },
    });
  },

  inventoryStockAdjusted: (user: User | null, itemName: string, oldQty: number, newQty: number, reason: string) => {
    const diff = newQty - oldQty;
    const changeWord = diff > 0 ? `زيادة (+${diff})` : `عجز/نقص (${diff})`;
    return createAuditEntry({
      user,
      category: 'inventory',
      action: 'تعديل كمية مخزون',
      description: `قام ${user?.name || 'المستخدم'} بتعديل كمية الصنف "${itemName}" من (${oldQty}) إلى (${newQty}) [${changeWord}] - السبب: ${reason}.`,
      severity: diff < 0 ? 'warning' : 'info',
      details: { itemName, oldQty, newQty, reason },
    });
  },

  // تسجيل دخول
  authLogin: (user: User | null, username: string, success: boolean, ipOrDevice?: string) => {
    return createAuditEntry({
      user,
      category: 'auth',
      action: success ? 'تسجيل دخول ناجح' : 'محاولة دخول فاشلة',
      description: success
        ? `قام المستخدم "${user?.name || username}" بتسجيل الدخول إلى النظام من ${ipOrDevice || 'الجهاز'}.`
        : `⚠️ محاولة دخول فاشلة باسم المستخدم "${username}" بكلمة مرور غير صحيحة من ${ipOrDevice || 'الجهاز'}.`,
      severity: success ? 'info' : 'danger',
      details: { username, success, ipOrDevice },
    });
  },

  // إعدادات
  settingsChanged: (user: User | null, settingSection: string) => {
    return createAuditEntry({
      user,
      category: 'settings',
      action: 'تعديل إعدادات النظام',
      description: `قام ${user?.name || 'المدير'} بتعديل إعدادات "${settingSection}".`,
      severity: 'info',
      details: { settingSection },
    });
  },
};
