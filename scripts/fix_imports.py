import os
import glob

files = glob.glob("src/hooks/store/use*Slice.ts")

for filepath in files:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Just replace all imports from `../../types` with a full wildcard or specific list
    import_types = "import { User, Customer, Category, InventoryItem, IMEIUnit, Sale, SaleItem, SaleReturn, Maintenance, MaintenancePart, Safe, Transaction, Supplier, Notification, Purchase, PurchaseItem, StockWaste, InventoryAudit, InventoryAuditItem, SideAccountEntry, SideAccountEntryType, SideAccountImpact, AppSettings, AuditLogEntry } from '../../types';"
    import_db = "import { indexedDBUtils } from '../useIndexedDB';"
    
    # We will just append the missing imports if not present
    if "import { indexedDBUtils" not in content:
        content = content.replace("import { StoreState } from './types';", "import { StoreState } from './types';\n" + import_db)
        
    # Replace the existing `../../types` import entirely
    import re
    content = re.sub(r'import \{[^}]+\} from \'\.\.\/\.\.\/types\';', import_types, content)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

print("Imports fixed.")
