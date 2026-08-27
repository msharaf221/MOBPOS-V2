import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// خط القاهرة مضمّن داخل التطبيق — يشتغل بدون إنترنت تماماً
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/700.css";
import "./index.css";
import App from "./App";

// Prevent scrolling on number inputs from changing their value
document.addEventListener('wheel', () => {
  if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
    // Only blur if they are actually scrolling, to prevent accidental value changes
    document.activeElement.blur();
  }
}, { passive: true });

// ===== إحساس التطبيق الحقيقي: تعطيل سلوكيات صفحات الويب =====
// 1) ممنوع الزوم بـ Ctrl + عجلة الماوس
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// 2) ممنوع اختصارات الزوم Ctrl + / Ctrl - / Ctrl 0 / Ctrl =
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
    e.preventDefault();
  }
});

// 3) ممنوع إسقاط ملف على النافذة فيتنقل بعيداً عن التطبيق
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
