/**
 * مولّد بيانات تجريبية واقعية لسوق الموبايلات المصري — مخصوص لصور الدعاية.
 *
 * الهدف: الصور الترويجية لازم تبيّن نظام "شغّال" فيه مبيعات ومخزون وأجهزة
 * IMEI وصيانة وعملاء — مش شاشات فاضية. الملف ده بيولّد مجموعة بيانات
 * متكاملة ومتسقة حسابياً (أرصدة الخزائن = الافتتاحي + المقبوض − المصروف،
 * مديونيات العملاء = باقي الفواتير الآجلة، والأجهزة المباعة مربوطة فعلاً
 * بفواتيرها) وبنفس شكل السجلات اللي بيكتبها `useStore` بالظبط.
 *
 * التوليد deterministic (بذرة ثابتة) عشان الصور تطلع نفسها في كل مرة.
 *
 * ملاحظة: الملف ده CommonJS عشان يشتغل من Node مباشرة داخل سكربت الالتقاط،
 * وبيتحقن جوه المتصفح عن طريق `page.evaluate`.
 */

// ===== PRNG ثابت (mulberry32) — نفس البيانات في كل تشغيل =====
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const round = (n) => Math.round(n * 100) / 100;

/** رقم باركود EAN-13 صحيح (بادئة مصر 622) — نفس خوارزمية utils/barcode.ts */
function ean13(seedDigits) {
  const base12 = ('622' + String(seedDigits).padStart(9, '0')).slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(base12[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  return base12 + (mod === 0 ? '0' : String(10 - mod));
}

/** IMEI مكوّن من 15 رقم (TAC + تسلسل + خانة تحقق Luhn) */
function imei(tac, seq) {
  const body = (String(tac) + String(seq).padStart(7, '0')).slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(body[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const FIRST_NAMES = ['أحمد', 'محمد', 'محمود', 'مصطفى', 'كريم', 'عمر', 'يوسف', 'سارة', 'منى', 'هدى', 'دينا', 'خالد', 'طارق', 'شيماء', 'إسلام'];
const LAST_NAMES = ['السيد', 'عبد الرحمن', 'فتحي', 'الشناوي', 'مبروك', 'عز الدين', 'حسنين', 'الغنام', 'شهاب', 'المصري', 'زكي', 'رمضان'];
const PHONES = ['0100', '0101', '0102', '0106', '0109', '0111', '0112', '0114', '0115', '0120', '0121', '0122', '0127', '0128', '0150', '0155'];

/**
 * @param {{ now?: Date, seed?: number, shopName?: string }} [options]
 */
function buildDemoData(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const random = makeRandom(options.seed || 20260830);
  const year = now.getFullYear();

  const pick = (arr) => arr[Math.floor(random() * arr.length)];
  const between = (min, max) => min + random() * (max - min);
  const intBetween = (min, max) => Math.floor(between(min, max + 1));
  const personName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const phone = () => pick(PHONES) + String(intBetween(1000000, 9999999));

  // ===== الموظفين (admin موجود بالفعل في القاعدة — بنضيف بس) =====
  const users = [
    {
      id: 'u2',
      username: 'mahmoud',
      // تجزئة وهمية — الحسابات دي للعرض في الشاشة فقط، الدخول بيتم بـ admin
      password: 'pbkdf2$150000$0000000000000000$demo',
      name: 'محمود سيف',
      role: 'manager',
      createdAt: new Date(now.getTime() - 210 * DAY).toISOString(),
      mustChangePassword: false,
    },
    {
      id: 'u3',
      username: 'karim',
      password: 'pbkdf2$150000$0000000000000000$demo',
      name: 'كريم عادل',
      role: 'staff',
      createdAt: new Date(now.getTime() - 150 * DAY).toISOString(),
      mustChangePassword: false,
    },
    {
      id: 'u4',
      username: 'ahmed',
      password: 'pbkdf2$150000$0000000000000000$demo',
      name: 'أحمد شعبان',
      role: 'staff',
      createdAt: new Date(now.getTime() - 60 * DAY).toISOString(),
      mustChangePassword: false,
    },
  ];
  const CASHIERS = ['u1', 'u3', 'u4', 'u2'];

  // ===== الخزائن =====
  const safes = [
    { id: 'safe1', name: 'الخزنة الرئيسية', balance: 0, isDefault: true, type: 'cash' },
    { id: 'safe2', name: 'محفظة فودافون كاش', balance: 0, isDefault: false, type: 'ewallet' },
    { id: 'safe3', name: 'حساب البنك (CIB)', balance: 0, isDefault: false, type: 'bank' },
  ];
  const OPENING = { safe1: 25000, safe2: 9000, safe3: 40000 };

  // ===== الموردين =====
  const suppliers = [
    { id: 'sup1', name: 'شركة النيل لتجارة المحمول', phone: '0223456789', address: 'القاهرة - العتبة', balance: 18500 },
    { id: 'sup2', name: 'مؤسسة الفؤاد للإكسسوارات', phone: '01001234567', address: 'الجيزة - فيصل', balance: 0 },
    { id: 'sup3', name: 'جلال import - قطع غيار', phone: '01119876543', address: 'القاهرة - وسط البلد', balance: 7350 },
    { id: 'sup4', name: 'شركة الدلتا للتوزيع', phone: '01223345566', address: 'المنصورة', balance: 0 },
    { id: 'sup5', name: 'سمارت تك للأجهزة الذكية', phone: '01556677889', address: 'القاهرة - مدينة نصر', balance: 12400 },
  ];

  // ===== المنتجات =====
  // hasIMEI = true → الكمية في القالب 0 والمخزون الحقيقي = عدد الأجهزة المتاحة
  const PRODUCTS = [
    { id: 'inv1', name: 'iPhone 15 Pro Max 256GB', cat: 'cat1', cost: 62000, sell: 68500, min: 2, imei: true, units: 6, tac: 35391011 },
    { id: 'inv2', name: 'iPhone 14 128GB', cat: 'cat1', cost: 38000, sell: 42500, min: 2, imei: true, units: 5, tac: 35392012 },
    { id: 'inv3', name: 'Samsung Galaxy S24 Ultra 512GB', cat: 'cat2', cost: 55000, sell: 61000, min: 2, imei: true, units: 4, tac: 35493013 },
    { id: 'inv4', name: 'Samsung Galaxy A55 5G 256GB', cat: 'cat2', cost: 15500, sell: 17900, min: 3, imei: true, units: 8, tac: 35494014 },
    { id: 'inv5', name: 'Xiaomi Redmi Note 13 Pro', cat: 'cat3', cost: 11200, sell: 13400, min: 4, imei: true, units: 10, tac: 86195015 },
    { id: 'inv6', name: 'Xiaomi Poco X6 Pro 5G', cat: 'cat3', cost: 13500, sell: 15900, min: 3, imei: true, units: 4, tac: 86196016 },
    { id: 'inv7', name: 'OPPO Reno 11 5G 256GB', cat: 'cat4', cost: 16800, sell: 19500, min: 2, imei: true, units: 5, tac: 86197017 },
    { id: 'inv8', name: 'Realme 12 Pro+ 5G', cat: 'cat4', cost: 14200, sell: 16800, min: 3, imei: true, units: 5, tac: 86198018 },
    { id: 'inv9', name: 'iPad 10th Generation 64GB', cat: 'cat6', cost: 21000, sell: 24500, min: 1, imei: true, units: 3, tac: 35399019 },
    { id: 'inv10', name: 'Apple Watch Series 9 45mm', cat: 'cat7', cost: 17500, sell: 20500, min: 2, imei: true, units: 3, tac: 35400020 },
    { id: 'inv11', name: 'Apple AirPods Pro 2 (USB-C)', cat: 'cat8', cost: 8500, sell: 10500, min: 2, imei: false, qty: 5 },
    { id: 'inv12', name: 'سماعة Anker Soundcore Q20', cat: 'cat8', cost: 1450, sell: 1899, min: 5, imei: false, qty: 12 },
    { id: 'inv13', name: 'شاحن Apple أصلي 20W', cat: 'cat9', cost: 620, sell: 850, min: 10, imei: false, qty: 25 },
    { id: 'inv14', name: 'كابل Type-C مضفر 1 متر', cat: 'cat9', cost: 90, sell: 175, min: 15, imei: false, qty: 18 },
    { id: 'inv15', name: 'جراب سيليكون iPhone 15 Pro', cat: 'cat10', cost: 85, sell: 200, min: 10, imei: false, qty: 40 },
    { id: 'inv16', name: 'واقي شاشة زجاج 9H', cat: 'cat11', cost: 35, sell: 120, min: 20, imei: false, qty: 60 },
    { id: 'inv17', name: 'باور بانك Anker 20000mAh', cat: 'cat12', cost: 1350, sell: 1850, min: 3, imei: false, qty: 7 },
    { id: 'inv18', name: 'شاشة iPhone 13 أصلية', cat: 'cat13', cost: 2400, sell: 3400, min: 2, imei: false, qty: 6 },
    { id: 'inv19', name: 'بطارية Samsung A50 أصلية', cat: 'cat14', cost: 320, sell: 550, min: 5, imei: false, qty: 11 },
    { id: 'inv20', name: 'فليكس شاحن iPhone', cat: 'cat15', cost: 140, sell: 300, min: 5, imei: false, qty: 5 },
  ];

  const COLORS = ['أسود', 'أبيض', 'أزرق تيتانيوم', 'ذهبي', 'بنفسجي', 'أخضر'];
  const STORAGE = { inv1: '256GB', inv2: '128GB', inv3: '512GB', inv4: '256GB', inv5: '256GB', inv6: '512GB', inv7: '256GB', inv8: '256GB', inv9: '64GB', inv10: '45mm' };
  const RAM = { inv1: '8GB', inv2: '6GB', inv3: '12GB', inv4: '8GB', inv5: '8GB', inv6: '12GB', inv7: '8GB', inv8: '12GB', inv9: '4GB', inv10: '-' };

  const inventory = PRODUCTS.map((p, i) => ({
    id: p.id,
    name: p.name,
    code: `MB-${1001 + i}`,
    barcode: ean13(100000 + i * 137 + 7),
    categoryId: p.cat,
    costPrice: p.cost,
    sellPrice: p.sell,
    quantity: p.imei ? 0 : p.qty,
    minQuantity: p.min,
    hasIMEI: !!p.imei,
    createdAt: new Date(now.getTime() - (180 - i * 6) * DAY).toISOString(),
  }));
  const productById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

  // ===== أجهزة IMEI =====
  const imeiUnits = [];
  let unitSeq = 1;
  PRODUCTS.filter((p) => p.imei).forEach((p) => {
    for (let i = 0; i < p.units; i++) {
      const purchasedAt = new Date(now.getTime() - intBetween(5, 90) * DAY);
      imeiUnits.push({
        id: `imei${unitSeq}`,
        inventoryId: p.id,
        imei1: imei(p.tac, unitSeq),
        imei2: p.name.includes('Apple Watch') ? '' : imei(p.tac + 1, unitSeq + 500),
        color: COLORS[(unitSeq + p.units) % COLORS.length],
        storage: STORAGE[p.id] || '256GB',
        ram: RAM[p.id] || '8GB',
        condition: unitSeq % 9 === 0 ? 'used' : unitSeq % 11 === 0 ? 'refurbished' : 'new',
        warrantyEndDate: new Date(purchasedAt.getTime() + 365 * DAY).toISOString().slice(0, 10),
        status: 'available',
        saleId: '',
        customerId: '',
        purchasePrice: Math.round(p.cost * (0.97 + random() * 0.06)),
        notes: '',
        createdAt: purchasedAt.toISOString(),
      });
      unitSeq++;
    }
  });

  // ===== العملاء =====
  const customers = [];
  for (let i = 1; i <= 12; i++) {
    customers.push({
      id: `cust${i}`,
      name: personName(),
      phone: phone(),
      address: pick(['القاهرة - المعادي', 'الجيزة - الهرم', 'القاهرة - مدينة نصر', 'القليوبية - شبرا الخيمة', 'القاهرة - حلوان', 'الجيزة - 6 أكتوبر', 'القاهرة - مصر الجديدة', '']),
      balance: 0,
      createdAt: new Date(now.getTime() - intBetween(3, 200) * DAY).toISOString(),
    });
  }
  // عميل نقدي افتراضي (زي ما النظام بيعمل)
  customers.unshift({
    id: 'walkin',
    name: 'عميل نقدي',
    phone: '',
    address: '',
    balance: 0,
    createdAt: new Date(now.getTime() - 365 * DAY).toISOString(),
  });

  // ===== المبيعات =====
  const sales = [];
  const transactions = [];
  const availableByProduct = {};
  imeiUnits.forEach((u) => {
    (availableByProduct[u.inventoryId] = availableByProduct[u.inventoryId] || []).push(u);
  });

  const accessoryPool = PRODUCTS.filter((p) => !p.imei);
  const devicePool = PRODUCTS.filter((p) => p.imei);
  const accessoryStock = Object.fromEntries(accessoryPool.map((p) => [p.id, p.qty]));

  // أوزان شعبية — بتخلي الدائرة البيانية في لوحة التحكم فيها ٣-٤ شرائح
  // كبيرة واضحة بدل عشر شرايح صغيرة متزاحمة.
  const SALE_WEIGHTS = {
    inv1: 3, inv2: 2, inv4: 3, inv5: 3, inv7: 2,
    inv11: 1, inv12: 2, inv13: 3, inv14: 1, inv15: 3, inv16: 3, inv17: 2,
  };
  const weightedPickFrom = (list) => {
    const weighted = list.flatMap((p) => Array(SALE_WEIGHTS[p.id] || 1).fill(p));
    return pick(weighted);
  };

  let invoiceSeq = 1;
  function makeSale(daysAgo, hour, minute, consumeStock = true) {
    const createdAt = new Date(now.getTime() - daysAgo * DAY);
    createdAt.setHours(hour, minute, intBetween(0, 59), 0);
    // مفيش فواتير في المستقبل
    if (createdAt > now) createdAt.setTime(now.getTime() - intBetween(1, 40) * 60000);

    const items = [];
    const itemCount = random() < 0.45 ? 1 : random() < 0.8 ? 2 : 3;
    let hasDevice = false;

    for (let i = 0; i < itemCount; i++) {
      const wantDevice = random() < (i === 0 ? 0.34 : 0.1);
      if (wantDevice) {
        const candidates = devicePool.filter((p) => !consumeStock || (availableByProduct[p.id] || []).length > 0);
        if (candidates.length === 0) continue;
        const p = weightedPickFrom(candidates);
        const unit = consumeStock ? availableByProduct[p.id].pop() : null;
        items.push({ p, unit, quantity: 1, unitPrice: p.sell });
        hasDevice = !!unit || hasDevice;
      } else {
        const p = weightedPickFrom(accessoryPool);
        const quantity = intBetween(1, 3);
        const q = consumeStock ? Math.min(quantity, Math.max(0, accessoryStock[p.id])) : quantity;
        if (consumeStock) accessoryStock[p.id] -= q;
        if (q < 1) continue;
        items.push({ p, unit: null, quantity: q, unitPrice: p.sell });
      }
    }
    if (items.length === 0) return null;

    const saleItems = items.map((it) => ({
      id: `si${sales.length + 1}-${items.indexOf(it) + 1}`,
      inventoryId: it.p.id,
      imeiUnitId: it.unit ? it.unit.id : undefined,
      quantity: it.quantity,
      unitPrice: round(it.unitPrice),
      costPrice: round(it.unit ? it.unit.purchasePrice : it.p.cost),
      total: round(it.unitPrice * it.quantity),
      returnedQuantity: 0,
    }));

    const subtotal = round(saleItems.reduce((s, it) => s + it.total, 0));
    const discount = random() < 0.25 ? round(Math.min(subtotal * 0.03, intBetween(50, 700))) : 0;
    const total = round(subtotal - discount);
    const cost = round(saleItems.reduce((s, it) => s + it.costPrice * it.quantity, 0));
    const profit = round(total - cost);

    // طريقة الدفع
    const roll = random();
    let paymentMethod, safeId, paid, remaining = 0, customerId = 'walkin';
    if (roll < 0.52) {
      paymentMethod = 'cash'; safeId = 'safe1'; paid = total;
    } else if (roll < 0.78) {
      paymentMethod = 'card'; safeId = random() < 0.25 ? 'safe2' : 'safe3'; paid = total;
    } else {
      paymentMethod = 'installment'; safeId = 'safe1';
      customerId = pick(customers.filter((c) => c.id !== 'walkin')).id;
      paid = round(total * (0.35 + random() * 0.3));
      remaining = round(total - paid);
    }
    // الفواتير الكبيرة غالباً باسم عميل
    if (hasDevice && customerId === 'walkin' && random() < 0.6) {
      customerId = pick(customers.filter((c) => c.id !== 'walkin')).id;
    }

    const sale = {
      id: `sale${sales.length + 1}`,
      invoiceNumber: `INV-${year}-${String(invoiceSeq++).padStart(4, '0')}`,
      customerId,
      items: saleItems,
      subtotal,
      discount,
      total,
      paid,
      remaining,
      profit,
      paymentMethod,
      cashierId: CASHIERS[intBetween(0, CASHIERS.length - 1)],
      safeId,
      notes: random() < 0.15 ? pick(['العميل طلب ضمان سنة', 'تسليم مع الإكسسوارات', 'فاتورة ضريبية']) : '',
      createdAt: createdAt.toISOString(),
    };

    // ربط الأجهزة المباعة بالفاتورة + تاريخ الضمان من تاريخ البيع
    items.forEach((it) => {
      if (!it.unit) return;
      const unit = imeiUnits.find((u) => u.id === it.unit.id);
      unit.status = 'sold';
      unit.saleId = sale.id;
      unit.customerId = customerId;
      unit.createdAt = sale.createdAt;
      unit.warrantyEndDate = new Date(new Date(sale.createdAt).getTime() + 365 * DAY).toISOString().slice(0, 10);
    });

    if (remaining > 0) {
      const c = customers.find((x) => x.id === customerId);
      if (c) c.balance = round(c.balance + remaining);
    }

    if (paid > 0) {
      transactions.push({
        id: `tx-sale-${sale.id}`,
        type: 'sale',
        amount: paid,
        description: `فاتورة بيع ${sale.invoiceNumber}`,
        referenceId: sale.id,
        safeId,
        userId: sale.cashierId,
        createdAt: sale.createdAt,
      });
    }

    sales.push(sale);
    return sale;
  }

  // تاريخ أقدم (٦ شهور) عشان الرسوم الشهرية في المالية تبيّن محل شغّال من زمان.
  // المبيعات القديمة ما بتخصمش المخزون الحالي (كان مخزون وقتها).
  for (let day = 175; day >= 30; day--) {
    const count = random() < 0.55 ? 1 : random() < 0.3 ? 2 : 0;
    for (let k = 0; k < count; k++) {
      makeSale(day, intBetween(11, 22), intBetween(0, 59), false);
    }
  }

  // توزيع المبيعات على آخر 30 يوم — النهارده أكتر يوم عشان لوحة التحكم تبان شغّالة
  for (let day = 29; day >= 0; day--) {
    const count = day === 0 ? 5 : day <= 2 ? intBetween(2, 3) : intBetween(0, 3);
    for (let k = 0; k < count; k++) {
      makeSale(day, intBetween(11, 22), intBetween(0, 59), true);
    }
  }
  sales.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // ===== ضمانات قاربت تنتهي (٣ أجهزة مباعة) =====
  // بتظهر في كارت "ضمانات تنتهي قريباً" في لوحة التحكم وفي الإشعارات.
  imeiUnits
    .filter((u) => u.status === 'sold')
    .slice(0, 3)
    .forEach((u, i) => {
      u.warrantyEndDate = new Date(now.getTime() + (9 + i * 8) * DAY).toISOString().slice(0, 10);
    });

  // ===== مرتجع واحد (يظهر في شاشة المبيعات) =====
  const saleReturns = [];
  const returnable = sales
    .slice()
    .reverse()
    .find((s) => s.items.some((it) => !it.imeiUnitId && it.quantity >= 1));
  if (returnable) {
    const item = returnable.items.find((it) => !it.imeiUnitId && it.quantity >= 1);
    item.returnedQuantity = 1;
    const refundAmount = round(item.unitPrice);
    returnable.total = round(returnable.total - refundAmount);
    returnable.paid = round(Math.max(0, returnable.paid - refundAmount));
    returnable.profit = round(returnable.profit - (refundAmount - item.costPrice));
    accessoryStock[item.inventoryId] += 1;
    const returnedAt = new Date(new Date(returnable.createdAt).getTime() + 2 * DAY);
    saleReturns.push({
      id: 'ret1',
      saleId: returnable.id,
      saleItemId: item.id,
      inventoryId: item.inventoryId,
      imeiUnitId: undefined,
      quantity: 1,
      refundAmount,
      reason: 'العميل غيّر رأيه — المنتج بحالته',
      createdAt: returnedAt.toISOString(),
      processedBy: 'u1',
    });
    transactions.push({
      id: 'tx-ret1',
      type: 'return',
      amount: -refundAmount,
      description: `مرتجع ${returnable.invoiceNumber}`,
      referenceId: 'ret1',
      safeId: returnable.safeId,
      userId: 'u1',
      createdAt: returnedAt.toISOString(),
    });
  }

  // رد الكميات المرتجعة للمخزون
  Object.entries(accessoryStock).forEach(([id, qty]) => {
    const p = PRODUCTS.find((x) => x.id === id);
    if (p) p.qty = qty;
  });

  // ===== تالف المخزون =====
  const stockWastes = [
    {
      id: 'waste1',
      inventoryId: 'inv14',
      supplierId: 'sup2',
      quantity: 3,
      unitCost: 90,
      totalCost: 270,
      reason: 'تالف',
      notes: 'كابلات اتقطعت أثناء النقل',
      createdAt: new Date(now.getTime() - 12 * DAY).toISOString(),
      userId: 'u2',
    },
    {
      id: 'waste2',
      inventoryId: 'inv16',
      supplierId: 'sup2',
      quantity: 5,
      unitCost: 35,
      totalCost: 175,
      reason: 'كسر',
      notes: 'واقيات شاشة اتكسرت في الدرج',
      createdAt: new Date(now.getTime() - 5 * DAY).toISOString(),
      userId: 'u1',
    },
  ];
  stockWastes.forEach((w) => {
    const p = PRODUCTS.find((x) => x.id === w.inventoryId);
    if (p && !p.imei) p.qty -= w.quantity;
    transactions.push({
      id: `tx-${w.id}`,
      type: 'waste',
      amount: -w.totalCost,
      description: `إهلاك مخزون — ${p ? p.name : w.inventoryId}`,
      referenceId: w.id,
      safeId: 'safe1',
      userId: w.userId,
      createdAt: w.createdAt,
    });
  });

  // الكميات النهائية لمنتجات الإكسسوار وقطع الغيار
  PRODUCTS.filter((p) => !p.imei).forEach((p) => {
    const row = inventory.find((i) => i.id === p.id);
    if (row) row.quantity = p.qty;
  });

  // ===== الصيانة =====
  const MAINT_SEED = [
    { status: 'received', days: 1, model: 'iPhone 14 128GB', problem: 'الشاشة مكسورة واللمس مش شغال', est: 3200 },
    { status: 'received', days: 9, model: 'Samsung Galaxy A55 5G 256GB', problem: 'الجهاز مش بيشحن خالص', est: 850 },
    { status: 'in_progress', days: 3, model: 'iPhone 15 Pro Max 256GB', problem: 'بطارية بتخلص بسرعة', est: 1900 },
    { status: 'in_progress', days: 11, model: 'Xiaomi Redmi Note 13 Pro', problem: 'السماعة الداخلية مش شغالة', est: 600 },
    { status: 'completed', days: 6, model: 'iPhone 14 128GB', problem: 'تغيير شاشة', est: 2800, final: 2950 },
    { status: 'delivered', days: 15, model: 'Samsung Galaxy S24 Ultra 512GB', problem: 'منفذ الشحن تالف', est: 900, final: 950 },
    { status: 'delivered', days: 20, model: 'OPPO Reno 11 5G 256GB', problem: 'الجهاز مبيعرفش الشبكة', est: 1200, final: 1350 },
    { status: 'delivered', days: 26, model: 'Realme 12 Pro+ 5G', problem: 'زر الباور مش بيستجيب', est: 450, final: 500 },
  ];
  const PARTS_BY_MODEL = {
    'iPhone 14 128GB': [{ id: 'inv18', name: 'شاشة iPhone 13 أصلية', quantity: 1 }],
    'Samsung Galaxy A55 5G 256GB': [{ id: 'inv20', name: 'فليكس شاحن iPhone', quantity: 1 }],
    'iPhone 15 Pro Max 256GB': [],
    'Xiaomi Redmi Note 13 Pro': [],
    'Samsung Galaxy S24 Ultra 512GB': [{ id: 'inv20', name: 'فليكس شاحن iPhone', quantity: 1 }],
    'OPPO Reno 11 5G 256GB': [],
    'Realme 12 Pro+ 5G': [],
  };

  const maintenance = MAINT_SEED.map((seed, i) => {
    const receivedAt = new Date(now.getTime() - seed.days * DAY);
    receivedAt.setHours(intBetween(11, 20), intBetween(0, 59), 0, 0);
    const parts = (PARTS_BY_MODEL[seed.model] || []).map((part, pi) => {
      const p = PRODUCTS.find((x) => x.id === part.id);
      return {
        id: `mp${i + 1}-${pi + 1}`,
        inventoryId: part.id,
        name: part.name,
        quantity: part.quantity,
        unitCost: p ? p.costPrice ?? p.cost : 0,
        total: p ? round((p.cost) * part.quantity) : 0,
      };
    });
    // استهلاك قطع الغيار من المخزون
    parts.forEach((part) => {
      const p = PRODUCTS.find((x) => x.id === part.inventoryId);
      if (p && !p.imei) {
        p.qty -= part.quantity;
        const row = inventory.find((r) => r.id === p.id);
        if (row) row.quantity = p.qty;
      }
    });

    const isDone = seed.status === 'completed' || seed.status === 'delivered';
    const finalCost = isDone ? seed.final : 0;
    const partsCost = round(parts.reduce((s, x) => s + x.total, 0));
    const additionalExpenses = 0;
    const collectedAmount = seed.status === 'delivered' ? finalCost : isDone ? round(finalCost * 0.5) : 0;
    const completedAt = isDone ? new Date(receivedAt.getTime() + intBetween(1, 3) * DAY).toISOString() : '';
    const deliveredAt = seed.status === 'delivered' ? new Date(new Date(completedAt).getTime() + intBetween(1, 2) * DAY).toISOString() : '';
    const safeId = 'safe1';

    const ticket = {
      id: `mnt${i + 1}`,
      ticketNumber: `MNT-${year}-${String(i + 1).padStart(3, '0')}`,
      customerName: personName(),
      customerPhone: phone(),
      deviceType: seed.model.includes('iPad') ? 'تابلت' : 'هاتف',
      deviceModel: seed.model,
      imeiLink: '',
      problem: seed.problem,
      diagnosis: isDone ? pick(['تم تغيير القطعة التالفة واختبار الجهاز', 'تم إصلاح العطل بنجاح', 'تم تنظيف البوردة وتغيير القطعة']) : '',
      status: seed.status,
      estimatedCost: seed.est,
      finalCost,
      collectedAmount,
      parts,
      additionalExpenses,
      profit: isDone ? round(finalCost - partsCost - additionalExpenses) : 0,
      technicianId: i % 2 === 0 ? 'u3' : 'u4',
      safeId,
      receivedAt: receivedAt.toISOString(),
      completedAt,
      deliveredAt,
      notes: '',
    };

    if (collectedAmount > 0) {
      transactions.push({
        id: `tx-mnt-${ticket.id}`,
        type: 'maintenance',
        amount: collectedAmount,
        description: `صيانة ${ticket.ticketNumber}`,
        referenceId: ticket.id,
        safeId,
        userId: ticket.technicianId,
        createdAt: deliveredAt || completedAt || ticket.receivedAt,
      });
    }
    return ticket;
  });

  // ربط جهازين متاحين بتذاكر "قيد الإصلاح" عشان شاشة IMEI تبيّن حالة صيانة
  const linkUnitToTicket = (model, productId) => {
    const ticket = maintenance.find((m) => m.status === 'in_progress' && m.deviceModel === model);
    const unit = imeiUnits.find((u) => u.status === 'available' && u.inventoryId === productId);
    if (ticket && unit) {
      unit.status = 'maintenance';
      ticket.imeiLink = unit.imei1;
    }
  };
  linkUnitToTicket('iPhone 15 Pro Max 256GB', 'inv1');
  linkUnitToTicket('Xiaomi Redmi Note 13 Pro', 'inv5');

  // ===== مشتريات (مفيش store للمشتريات — بتتسجل كمعاملات مالية) =====
  const purchases = [
    { days: 24, amount: 96000, supplier: 'sup1', desc: 'فاتورة شراء أجهزة iPhone/Samsung', safe: 'safe3' },
    { days: 18, amount: 24500, supplier: 'sup2', desc: 'فاتورة شراء إكسسوارات', safe: 'safe1' },
    { days: 11, amount: 15800, supplier: 'sup3', desc: 'فاتورة شراء قطع غيار', safe: 'safe1' },
    { days: 4, amount: 42000, supplier: 'sup5', desc: 'فاتورة شراء أجهزة ذكية', safe: 'safe3' },
  ];
  purchases.forEach((p, i) => {
    transactions.push({
      id: `tx-pur${i + 1}`,
      type: 'purchase',
      amount: -p.amount,
      description: p.desc,
      referenceId: `pur${i + 1}`,
      safeId: p.safe,
      userId: 'u2',
      createdAt: new Date(now.getTime() - p.days * DAY).toISOString(),
    });
  });

  // ===== مصروفات وإيرادات أخرى =====
  const misc = [
    { type: 'expense', days: 27, amount: -12000, desc: 'إيجار المحل — الشهر الحالي', safe: 'safe1' },
    { type: 'expense', days: 26, amount: -18000, desc: 'رواتب الموظفين', safe: 'safe1' },
    { type: 'expense', days: 20, amount: -1450, desc: 'فاتورة الكهرباء', safe: 'safe1' },
    { type: 'expense', days: 14, amount: -890, desc: 'مستلزمات المحل وأكياس', safe: 'safe1' },
    { type: 'expense', days: 7, amount: -650, desc: 'اشتراك الإنترنت', safe: 'safe1' },
    { type: 'income', days: 16, amount: 3200, desc: 'عمولة بيع خطوط واتصالات', safe: 'safe2' },
    { type: 'income', days: 9, amount: 1500, desc: 'خدمات تحويل وشحن رصيد', safe: 'safe2' },
    { type: 'capital', days: 120, amount: 74000, desc: 'رأس مال افتتاحي', safe: 'safe1' },
  ];
  misc.forEach((m, i) => {
    transactions.push({
      id: `tx-misc${i + 1}`,
      type: m.type,
      amount: m.amount,
      description: m.desc,
      referenceId: `misc${i + 1}`,
      safeId: m.safe,
      userId: 'u1',
      createdAt: new Date(now.getTime() - m.days * DAY).toISOString(),
    });
  });

  // ===== الحسابات الجانبية =====
  const sideAccountEntries = [
    {
      id: 'side1', partyName: 'شركة النيل لتجارة المحمول', type: 'payable', impact: 'main_safe',
      amount: 18500, paidAmount: 5000, status: 'partial',
      description: 'باقي فاتورة شاشات أصلية', notes: 'الاتفاق على السداد أول الشهر',
      safeId: 'safe1', safeDelta: -5000, transactionId: 'tx-side1', userId: 'u1',
      createdAt: new Date(now.getTime() - 15 * DAY).toISOString(),
      dueDate: new Date(now.getTime() + 10 * DAY).toISOString().slice(0, 10),
    },
    {
      id: 'side2', partyName: 'محمد فتحي — جملة إكسسوارات', type: 'receivable', impact: 'none',
      amount: 26000, paidAmount: 10000, status: 'partial',
      description: 'بيع جملة 40 جراب + 60 واقي شاشة', notes: 'بيسدّد أسبوعياً',
      safeId: 'safe1', safeDelta: 10000, transactionId: 'tx-side2', userId: 'u2',
      createdAt: new Date(now.getTime() - 8 * DAY).toISOString(),
      dueDate: new Date(now.getTime() + 5 * DAY).toISOString().slice(0, 10),
    },
    {
      id: 'side3', partyName: 'إيجار المحل — المالك', type: 'payable', impact: 'main_safe',
      amount: 12000, paidAmount: 12000, status: 'settled',
      description: 'إيجار الشهر الحالي', notes: '',
      safeId: 'safe1', safeDelta: -12000, transactionId: 'tx-side3', userId: 'u1',
      createdAt: new Date(now.getTime() - 27 * DAY).toISOString(),
      dueDate: new Date(now.getTime() - 25 * DAY).toISOString().slice(0, 10),
    },
    {
      id: 'side4', partyName: 'فني صيانة التكييف', type: 'outgoing', impact: 'main_safe',
      amount: 2400, paidAmount: 2400, status: 'settled',
      description: 'صيانة تكييف المحل', notes: '',
      safeId: 'safe1', safeDelta: -2400, transactionId: 'tx-side4', userId: 'u1',
      createdAt: new Date(now.getTime() - 6 * DAY).toISOString(),
      dueDate: new Date(now.getTime() - 6 * DAY).toISOString().slice(0, 10),
    },
  ];
  sideAccountEntries.forEach((e) => {
    if (e.paidAmount > 0) {
      transactions.push({
        id: e.transactionId,
        type: 'side_account',
        amount: e.impact === 'main_safe' ? (e.type === 'receivable' ? e.paidAmount : -e.paidAmount) : e.paidAmount,
        description: `حساب جانبي — ${e.partyName}`,
        referenceId: e.id,
        safeId: e.safeId,
        userId: e.userId,
        createdAt: e.createdAt,
      });
    }
  });

  // ===== سداد عميل (يقلل المديونية) =====
  const debtor = customers.filter((c) => c.balance > 3000).sort((a, b) => b.balance - a.balance)[0];
  if (debtor) {
    const payment = round(Math.min(debtor.balance, 4000));
    debtor.balance = round(debtor.balance - payment);
    transactions.push({
      id: 'tx-custpay1',
      type: 'customer_payment',
      amount: payment,
      description: `سداد مديونية — ${debtor.name}`,
      referenceId: debtor.id,
      safeId: 'safe1',
      userId: 'u1',
      createdAt: new Date(now.getTime() - 2 * DAY).toISOString(),
    });
  }

  // ===== جرد مخزون =====
  const auditItems = inventory.slice(10, 16).map((row, i) => {
    const counted = row.quantity + (i === 1 ? -2 : i === 3 ? 1 : 0);
    const difference = counted - row.quantity;
    return {
      id: `ai${i + 1}`,
      inventoryId: row.id,
      productName: row.name,
      code: row.code,
      categoryName: 'إكسسوارات',
      hasIMEI: false,
      costPrice: row.costPrice,
      systemQuantity: row.quantity,
      countedQuantity: counted,
      difference,
      differenceCost: round(difference * row.costPrice),
      notes: difference < 0 ? 'عجز في العد' : difference > 0 ? 'زيادة في العد' : '',
    };
  });
  const inventoryAudits = [
    {
      id: 'audit1',
      auditNumber: `AUD-${year}-0001`,
      title: 'جرد شهري — الإكسسوارات',
      status: 'applied',
      items: auditItems,
      totalShortage: round(auditItems.filter((i) => i.difference < 0).reduce((s, i) => s + Math.abs(i.differenceCost), 0)),
      totalSurplus: round(auditItems.filter((i) => i.difference > 0).reduce((s, i) => s + i.differenceCost, 0)),
      netDifferenceCost: round(auditItems.reduce((s, i) => s + i.differenceCost, 0)),
      notes: 'الجرد تم بحضور المسؤول',
      userId: 'u2',
      createdAt: new Date(now.getTime() - 3 * DAY).toISOString(),
      appliedAt: new Date(now.getTime() - 3 * DAY).toISOString(),
    },
  ];

  // ===== أرصدة الخزائن = افتتاحي + كل المعاملات =====
  safes.forEach((safe) => {
    const flow = transactions
      .filter((t) => t.safeId === safe.id)
      .reduce((sum, t) => sum + t.amount, 0);
    safe.balance = round((OPENING[safe.id] || 0) + flow);
  });

  // ===== إشعارات =====
  // سيبناها فاضية — `buildAutoNotifications` بيولّدها من البيانات نفسها
  // (نواقص المخزون / ضمانات قاربت تنتهي / صيانة متأخرة / مديونيات العملاء).
  const notifications = [];

  return {
    users,
    customers,
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
  };
}

module.exports = { buildDemoData, ean13, imei };
