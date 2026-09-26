import os

slices = [
  "useAuthSlice", "useCustomersSlice", "useCategoriesSlice", "useInventorySlice",
  "useIMEISlice", "useSalesSlice", "usePurchasesSlice", "useWasteSlice",
  "useAuditsSlice", "useSideAccountsSlice", "useMaintenanceSlice", "useSafesSlice",
  "useTransactionsSlice", "useNotificationsSlice", "useStatsSlice", "useUtilsSlice"
]

all_vars = [
    "users", "setUsers", "customers", "setCustomers", "categories", "setCategories",
    "inventory", "setInventory", "imeiUnits", "setImeiUnits", "sales", "setSales",
    "saleReturns", "setSaleReturns", "maintenance", "setMaintenance", "safes", "setSafes",
    "transactions", "setTransactions", "suppliers", "setSuppliers", "purchases", "setPurchases",
    "stockWastes", "setStockWastes", "inventoryAudits", "setInventoryAudits",
    "sideAccountEntries", "setSideAccountEntries", "notifications", "setNotifications",
    "auditLogs", "setAuditLogs", "currentUser", "setCurrentUser", "addAuditLog",
    "isDarkMode", "setIsDarkMode", "appSettings", "setAppSettings"
]

for s in slices:
    filepath = f"src/hooks/store/{s}.ts"
    if not os.path.exists(filepath): continue
    
    with open(filepath, "r", encoding="utf-8") as f:
        code = f.read()
    
    # We want to replace the destructuring line
    start_str = "const { "
    end_str = " } = state;"
    
    start_idx = code.find(start_str)
    end_idx = code.find(end_str, start_idx)
    
    if start_idx != -1 and end_idx != -1:
        rest_of_code = code[end_idx + len(end_str):]
        used_vars = [v for v in all_vars if v in rest_of_code]
        new_destruct = "  const { " + ", ".join(used_vars) + " } = state;"
        
        new_code = code[:start_idx] + new_destruct + rest_of_code
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_code)

print("Fixed unused vars.")
