import os
import re

with open("src/hooks/useStore.ts", "r", encoding="utf-8") as f:
    code = f.read()

# The pattern looks for comments like `  // Auth functions`
sections = [
    ("auth", "Auth functions"),
    ("customers", "Customer functions"),
    ("categories", "Category functions"),
    ("inventory", "Inventory functions"),
    ("imei", "IMEI functions"),
    ("sales", "Sales functions"),
    ("purchases", "Purchases functions"),
    ("waste", "Waste functions"),
    ("audits", "Inventory audit functions"),
    ("sideAccounts", "Side accounts functions"),
    ("maintenance", "Maintenance functions"),
    ("safes", "Safe functions"),
    ("transactions", "Transaction functions"),
    ("alerts", "Notifications engine"),
    ("stats", "Statistics"),
    ("utils", "Reset all data")
]

# We will just split the file manually since regex might miss some complex closures.
