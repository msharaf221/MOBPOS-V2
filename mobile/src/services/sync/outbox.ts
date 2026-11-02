// ============================================================
//  Mobile Outbox — طابور إعادة المحاولة المحلي
// ------------------------------------------------------------
//  المشكلة القديمة: أي بيع/مصروف/منتج بيتكتب والنتايل أو Supabase
//  بيرفض الطلب → الكتابة تختفي خالص من غير أي أثر.
//  الحل: كل سجل فاشل يتخزن هنا (localStorage/Capacitor) ويتعاد
//  إرساله أول ما الاتصال يرجع أو مع أول تحديث للشاشة.
// ============================================================

export interface OutboxRecord {
  id: string;
  branchId: string;
  store: string;
  recordId: string;
  data: Record<string, unknown>;
  version?: number;
  isDelete?: boolean;
  createdAt: string;
  retries: number;
  lastError?: string;
}

const STORAGE_KEY = 'mobpos_sync_outbox_v1';

function readAll(): OutboxRecord[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: OutboxRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // التخزين ممتلئ أو غير متاح — مانكسرش التطبيق بسبب الطابور
  }
}

/** يضيف دفعة سجلات للطابور، ويدمج أي سجل قديم بنفس (الفرع + المخزن + المعرّف). */
export function enqueueOutbox(
  branchId: string,
  records: Array<{ store: string; recordId: string; data?: unknown; version?: number; isDelete?: boolean }>,
  error?: string
): void {
  if (records.length === 0) return;
  const all = readAll();
  const now = new Date().toISOString();

  for (const record of records) {
    const key = `${branchId}|${record.store}|${record.recordId}`;
    const index = all.findIndex(
      item => `${item.branchId}|${item.store}|${item.recordId}` === key
    );
    const next: OutboxRecord = {
      id: `${key}|${now}`,
      branchId,
      store: record.store,
      recordId: record.recordId,
      data: (record.data && typeof record.data === 'object' ? record.data : {}) as Record<string, unknown>,
      version: record.version,
      isDelete: record.isDelete,
      createdAt: now,
      retries: index >= 0 ? all[index].retries + 1 : 1,
      lastError: error,
    };
    if (index >= 0) all[index] = next;
    else all.push(next);
  }

  // حد أقصى أمان عشان التخزين ما يتضخمش بلا نهاية
  writeAll(all.slice(-800));
}

export function getOutbox(branchId?: string): OutboxRecord[] {
  const all = readAll();
  return branchId ? all.filter(item => item.branchId === branchId) : all;
}

export function getOutboxCount(branchId?: string): number {
  return getOutbox(branchId).length;
}

export function removeOutboxRecords(ids: string[]): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  writeAll(readAll().filter(item => !idSet.has(item.id)));
}

export function clearOutbox(branchId?: string): void {
  if (!branchId) {
    writeAll([]);
    return;
  }
  writeAll(readAll().filter(item => item.branchId !== branchId));
}

/**
 * يعيد إرسال كل سجلات الطابور لفرع واحد باستخدام دالة الدفع الممررة.
 * بيرجع عدد السجلات اللي اترفعت بنجاح.
 */
export async function flushOutbox(
  branchId: string,
  push: (
    records: Array<{ store: string; recordId: string; data: unknown; version?: number; isDelete?: boolean }>
  ) => Promise<{ success: boolean; error?: string }>
): Promise<{ sent: number; error?: string }> {
  const pending = getOutbox(branchId);
  if (pending.length === 0) return { sent: 0 };

  // دفعات صغيرة عشان حجم الطلب يفضل معقول
  const BATCH_SIZE = 40;
  let sent = 0;
  let lastError: string | undefined;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const result = await push(
      batch.map(item => ({
        store: item.store,
        recordId: item.recordId,
        data: item.data,
        version: item.version,
        isDelete: item.isDelete,
      }))
    );

    if (result.success) {
      removeOutboxRecords(batch.map(item => item.id));
      sent += batch.length;
    } else {
      lastError = result.error;
      // نحدث عدد المحاولات ونوقف — لو السيرفر نفسه واقع مفيش فايدة نكمل
      const all = readAll();
      for (const item of batch) {
        const found = all.find(row => row.id === item.id);
        if (found) {
          found.retries += 1;
          found.lastError = result.error;
        }
      }
      writeAll(all);
      break;
    }
  }

  return { sent, error: lastError };
}
