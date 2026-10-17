/** POS domain types — extracted from the monolithic POS.tsx */
import type { Customer, InventoryItem, IMEIUnit, Safe, Category, SaleItem } from '../../types';

export interface POSProps {
  inventory: InventoryItem[];
  imeiUnits: IMEIUnit[];
  customers: Customer[];
  categories: Category[];
  safes: Safe[];
  shopName: string;
  receiptFooter: string;
  onCreateSale: (
    customerId: string,
    items: Omit<SaleItem, 'id' | 'returnedQuantity'>[],
    discount: number,
    paidAmount: number,
    paymentMethod: 'cash' | 'card' | 'installment',
    safeId: string,
    notes: string
  ) => { invoiceNumber: string } | null;
  onAddCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'balance'>) => Customer | null;
  onAddInventoryItem?: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => InventoryItem | null;
}

export interface CartItem {
  inventoryId: string;
  imeiUnitId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  costPrice: number;
  total: number;
  hasIMEI: boolean;
  imei1?: string;
  maxStock: number;
}

export interface ParkedSale {
  id: string;
  timestamp: string;
  cart: CartItem[];
  customer: Customer | null;
  discount: number;
  discountType: 'fixed' | 'percent';
  notes: string;
  total: number;
}

export interface ScanToast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

export interface ConfettiPiece {
  id: number;
  color: string;
  size: number;
  tx: number;
  ty: number;
  rot: number;
  delay: number;
}
