export function formatCurrency(amount?: number | null, hideAmounts: boolean = false): string {
  if (hideAmounts) return '••••••';
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 0,
  }).format(num) + ' ج.م';
}

export function formatNumber(num?: number | null, hideAmounts: boolean = false): string {
  if (hideAmounts) return '•••';
  return new Intl.NumberFormat('ar-EG').format(Number(num) || 0);
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
