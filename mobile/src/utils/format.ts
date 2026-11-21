/**
 * اليوم **المحلي** بصيغة `YYYY-MM-DD` — لمقارنات «اليوم» في الفلاتر والمؤشرات.
 * `toISOString().slice(0, 10)` يرجّع تاريخ UTC، فينتقل «اليوم» الساعة 2/3
 * بعد منتصف الليل بتوقيت مصر بدل منتصف الليل المحلي، وكانت مبيعات أول
 * الليل تتحسب على اليوم السابق. بدون وسيط يرجّع يوم التشغيل الحالي.
 */
export function localDayStr(value?: string | number | Date | null): string {
  const date = value === undefined || value === null ? new Date() : (value instanceof Date ? value : new Date(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatCurrency(amount?: number | null, hideAmounts: boolean = false): string {
  if (hideAmounts) return '••••••';
  const num = Number(amount) || 0;
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  // استخدام علامة LRM لمنع قلب إشارة السالب في اتجاه RTL لظهور -1,000,000 ج.م
  return `\u200E${isNegative ? '-' : ''}${absFormatted} ج.م`;
}

export function formatNumber(num?: number | null, hideAmounts: boolean = false): string {
  if (hideAmounts) return '•••';
  const val = Number(num) || 0;
  const isNegative = val < 0;
  const absFormatted = Math.abs(val).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return `\u200E${isNegative ? '-' : ''}${absFormatted}`;
}

export function formatTimeAgo(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 30) return 'الآن';
    if (diff < 60) return `منذ ${Math.floor(diff)} ثانية`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `منذ ${min} دقيقة`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  } catch {
    return dateStr;
  }
}

export function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
