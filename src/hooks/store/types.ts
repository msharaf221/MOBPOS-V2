import { Dispatch, SetStateAction } from 'react';
import {
  User, Customer, Category, InventoryItem, IMEIUnit,
  Sale, SaleReturn, Maintenance, Safe, Transaction, Supplier, Notification,
  Purchase, StockWaste, InventoryAudit, SideAccountEntry,
  AppSettings, AuditLogEntry
} from '../../types';

export interface StoreState {
  users: User[]; setUsers: Dispatch<SetStateAction<User[]>>;
  customers: Customer[]; setCustomers: Dispatch<SetStateAction<Customer[]>>;
  categories: Category[]; setCategories: Dispatch<SetStateAction<Category[]>>;
  inventory: InventoryItem[]; setInventory: Dispatch<SetStateAction<InventoryItem[]>>;
  imeiUnits: IMEIUnit[]; setImeiUnits: Dispatch<SetStateAction<IMEIUnit[]>>;
  sales: Sale[]; setSales: Dispatch<SetStateAction<Sale[]>>;
  saleReturns: SaleReturn[]; setSaleReturns: Dispatch<SetStateAction<SaleReturn[]>>;
  maintenance: Maintenance[]; setMaintenance: Dispatch<SetStateAction<Maintenance[]>>;
  safes: Safe[]; setSafes: Dispatch<SetStateAction<Safe[]>>;
  transactions: Transaction[]; setTransactions: Dispatch<SetStateAction<Transaction[]>>;
  suppliers: Supplier[]; setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  purchases: Purchase[]; setPurchases: Dispatch<SetStateAction<Purchase[]>>;
  stockWastes: StockWaste[]; setStockWastes: Dispatch<SetStateAction<StockWaste[]>>;
  inventoryAudits: InventoryAudit[]; setInventoryAudits: Dispatch<SetStateAction<InventoryAudit[]>>;
  sideAccountEntries: SideAccountEntry[]; setSideAccountEntries: Dispatch<SetStateAction<SideAccountEntry[]>>;
  notifications: Notification[]; setNotifications: Dispatch<SetStateAction<Notification[]>>;
  auditLogs: AuditLogEntry[]; setAuditLogs: Dispatch<SetStateAction<AuditLogEntry[]>>;
  
  currentUser: User | null; setCurrentUser: Dispatch<SetStateAction<User | null>>;
  isDarkMode: boolean; setIsDarkMode: Dispatch<SetStateAction<boolean>>;
  appSettings: AppSettings; setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  
  addAuditLog: (entry: AuditLogEntry) => void;
}
