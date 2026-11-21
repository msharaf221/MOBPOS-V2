# Pre-sale activation and update gates

Review date: 2026-11-21. Baseline: PR #20, commit 894d8fe.

Status: HOLD customer release and source-repository visibility change. This document is a proposed design and rollout checklist, not a deployed fix. No production credential was used, no production activation record was created, and no repository visibility changed during this review.

## Confirmed findings

1. `.env.local` removes a value from Git, not from a shipped application. A production build with a harmless `VITE_ACTIVATION_SERVER_TOKEN` canary included that canary literally in `dist/index.html`. Moving this credential to Electron main, ASAR or an obfuscated string would not make it a server secret.
2. The shared credential is not an admin credential in the checked-in server: `/revoke`, `/release`, and `/key/:id` require `ADMIN_TOKEN`. However, it grants activation access. The server currently accepts unsigned `keyId` and `deviceId`, without checking that the owner issued a signed license. Local tests confirmed this and confirmed that same-device reactivation returns an existing machine token without proving possession of that token. The client does verify ECDSA signatures locally; that does not secure a directly called server endpoint.
3. With the shared credential omitted, fresh activation against the checked-in server returns 401 and stores no activation. Existing signed, device-matched licenses start locally. Background verification maps 401 to `unknown`, preserves the license, and suppresses another check for 24 hours. Keeping the app open is therefore not proof that revocation or reactivation works after rotation.
4. The release workflows do not supply the VITE activation credential. A fresh CI build of #20 has the same missing-credential issue unless the workflow is separately changed.
5. The default SnapDeploy `/health` returned HTTP 503 and a container wake-up page throughout this bounded review. Production activation and actual token rotation are UNVERIFIED, not passed. The keep-warm workflow points at a different Render hostname.
6. The Windows 10/11 updater uses the source repository's public GitHub feed, with no client authentication. Windows 7 automatic updates are disabled; its manual check also calls the source repository API and links to its releases. If the source repo becomes private, old installations cannot discover a new feed by themselves. The app and its local data are not deleted, but updates and unauthenticated installer links stop working. The legacy manual checker can misleadingly report no update after a 404.

## Proposed activation protocol, server first

Use the customer's existing signed license as proof of issuance and a per-install machine token as proof of activation. Ship only the license verification PUBLIC key and service URL in application code. Never ship `ADMIN_TOKEN`, a GitHub token, a signing private key, or another shared authorization secret.

Add versioned endpoints without silently changing the legacy contract:

- `POST /v3/activate`: `{ licenseKey, deviceId, machineToken? }`. On the server, strictly parse the MSP2 payload, verify ECDSA P-256/SHA-256 using the same pinned public key as the app (WebCrypto signatures use IEEE-P1363 encoding), validate the schema and expiry, and derive `keyId` only from the verified payload. Do not trust a separate caller-supplied key ID.
- For a previously unused valid license, bind one device and return a new random machine token only after durable storage succeeds. A second device is rejected. Store token hashes where practical. Do not log the license or machine token.
- Same-device reactivation must require the existing machine token before returning or rotating it. Device IDs are identifiers, not secrets. A reinstall that lost its token needs an explicit owner-approved recovery/release flow, not automatic token disclosure. A signed license can otherwise still be copied and used to claim the public device ID.
- `POST /v3/verify`: verify the signed license, look up the binding, and require its machine token. Preserve existing valid tokens during migration. Return explicit revocation/binding decisions only after authenticating the installation. Handle missing legacy tokens with a recovery-required result, not automatic v1 token issuance or an unexplained license wipe.
- Keep admin operations separate, server-only, rate-limited, and require `ADMIN_TOKEN` to differ from every compatibility credential. No credential equality or production separation was verified in this review.
- Rate-limit abuse and cap body size. Back activation state with durable storage and backups. Current code can fall back to temporary/in-memory state and still report success after persistence failure, so fail-closed durable writes are a release gate, not merely a comment.

Rollout order:

1. Owner verifies hosting control, separates/rotates exposed or reused credentials, backs up activation data, and establishes a reliable health endpoint. Rotation may immediately break new activation and periodic verification in old clients. Do not promise those paths survive it.
2. Implement and test v3 on staging first. Preserve activation rows, machine tokens and revocations. Test restart/redeploy persistence and disk-full errors. Production changes require owner approval.
3. Deploy the new endpoints before building a v3 client. For a short, explicit compatibility period, decide whether legacy endpoints remain available. Their distributed credential must be treated as public and their trust limits remain. Do not leave this bridge open indefinitely. A leaked admin credential or reused personal password needs immediate owner containment, independent of the rollout.
4. Build the new client with no shared activation credential and no fallback to insecure legacy activation. Existing valid local licenses may stay usable offline while a clear verification warning/retry path is shown. Distinguish authentication/configuration failure from revocation. Do not silently label 401 as a successful verification.
5. Test fresh activation, second-device refusal, existing installation, restart, expired/revoked license, missing/wrong token, recovery, cold start, outage and migration of actual old versions on staging. Use a customer acceptance machine before the first sale.
6. After customers migrate, disable legacy endpoints and remove VITE activation-token plumbing and misleading build instructions. Audit the packaged renderer/main/ASAR and CI artifacts for known canaries and forbidden credentials.

This design does not make client-side licensing unpatchable. It removes the shared credential as a server authorization boundary and makes support/recovery decisions explicit.

## Update channel migration before making source private

1. Choose and approve a stable, separately accessible release channel, for example a releases-only public GitHub repository or HTTPS object storage/CDN. Publish installers, blockmaps and update manifests there without exposing source. Publishing credentials stay only in CI.
2. Keep this source repository accessible during migration. Publish a strictly newer bridge release through its current feed. That bridge must embed the NEW feed in `app-update.yml`, and change the Windows 7 manual-check API/download target, README links, scripts and release workflow destinations too. Uploading files elsewhere alone does not retarget an installed app.
3. From an actual old Windows 10/11 installation, test old-feed bridge download, installation, restart, data retention, and discovery of a second newer release using the new feed. For Windows 7 and portable distributions, separately test the supported manual installer path and data retention. Keep OS-specific artifacts separate so a legacy installation is never offered an incompatible runtime.
4. Keep the old feed alive until the supported installed base is migrated, or accept and communicate a manual-upgrade/support requirement for each remaining old installation. A long-offline customer misses the bridge if the repo goes private too soon. There is no guaranteed remote feed rewrite for such a client.
5. Only after those checks and owner approval should the source repo become private. Verify the new manifest AND every referenced binary/blockmap without GitHub login. Never embed a GitHub PAT in customers' apps to work around private downloads.

## Installer authenticity and remaining verification

The checked-in build configuration and workflows do not configure Windows signing credentials. The current release's Authenticode signature was not inspected, and this review does not certify it as signed or unsigned. Treat authenticity as unverified until the actual EXE is checked on Windows. This repo pins electron-builder 26 and electron-updater 6; newer documentation's v27 signed-manifest default must not be assumed here.

Before a paid delivery, sign installers with an owner-controlled certificate, verify the signature and expected publisher on the downloaded EXE, and test upgrade signer continuity. SHA-512 in `latest.yml` checks consistency with that manifest, not independent publisher identity when both files can be replaced. An unsigned installer may face Windows security warnings. Do not ask customers to disable protection as the normal install process.

## Reproduce the bounded checks

Install dependencies with `npm ci --ignore-scripts` and `npm --prefix activation-server ci --ignore-scripts` first. Test fixtures use no real credentials and never call production:

- `node --experimental-vm-modules scripts/review-license-gates.mjs`
- `node scripts/review-activation-server.mjs`
- `npm run typecheck` and `npm test`: passed; 155 existing tests passed.
- `VITE_ACTIVATION_SERVER_TOKEN=PUBLIC_BUILD_CANARY_NOT_A_SECRET npm run build`: passed; literal canary found in `dist/index.html`.

These regression probes intentionally describe the baseline defects, not the proposed v3 implementation. Once fixed, update their expectations to secure behavior. No Windows installation, real issuer key, deployed server credential, customer-machine test or production end-to-end activation was performed.

The current public `latest.yml` was fetched successfully without authentication and reported v1.0.38. That verifies present metadata access only, not an installation or the migration path.

## Sources

- https://github.com/msharaf221/MOBPOS-V2/pull/20
- https://github.com/msharaf221/MOBPOS-V2/pull/6
- https://github.com/msharaf221/MOBPOS-V2/releases/tag/v1.0.38
- https://github.com/msharaf221/MOBPOS-V2/releases/latest/download/latest.yml
- https://vite.dev/guide/env-and-mode
- https://www.electron.build/docs/features/auto-update/
- https://www.electron.build/docs/publish/
