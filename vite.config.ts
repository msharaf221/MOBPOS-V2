import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Read package.json at config time (no JSON import → no bundler attribute
// warning) and inject the version into the renderer as __APP_VERSION__.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isElectronDev = process.env.MOBPOS_ELECTRON_DEV === '1';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: '0.0.0.0', // bind 0.0.0.0 so the preview proxy can reach it
    port: 8420, // Electron dev must keep the stable OAuth/IndexedDB origin
    strictPort: true,
    allowedHosts: true, // allow preview hostnames
    ...(isElectronDev
      ? {
          hmr: {
            host: '127.0.0.1',
            protocol: 'ws',
            port: 8420,
          },
        }
      : {}),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Single source of truth for the app version (package.json) — shown in
  // Settings → About so it can never drift from the released build again.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
