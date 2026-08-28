/**
 * Live alerts engine.
 *
 * Turns the shop's real data (stock, warranties, repair tickets, customer
 * debts) into notifications. Every alert gets a **deterministic id** derived
 * from the record it points at, so `useStore` can diff the list between runs:
 * new alerts are added, alerts whose condition no longer holds are dropped,
 * and the read/dismissed state of the surviving ones is preserved.
 *
 * Pure & side-effect free — no IndexedDB access here on purpose, which keeps
 * it unit-testable.
 */

import type { Customer, IMEIUnit, InventoryItem, Maintenance, Notification } from '../types';

export interface AutoAlertInput {
  inventory: InventoryItem[];
  imeiUnits: IMEIUnit[];
  maintenance: Maintenance[];
  customers: Customer[];
}

/** How many individual alerts per category before collapsing into one summary row. */
const MAX_PER_TYPE = 5;
/** Warranty window in days — same rule as the Dashboard "ضمانات تنتهي قريباً" card. */
const WARRANTY_WINDOW_DAYS = 30;
/** A repair ticket counts as delayed after this many days since it was received. */
const MAINTENANCE_DELAY_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(
    (typeof localStorage !== 'undefined' && localStorage.getItem('app_locale')) || 'ar-EG',
    {
      style: 'currency',
      currency: (typeof localStorage !== 'undefined' && localStorage.getItem('app_currency')) || 'EGP',
      maximumFractionDigits: 0,
    }
  ).format(value || 0);
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

/**
 * Real on-hand quantity: for IMEI products the stock is the number of
 * available units, not the template's `quantity` field (which stays 0).
 * Same rule as `useStore.getStatistics` and the Inventory page.
 */
function realQuantityOf(item: InventoryItem, imeiUnits: IMEIUnit[]): number {
  if (!item.hasIMEI) return item.quantity || 0;
  return imeiUnits.filter(u => u.inventoryId === item.id && u.status === 'available').length;
}

/** Splits a list into the rows shown individually + the count left over. */
function capList<T>(items: T[]): { shown: T[]; rest: number } {
  return { shown: items.slice(0, MAX_PER_TYPE), rest: Math.max(0, items.length - MAX_PER_TYPE) };
}

export function buildAutoNotifications(input: AutoAlertInput): Notification[] {
  const { inventory, imeiUnits, maintenance, customers } = input;
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const alerts: Notification[] = [];

  const push = (alert: Omit<Notification, 'isRead' | 'createdAt' | 'source'>) => {
    alerts.push({ ...alert, isRead: false, createdAt, source: 'auto' });
  };

  // ── 1) Low stock ─────────────────────────────────────────────────────────
  const lowStock = inventory
    .map(item => ({ item, realQuantity: realQuantityOf(item, imeiUnits) }))
    .filter(({ item, realQuantity }) => realQuantity <= (item.minQuantity || 0))
    // most critical first
    .sort((a, b) => a.realQuantity - b.realQuantity || a.item.name.localeCompare(b.item.name, 'ar'));

  const lowStockCapped = capList(lowStock);
  lowStockCapped.shown.forEach(({ item, realQuantity }) => {
    push({
      id: `auto:low_stock:${item.id}`,
      type: 'low_stock',
      title: `مخزون منخفض: ${item.name}`,
      message: `المتاح ${realQuantity} فقط — الحد الأدنى ${item.minQuantity || 0}`,
      link: 'inventory',
    });
  });
  if (lowStockCapped.rest > 0) {
    push({
      id: 'auto:low_stock:_summary',
      type: 'low_stock',
      title: `${lowStockCapped.rest} منتج آخر بمخزون منخفض`,
      message: `إجمالي ${lowStock.length} منتج وصلوا للحد الأدنى — راجع المخزون`,
      link: 'inventory',
    });
  }

  // ── 2) Warranties expiring soon ──────────────────────────────────────────
  const expiringWarranties = imeiUnits
    .filter(u => u.status === 'sold' && !!u.warrantyEndDate)
    .map(u => {
      const end = new Date(u.warrantyEndDate).getTime();
      return { unit: u, end, daysLeft: daysBetween(now, end) };
    })
    .filter(({ end, daysLeft }) => !Number.isNaN(end) && end >= now && daysLeft <= WARRANTY_WINDOW_DAYS)
    .sort((a, b) => a.end - b.end);

  const warrantyCapped = capList(expiringWarranties);
  warrantyCapped.shown.forEach(({ unit, daysLeft }) => {
    const label = unit.imei1 || unit.id;
    push({
      id: `auto:warranty_expiring:${unit.id}`,
      type: 'warranty_expiring',
      title: daysLeft === 0 ? `ضمان ينتهي اليوم: ${label}` : `ضمان ينتهي خلال ${daysLeft} يوم: ${label}`,
      message: `ينتهي في ${formatDate(unit.warrantyEndDate)}`,
      link: 'imei',
    });
  });
  if (warrantyCapped.rest > 0) {
    push({
      id: 'auto:warranty_expiring:_summary',
      type: 'warranty_expiring',
      title: `${warrantyCapped.rest} ضمان آخر ينتهي قريباً`,
      message: `إجمالي ${expiringWarranties.length} جهاز ضمانه ينتهي خلال ${WARRANTY_WINDOW_DAYS} يوم`,
      link: 'imei',
    });
  }

  // ── 3) Delayed repair tickets ────────────────────────────────────────────
  const delayedMaintenance = maintenance
    .filter(m => m.status === 'received' || m.status === 'in_progress')
    .map(m => {
      const received = new Date(m.receivedAt).getTime();
      return { ticket: m, received, daysOpen: Number.isNaN(received) ? 0 : daysBetween(received, now) };
    })
    .filter(({ daysOpen }) => daysOpen >= MAINTENANCE_DELAY_DAYS)
    .sort((a, b) => b.daysOpen - a.daysOpen);

  const maintenanceCapped = capList(delayedMaintenance);
  maintenanceCapped.shown.forEach(({ ticket, daysOpen }) => {
    push({
      id: `auto:maintenance_delayed:${ticket.id}`,
      type: 'maintenance_delayed',
      title: `صيانة متأخرة: ${ticket.ticketNumber}`,
      message: `${ticket.customerName} — ${ticket.deviceModel || ticket.deviceType} من ${daysOpen} يوم`,
      link: 'maintenance',
    });
  });
  if (maintenanceCapped.rest > 0) {
    push({
      id: 'auto:maintenance_delayed:_summary',
      type: 'maintenance_delayed',
      title: `${maintenanceCapped.rest} تذكرة صيانة أخرى متأخرة`,
      message: `إجمالي ${delayedMaintenance.length} تذكرة مفتوحة أكتر من ${MAINTENANCE_DELAY_DAYS} أيام`,
      link: 'maintenance',
    });
  }

  // ── 4) Outstanding customer debts ────────────────────────────────────────
  const debts = customers
    .filter(c => (c.balance || 0) > 0)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));

  const debtsCapped = capList(debts);
  debtsCapped.shown.forEach(customer => {
    push({
      id: `auto:customer_debt:${customer.id}`,
      type: 'customer_debt',
      title: `مديونية مستحقة: ${customer.name}`,
      message: `المتبقي ${formatCurrency(customer.balance || 0)}`,
      link: 'customers',
    });
  });
  if (debtsCapped.rest > 0) {
    const restTotal = debts.slice(MAX_PER_TYPE).reduce((sum, c) => sum + (c.balance || 0), 0);
    push({
      id: 'auto:customer_debt:_summary',
      type: 'customer_debt',
      title: `${debtsCapped.rest} عميل آخر عليه مديونية`,
      message: `بإجمالي ${formatCurrency(restTotal)}`,
      link: 'customers',
    });
  }

  return alerts;
}

/**
 * Merges freshly computed alerts into the stored notification list.
 *
 * Rules:
 *  - a live alert that is not stored yet → added (unread);
 *  - a live alert already stored → text refreshed, `isRead`/`dismissed` kept,
 *    so a dismissed alert never comes back while its condition still holds;
 *  - a stored `source: 'auto'` alert that is no longer live → removed;
 *  - stored rows with **no** `source` → legacy imports (the app itself never
 *    creates them; they came from restored backups). They are hidden, which is
 *    what used to leave the bell badge stuck on a number nothing could clear;
 *  - any other stored row → left untouched.
 *
 * Returns the **same array reference** when nothing changed so callers can
 * skip the write and avoid a render loop.
 */
export function mergeAutoNotifications(existing: Notification[], autoAlerts: Notification[]): Notification[] {
  const storedById = new Map(existing.map(n => [n.id, n]));
  const next: Notification[] = [];
  const liveIds = new Set<string>();
  let changed = false;

  for (const alert of autoAlerts) {
    liveIds.add(alert.id);
    const stored = storedById.get(alert.id);
    if (!stored) {
      next.push(alert);
      changed = true;
      continue;
    }
    const merged: Notification = {
      ...stored,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      link: alert.link,
      source: 'auto',
    };
    if (
      stored.type !== merged.type ||
      stored.title !== merged.title ||
      stored.message !== merged.message ||
      stored.link !== merged.link ||
      stored.source !== 'auto'
    ) {
      changed = true;
    }
    next.push(merged);
  }

  for (const n of existing) {
    if (liveIds.has(n.id)) continue; // already handled above
    if (n.source === 'auto') {
      changed = true; // condition resolved → drop it
      continue;
    }
    if (!n.source && !n.dismissed) {
      next.push({ ...n, dismissed: true }); // legacy import → hide it
      changed = true;
      continue;
    }
    next.push(n);
  }

  return changed ? next : existing;
}

/** Newest first; ties keep the urgency order the engine produced (stable sort). */
function byNewestFirst(a: Notification, b: Notification): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * What the bell actually shows. Dismissed alerts stay in the store so the
 * engine won't resurrect them, but they must never reach the list or the badge
 * — that combination is what used to leave the counter stuck on a number no
 * action in the UI could clear.
 */
export function selectVisibleNotifications(list: Notification[]): Notification[] {
  return list.filter(n => !n.dismissed).sort(byNewestFirst);
}

/** Unread count shown on the bell badge. */
export function countUnreadNotifications(list: Notification[]): number {
  return list.reduce((count, n) => (n.dismissed || n.isRead ? count : count + 1), 0);
}
