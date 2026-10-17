# Performance — MOBPOS-V2 (2026-10)

Branch: `refactor/full-audit-restructure`

## Baseline (already good)

| Area | Notes |
|------|--------|
| IndexedDB | Delta writes + coalesce; multi-store atomic path |
| Lists | `usePagination` on large tables |
| POS grid | Load-more window, not full catalog DOM |
| IMEI stock | `buildImeiStockIndex` once per change |
| Audit log | Capped at 5000 entries |

## This phase

| # | Change | Impact |
|---|--------|--------|
| 1 | Stable `dispatch` (`stateRef`) | No cascade of slice callback rebuilds on every write |
| 2 | `getStatistics` on demand | Heavy scans only when Dashboard renders |
| 3 | POS search index + barcode/code maps | Cheaper filter + O(1) scan |
| 4 | `WRITE_COALESCE_MS` 40 → 64 | Better batching under rapid clicks |

## Apply large-file patches locally

```bash
bash apply-performance-fixes.sh /path/to/MOBPOS-V2
git push origin refactor/full-audit-restructure
```
