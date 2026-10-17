# Security Audit — MOBPOS-V2 (2026-10)

Branch: `refactor/full-audit-restructure`  
Phase: أمان (after هيكلة)

## Findings & status

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **Critical** | Default `admin` / `admin123` after password change | **Fixed** — only when stored password still plain default |
| 2 | **High** | `/api/lan/info` leaked `lanPin` | **Fixed** — `requiresPin` only |
| 3 | **High** | Hardcoded `ACTIVATION_SERVER_TOKEN` | **Fixed** — `VITE_ACTIVATION_SERVER_TOKEN` |
| 4 | Medium | LAN write endpoints unauthenticated | **Fixed** — session token after `/api/lan/auth`; localhost bypass for host |
| 5 | Medium | Mutations without role checks | **Fixed** — `hasMinRole` on updateUsers, resetAllData, deleteTransaction (+ existing deleteSafe) |
| 6 | Low | PIN login maps to admin on LAN | Documented |
| 7–9 | Info | PBKDF2, Electron isolation, activation server | Good |

## LAN sessions

- After successful `POST /api/lan/auth`, server returns `sessionToken` (12h TTL).
- Client stores it in `sessionStorage` and sends `Authorization: Bearer` + `X-Lan-Session` on `/api/lan/data` and `/api/lan/sync`.
- Requests from `127.0.0.1` / `::1` (host Electron) skip the check so the primary machine can still broadcast.
- Logout calls `clearLanSession()`.

## Role guards (store layer)

| Operation | Min role |
|-----------|----------|
| `updateUsers` | admin |
| `resetAllData` | admin |
| `deleteSafe` | admin (existing) |
| `deleteTransaction` | manager |

UI nav filters remain in `Layout.tsx` (staff / manager / admin page sets).

## Operator actions

1. Rotate server `ACTIVATION_TOKEN` (old value was in git history).
2. Build with `VITE_ACTIVATION_SERVER_TOKEN=<matching token>`.
3. Ensure shops changed default admin password.
