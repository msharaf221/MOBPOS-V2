import { Project, SyntaxKind, VariableStatement, ReturnStatement } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

const project = new Project();
project.addSourceFilesAtPaths("src/hooks/**/*.ts");

const useStoreFile = project.getSourceFileOrThrow("src/hooks/useStore.ts");
const useStoreFunc = useStoreFile.getFunctionOrThrow("useStore");

const slices = {
  auth: ['login', 'logout', 'changePassword', 'updateUsers', 'updateSuppliers'],
  customers: ['addCustomer', 'updateCustomer', 'deleteCustomer', 'recordCustomerPayment', 'recordWalletTransaction'],
  categories: ['addCategory'],
  inventory: ['addInventoryItem', 'updateInventoryItem', 'deleteInventoryItem'],
  imei: ['addIMEIUnit', 'updateIMEIUnit', 'deleteIMEIUnit', 'findIMEIByNumber', 'getIMEIHistory'],
  sales: ['generateInvoiceNumber', 'createSale', 'processSaleReturn'],
  purchases: ['generatePurchaseNumber', 'createPurchase', 'recordSupplierPayment'],
  waste: ['recordStockWaste'],
  audits: ['createInventoryAudit', 'applyInventoryAudit', 'deleteInventoryAudit'],
  sideAccounts: ['addSideAccountEntry', 'updateSideAccountEntry', 'deleteSideAccountEntry'],
  maintenance: ['generateTicketNumber', 'createMaintenance', 'updateMaintenance', 'addMaintenancePart', 'removeMaintenancePart', 'deliverMaintenance'],
  safes: ['addSafe', 'deleteSafe', 'transferBetweenSafes'],
  transactions: ['addTransaction', 'deleteTransaction'],
  notifications: ['markNotificationAsRead', 'markAllNotificationsAsRead', 'dismissNotification', 'clearAllNotifications'],
  stats: ['getStatistics'],
  utils: ['resetAllData']
};

const sliceDir = path.join(__dirname, '../src/hooks/store/slices');
if (!fs.existsSync(sliceDir)) fs.mkdirSync(sliceDir, { recursive: true });

// 1. Generate StoreState type
// We can just define StoreState by exporting the type of the first half of useStore return value.
// But it's easier to just pass the whole state manually or let typescript infer it.
// Actually, let's just make the slices take all individual variables they need.
// No, the easiest is to pass `store: any` for now, or `store: ReturnType<typeof useStoreState>`.

console.log("Refactoring...");

