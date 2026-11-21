# Windows 7 renderer compatibility audit

## Verified defect and limit

Electron 22.3.27 embeds Chromium 108.0.5359.215. Tailwind 4 supports Chrome 111 and later. The actual v1.0.38 Win7 x64 installer was extracted and its renderer tested in Electron 22.3.27 on Linux. Its activation screen rendered, so this does **not** reproduce or prove the cause of the reported fully blank window on Windows 7 hardware. It did reproduce broken effects: `blur-3xl` computed to `none` instead of `blur(64px)`.

The shipped build already converts OKLCH colors to RGB fallbacks. It would be incorrect to claim all shipped colors fail because of OKLCH alone.

## Changes

- `npm run build:win7` compiles an isolated `dist-win7` renderer with Tailwind 3.4.19 and PostCSS 8.5.33, retaining the existing component class names. Modern/mobile builds keep Tailwind 4.
- Win7 packaging maps `dist-win7` to the application's `dist` directory. Both release workflow copies build and verify this renderer before packaging.
- `npm run verify:win7` rejects unsupported modern color/property features in emitted CSS and checks startup assets, utility output and packaging configuration.
- A dependency-free classic startup script displays an Arabic diagnostic if module startup fails, rejects, or remains on the splash for 30 seconds. It does not clear user data or print license/customer details.
- Electron shows native load/crash diagnostics rather than leaving an unexplained window. Existing software-rendering flags remain enabled on the legacy runtime.
- The lockfile is synchronized with the existing package manifest as well as the new legacy build dependencies. That also removes packages already absent from the manifest. The lockfile is compact JSON to keep the browser review edit manageable, with no change to its JSON structure.

## Reproducible checks

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run build:win7
npm run verify:win7
# Install Electron 22.3.27 separately, not over the modern devDependency:
ELECTRON22_EXECUTABLE=/path/to/electron22 xvfb-run -a npm run test:win7
```

On Windows omit `xvfb-run -a` and set the environment variable using the shell's syntax. The test insists on Electron 22.3.27 / Chromium 108. It launches the actual sandboxed preload and production activation screen from a temporary app with the isolated renderer, checks colors/opacity/gradient/blur/shadow output and forced startup diagnostics. A second test uses the existing **development-only** demo to open dashboard, inventory, POS and settings on that same engine. No production license bypass is introduced.

At review time: a clean dependency install, 155 unit tests, typecheck, both renderer builds, static verifier, and both Electron 22 tests passed on Linux. Windows x64 and ia32 unpacked builds also completed; the packaged x64 ASAR renderer, guard and preload matched the intended source bytes. The separate Chromium 108 smoke workflow repeats the engine tests on pull requests and saves screenshots. This is not a Windows installer execution test, hardware/GPU test, printer test, full sales/returns regression, or a claim that every screen is error-free.

## Required Windows retest before release

1. Back up shop data first. Do not uninstall with data deletion or clear browser storage.
2. Record the failing version, installer filename, Windows edition/service pack, 32/64-bit OS and GPU/driver.
3. After review and a Windows CI build, install the matching Win7 x86/ia32 or x64 artifact on the affected machine. Do not use the modern Windows 10/11 installer.
4. Test activation/login, dashboard, light/dark themes, POS sale/return/receipt, inventory, settings, backup/restore and LAN/cloud behavior with test data.
5. If still blank, capture the new native dialog or UI-START/UI-PROMISE/UI-TIMEOUT code and a screenshot. A native process failure before JavaScript starts still needs OS-level investigation.

## Remaining release risks, not closed by this patch

- Electron 22 and Windows 7 are end-of-life. Keeping this runtime is a legacy compatibility exception, not a security upgrade. Prefer a supported Windows/runtime for connected use.
- The extracted v1.0.38 `MOBPOS.exe` has no embedded Authenticode certificate table. This check alone does not establish all possible catalog-signing status.
- Activation/server credential and update-channel gates from the separate pre-sale review remain open. This change does not make the application ready for unrestricted commercial release.
- Dependency audit findings remain in the existing toolchain. The new PostCSS dependency is pinned to the current patched 8.5.33 rather than the vulnerable older release initially tested. Audit each remaining advisory separately, not with a blind breaking-version upgrade.

## Sources

- https://releases.electronjs.org/release/v22.3.27
- https://releases.electronjs.org/release/v22.2.0
- https://tailwindcss.com/docs/compatibility
- https://tailwindcss.com/docs/upgrade-guide
- https://github.com/msharaf221/MOBPOS-V2/releases/download/v1.0.38/MOBPOS-Setup-Win7-64bit.exe
