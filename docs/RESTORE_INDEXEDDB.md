# استعادة useIndexedDB.ts

أثناء الدفع الآلي اتكسر الملف. لاستعادة النسخة الكاملة من الكوميت السليم:

```bash
curl -sL "https://raw.githubusercontent.com/msharaf221/MOBPOS-V2/5ac5c2b45fbf84aeefe4dec4cea4199f90bceea1/src/hooks/useIndexedDB.ts" \
  -o src/hooks/useIndexedDB.ts
```

ثم اعمل commit:

```bash
git add src/hooks/useIndexedDB.ts
git commit -m "fix: restore full useIndexedDB implementation"
git push
```

النسخة الحالية في البرانش **stub مؤقت** (ذاكرة فقط، بدون IndexedDB) حتى لا ينهار الـ build.
