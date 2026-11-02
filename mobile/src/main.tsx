import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// تسجيل Service Worker في نسخة الويب فقط (PWA) — وليس داخل تطبيق Capacitor
const capacitor = (window as unknown as {
  Capacitor?: { isNativePlatform?: () => boolean }
}).Capacitor
const isNativeShell = Boolean(capacitor?.isNativePlatform?.())

if (import.meta.env.PROD && !isNativeShell && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        // التسجيل اختياري — التطبيق يشتغل عادي من غير Service Worker
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
