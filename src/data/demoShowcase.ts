import type {
  User, Customer, Category, InventoryItem, IMEIUnit, Sale, SaleReturn,
  Maintenance, Safe, Transaction, Supplier, Purchase, StockWaste,
  InventoryAudit, SideAccountEntry, Notification, AppSettings,
} from '../types';

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};
const daysAgo = (n: number) => daysFromNow(-n);
const now = () => new Date().toISOString();

export const demoAppSettings: AppSettings = {
  shopName: 'موبايل ستور',
  shopPhone: '01000000000',
  shopAddress: 'الإسكندرية - مصر',
  receiptFooter: 'شكراً لتعاملكم معنا 💙',
  notifSound: false,
  autoRefresh: true,
  accentColor: '#3b82f6',
  themeStyle: 'default',
};

export function getDemoShowcaseData() {
  const t = now();
  return {
    users: [
      { id: 'u1', username: 'admin', password: 'Demo@1234', name: 'مدير المحل', role: 'admin' as const, createdAt: t },
      { id: 'u2', username: 'cashier', password: 'Demo@1234', name: 'أحمد الكاشير', role: 'staff' as const, createdAt: t },
      { id: 'u3', username: 'tech', password: 'Demo@1234', name: 'محمود فني', role: 'staff' as const, createdAt: t },
    ] satisfies User[],
    customers: [
      { id: 'c1', name: 'محمد علي', phone: '01011112222', address: 'سموحة - إسكندرية', balance: 2500, createdAt: daysAgo(40) },
      { id: 'c2', name: 'سارة حسن', phone: '01233334444', address: 'مدينة نصر', balance: 0, createdAt: daysAgo(20) },
      { id: 'c3', name: 'خالد إبراهيم', phone: '01155556666', address: 'المعادي', balance: 800, createdAt: daysAgo(10) },
      { id: 'c4', name: 'نور الدين', phone: '01577778888', address: 'المنصورة', balance: 0, createdAt: daysAgo(5) },
    ] satisfies Customer[],
    categories: [
      { id: 'cat1', name: 'هواتف Apple', type: 'device' as const },
      { id: 'cat2', name: 'هواتف Samsung', type: 'device' as const },
      { id: 'cat3', name: 'هواتف Xiaomi', type: 'device' as const },
      { id: 'cat8', name: 'سماعات', type: 'accessory' as const },
      { id: 'cat9', name: 'شواحن وكابلات', type: 'accessory' as const },
      { id: 'cat13', name: 'شاشات LCD', type: 'spare_part' as const },
      { id: 'cat14', name: 'بطاريات', type: 'spare_part' as const },
    ] satisfies Category[],
    inventory: [
      { id: 'p1', name: 'iPhone 15 Pro 256GB', code: 'IP15P256', barcode: '6221234567890', categoryId: 'cat1', costPrice: 42000, sellPrice: 48500, quantity: 0, minQuantity: 2, hasIMEI: true, createdAt: daysAgo(60) },
      { id: 'p2', name: 'Samsung S24 Ultra 256GB', code: 'S24U256', barcode: '6221234567891', categoryId: 'cat2', costPrice: 38000, sellPrice: 44500, quantity: 0, minQuantity: 2, hasIMEI: true, createdAt: daysAgo(50) },
      { id: 'p3', name: 'Redmi Note 13 Pro', code: 'RN13P', barcode: '6221234567892', categoryId: 'cat3', costPrice: 8500, sellPrice: 10900, quantity: 0, minQuantity: 3, hasIMEI: true, createdAt: daysAgo(40) },
      { id: 'p4', name: 'سماعة بلوتوث AirPods', code: 'APDS', barcode: '6220001112223', categoryId: 'cat8', costPrice: 1800, sellPrice: 2650, quantity: 18, minQuantity: 5, hasIMEI: false, createdAt: daysAgo(30) },
      { id: 'p5', name: 'شاحن 65 وات أصلي', code: 'CH65', barcode: '6220001112224', categoryId: 'cat9', costPrice: 220, sellPrice: 350, quantity: 42, minQuantity: 10, hasIMEI: false, createdAt: daysAgo(30) },
      { id: 'p6', name: 'كابل Type-C سريع', code: 'CBLC', barcode: '6220001112225', categoryId: 'cat9', costPrice: 45, sellPrice: 90, quantity: 3, minQuantity: 15, hasIMEI: false, createdAt: daysAgo(25) },
      { id: 'p7', name: 'شاشة iPhone 13 LCD', code: 'LCD13', barcode: '6220001113331', categoryId: 'cat13', costPrice: 950, sellPrice: 1800, quantity: 7, minQuantity: 3, hasIMEI: false, createdAt: daysAgo(20) },
      { id: 'p8', name: 'بطارية Samsung A54', code: 'BATA54', barcode: '6220001113332', categoryId: 'cat14', costPrice: 280, sellPrice: 550, quantity: 12, minQuantity: 4, hasIMEI: false, createdAt: daysAgo(18) },
    ] satisfies InventoryItem[],
    imeiUnits: [
      { id: 'i1', inventoryId: 'p1', imei1: '356938035643809', imei2: '356938035643817', color: 'تيتانيوم طبيعي', storage: '256GB', ram: '8GB', condition: 'new' as const, warrantyEndDate: daysFromNow(320), status: 'available' as const, saleId: '', customerId: '', purchasePrice: 42000, notes: '', createdAt: daysAgo(20) },
      { id: 'i2', inventoryId: 'p1', imei1: '356938035643901', imei2: '356938035643919', color: 'تيتانيوم أزرق', storage: '256GB', ram: '8GB', condition: 'new' as const, warrantyEndDate: daysFromNow(300), status: 'available' as const, saleId: '', customerId: '', purchasePrice: 42000, notes: '', createdAt: daysAgo(18) },
      { id: 'i3', inventoryId: 'p1', imei1: '356938035644000', imei2: '356938035644018', color: 'أسود', storage: '256GB', ram: '8GB', condition: 'new' as const, warrantyEndDate: daysFromNow(12), status: 'sold' as const, saleId: 's1', customerId: 'c2', purchasePrice: 42000, notes: '', createdAt: daysAgo(15) },
      { id: 'i4', inventoryId: 'p2', imei1: '352809111111111', imei2: '352809111111129', color: 'تيتانيوم رمادي', storage: '256GB', ram: '12GB', condition: 'new' as const, warrantyEndDate: daysFromNow(280), status: 'available' as const, saleId: '', customerId: '', purchasePrice: 38000, notes: '', createdAt: daysAgo(14) },
      { id: 'i5', inventoryId: 'p2', imei1: '352809111222222', imei2: '352809111222230', color: 'أسود', storage: '256GB', ram: '12GB', condition: 'used' as const, warrantyEndDate: daysFromNow(90), status: 'sold' as const, saleId: 's2', customerId: 'c1', purchasePrice: 32000, notes: '', createdAt: daysAgo(12) },
      { id: 'i6', inventoryId: 'p3', imei1: '868000111222333', imei2: '', color: 'أخضر', storage: '256GB', ram: '8GB', condition: 'new' as const, warrantyEndDate: daysFromNow(365), status: 'available' as const, saleId: '', customerId: '', purchasePrice: 8500, notes: '', createdAt: daysAgo(8) },
      { id: 'i7', inventoryId: 'p3', imei1: '868000111222444', imei2: '', color: 'أسود', storage: '128GB', ram: '8GB', condition: 'new' as const, warrantyEndDate: daysFromNow(365), status: 'maintenance' as const, saleId: '', customerId: '', purchasePrice: 8500, notes: '', createdAt: daysAgo(6) },
    ] satisfies IMEIUnit[],
    sales: [
      { id: 's1', invoiceNumber: 'INV-0001', customerId: 'c2', items: [{ id: 'si1', inventoryId: 'p1', imeiUnitId: 'i3', quantity: 1, unitPrice: 48500, costPrice: 42000, total: 48500, returnedQuantity: 0 }], subtotal: 48500, discount: 500, total: 48000, paid: 48000, remaining: 0, profit: 6000, paymentMethod: 'cash' as const, cashierId: 'u1', safeId: 'safe1', notes: '', createdAt: daysAgo(0) },
      { id: 's2', invoiceNumber: 'INV-0002', customerId: 'c1', items: [{ id: 'si2', inventoryId: 'p2', imeiUnitId: 'i5', quantity: 1, unitPrice: 39000, costPrice: 32000, total: 39000, returnedQuantity: 0 }, { id: 'si3', inventoryId: 'p5', quantity: 2, unitPrice: 350, costPrice: 220, total: 700, returnedQuantity: 0 }], subtotal: 39700, discount: 200, total: 39500, paid: 37000, remaining: 2500, profit: 7280, paymentMethod: 'installment' as const, cashierId: 'u1', safeId: 'safe1', notes: '', createdAt: daysAgo(1) },
      { id: 's3', invoiceNumber: 'INV-0003', customerId: 'c4', items: [{ id: 'si4', inventoryId: 'p4', quantity: 1, unitPrice: 2650, costPrice: 1800, total: 2650, returnedQuantity: 0 }], subtotal: 2650, discount: 0, total: 2650, paid: 2650, remaining: 0, profit: 850, paymentMethod: 'card' as const, cashierId: 'u2', safeId: 'safe2', notes: '', createdAt: daysAgo(2) },
      { id: 's4', invoiceNumber: 'INV-0004', customerId: 'c3', items: [{ id: 'si5', inventoryId: 'p5', quantity: 3, unitPrice: 350, costPrice: 220, total: 1050, returnedQuantity: 0 }], subtotal: 1050, discount: 50, total: 1000, paid: 200, remaining: 800, profit: 340, paymentMethod: 'installment' as const, cashierId: 'u1', safeId: 'safe1', notes: '', createdAt: daysAgo(3) },
    ] satisfies Sale[],
    saleReturns: [] as SaleReturn[],
    maintenance: [
      { id: 'm1', ticketNumber: 'MNT-001', customerName: 'يوسف عادل', customerPhone: '01099990000', deviceType: 'iPhone', deviceModel: '13', imeiLink: '', problem: 'كسر شاشة', diagnosis: 'تغيير LCD', status: 'received' as const, estimatedCost: 1800, finalCost: 0, collectedAmount: 0, parts: [], additionalExpenses: 0, profit: 0, technicianId: 'u3', safeId: 'safe1', receivedAt: daysAgo(1), completedAt: '', deliveredAt: '', notes: '' },
      { id: 'm2', ticketNumber: 'MNT-002', customerName: 'منى سمير', customerPhone: '01288887777', deviceType: 'Samsung', deviceModel: 'A54', imeiLink: '', problem: 'بطارية ضعيفة', diagnosis: 'تغيير بطارية', status: 'in_progress' as const, estimatedCost: 550, finalCost: 0, collectedAmount: 0, parts: [{ id: 'mp1', inventoryId: 'p8', name: 'بطارية Samsung A54', quantity: 1, unitCost: 280, total: 280 }], additionalExpenses: 0, profit: 0, technicianId: 'u3', safeId: 'safe1', receivedAt: daysAgo(3), completedAt: '', deliveredAt: '', notes: '' },
      { id: 'm3', ticketNumber: 'MNT-003', customerName: 'عمرو فتحي', customerPhone: '01122223333', deviceType: 'iPhone', deviceModel: '12', imeiLink: '', problem: 'مابيشحنش', diagnosis: 'منفذ شحن', status: 'completed' as const, estimatedCost: 700, finalCost: 0, collectedAmount: 0, parts: [], additionalExpenses: 50, profit: 0, technicianId: 'u3', safeId: 'safe1', receivedAt: daysAgo(5), completedAt: daysAgo(1), deliveredAt: '', notes: '' },
      { id: 'm4', ticketNumber: 'MNT-004', customerName: 'هدى كمال', customerPhone: '01544445555', deviceType: 'Xiaomi', deviceModel: 'Redmi 12', imeiLink: '', problem: 'تغيير شاشة', diagnosis: 'تم الإصلاح', status: 'delivered' as const, estimatedCost: 900, finalCost: 900, collectedAmount: 900, parts: [], additionalExpenses: 0, profit: 900, technicianId: 'u3', safeId: 'safe1', receivedAt: daysAgo(8), completedAt: daysAgo(6), deliveredAt: daysAgo(5), notes: '' },
    ] satisfies Maintenance[],
    safes: [
      { id: 'safe1', name: 'الخزنة الرئيسية', balance: 85200, isDefault: true, type: 'cash' as const },
      { id: 'safe2', name: 'فودافون كاش', balance: 12400, isDefault: false, type: 'ewallet' as const },
      { id: 'safe3', name: 'حساب بنكي', balance: 61000, isDefault: false, type: 'bank' as const },
    ] satisfies Safe[],
    transactions: [
      { id: 't1', type: 'sale' as const, amount: 48000, description: 'فاتورة بيع INV-0001', referenceId: 's1', safeId: 'safe1', userId: 'u1', createdAt: daysAgo(0) },
      { id: 't2', type: 'sale' as const, amount: 37000, description: 'فاتورة بيع INV-0002', referenceId: 's2', safeId: 'safe1', userId: 'u1', createdAt: daysAgo(1) },
      { id: 't3', type: 'sale' as const, amount: 2650, description: 'فاتورة بيع INV-0003', referenceId: 's3', safeId: 'safe2', userId: 'u2', createdAt: daysAgo(2) },
      { id: 't4', type: 'expense' as const, amount: -850, description: 'إيجار المحل', referenceId: '', safeId: 'safe1', userId: 'u1', createdAt: daysAgo(2) },
      { id: 't5', type: 'maintenance' as const, amount: 900, description: 'صيانة MNT-004', referenceId: 'm4', safeId: 'safe1', userId: 'u3', createdAt: daysAgo(5) },
      { id: 't6', type: 'income' as const, amount: 500, description: 'عمولة فودافون كاش', referenceId: '', safeId: 'safe2', userId: 'u1', createdAt: daysAgo(1) },
    ] satisfies Transaction[],
    suppliers: [
      { id: 'sup1', name: 'شركة النور للتوريدات', phone: '0225556666', address: 'وسط البلد', balance: 15000 },
      { id: 'sup2', name: 'موزع سامسونج المعتمد', phone: '01012345678', address: 'التجمع', balance: 0 },
    ] satisfies Supplier[],
    purchases: [
      { id: 'pur1', invoiceNumber: 'PUR-0001', supplierId: 'sup1', items: [{ id: 'pi1', inventoryId: 'p5', quantity: 50, unitCost: 220, total: 11000 }], total: 11000, paid: 11000, remaining: 0, safeId: 'safe1', userId: 'u1', notes: '', createdAt: daysAgo(28) },
    ] satisfies Purchase[],
    stockWastes: [] as StockWaste[],
    inventoryAudits: [] as InventoryAudit[],
    sideAccountEntries: [
      { id: 'sa1', partyName: 'تاجر جملة رفيق', type: 'receivable' as const, impact: 'none' as const, amount: 4000, paidAmount: 1000, status: 'partial' as const, description: 'باقي أجهزة', notes: '', safeId: '', safeDelta: 0, transactionId: '', userId: 'u1', createdAt: daysAgo(7), dueDate: daysFromNow(7) },
    ] satisfies SideAccountEntry[],
    notifications: [] as Notification[],
  };
}
