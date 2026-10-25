import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// قراءة إصدار التطبيق من package.json ليظهر في إعدادات الجوال نسخةً حقيقية
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },
  server: {
    port: 5174,
    host: true,
  },
})
