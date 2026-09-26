import { AppSettings } from "../../types";
export const MAX_TEXT_LENGTH = 2_000;

/** نافذة تنبيه الضمان — نفس قيمة محرك التنبيهات (alerts.ts). */
export const WARRANTY_ALERT_DAYS = 30;

export const isFiniteNumber = (value: unknown): value is number => 
  typeof value === 'number' && Number.isFinite(value);

export const isPositiveInteger = (value: unknown): value is number => 
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const roundMoney = (value: number) => 
  Math.round(value * 100) / 100;

export const validText = (value: unknown, max = MAX_TEXT_LENGTH): value is string =>
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
