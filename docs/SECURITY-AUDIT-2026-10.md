# Security Audit — MOBPOS-V2 (2026-10)

Branch: `refactor/full-audit-restructure`  
Phase: أمان (after هيكلة)

## Findings & status

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **Critical** | Default `admin` / `admin123` accepted even after password was changed (could reset to plaintext) | **Fixed** in `useAuthSlice` + `lan-hub` — only when stored password is still the plain default or no users exist |
| 2 | **High** | `/api/lan/info` returned `lanPin` in cleartext to any LAN client | **Fixed** — response only includes `requiresPin: boolean` |
| 3 | **High** | `ACTIVATION_SERVER_TOKEN` hardcoded in `src/license/keys.ts` and shipped in client builds | **Fixed** — read from `VITE_ACTIVATION_SERVER_TOKEN` at build time; default empty |
| 4 | Medium | LAN write endpoints (`POST /api/lan/data`, `/api/lan/sync`) have no session auth; CORS `*` | Open — planned session token after `/api/lan/auth` |
| 5 | Medium | Most business mutations lack role checks (UI gates only for users/settings/audit) | Open — enforce `currentUser.role` in sensitive slices |
| 6 | Low | PIN login maps to an admin user on LAN | Documented risk — treat PIN as staff-level or disable when not needed |
| 7 | Info | Password storage uses PBKDF2-SHA256 (150k iters) + per-user salt; legacy rehash on login | Good |
| 8 | Info | Electron: `contextIsolation`, `sandbox`, no `nodeIntegration`; limited preload bridge | Good |
| 9 | Info | Activation server: mandatory `ADMIN_TOKEN` + `ACTIVATION_TOKEN`, rate limit, machine token | Good (ops must set env secrets) |

## Operator actions required

1. **Rotate** the old activation client token on the live server (`ACTIVATION_TOKEN`) — the previous value was in git history.
2. Set build env: `VITE_ACTIVATION_SERVER_TOKEN=<new token matching server>`.
3. Ensure every shop has changed the default admin password (forced via `mustChangePassword` when still default).
4. Prefer a strong LAN PIN only on trusted networks; do not rely on PIN as admin equivalent long-term.

## Next security work

- Issue short-lived LAN session tokens after `/api/lan/auth` and require them on mutating routes.
- Role checks inside store slices for delete safe, reset data, user management, finance deletes.
- Optional: bind LAN hub to private interface only / reject non-LAN IPs.
