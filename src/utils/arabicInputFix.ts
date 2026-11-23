// ============================================================
//  إصلاح عام لإدخال الأرقام العربية المشرقية (٠١٢٣...) على كل حقول
//  التطبيق — مهم جداً لنسخة ويندوز 7 لأن لوحة المفاتيح العربية في
//  المحلات بتنتج أرقام عربية مشرقية افتراضياً.
//
//  المشكلة: Chromium بيرفض إدخال ٠-٩ في <input type="number"> تماماً
//  (بيطلع beforeinput لكن ما بيحصلش إدخال ولا input event)، والحروف
//  العربية في الحقول النصية بتتخزن كأرقام عربية (١٢٣) فما بتطابقش
//  الباركود ولا البحث.
//
//  الحل: نسمع beforeinput في مرحلة الـ capture (قبل React)، ولو النص
//  المُدخل فيه أرقام عربية نمنعه ونحقن بداله النسخة المطبّعة بـ
//  execCommand('insertText') — المتصفح نفسه بيطلع beforeinput/input
//  طبيعيين للنص المطبّع، فـ React يسمع التغيير عادي كأنه كتابة أصلية.
// ============================================================

import { hasLocalizedDigits, normalizeDigits } from './digits';

let installed = false;

export function installArabicInputFix(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener(
    'beforeinput',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      // النص المُدخل: e.data في الكتابة العادية، و dataTransfer في اللصق
      let inserted: string | null = event.data;
      if (
        inserted == null &&
        (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') &&
        event.dataTransfer
      ) {
        try {
          inserted = event.dataTransfer.getData('text/plain');
        } catch {
          inserted = null;
        }
      }
      if (!inserted || !hasLocalizedDigits(inserted)) return;

      // امنع الإدخال الأصلي (اللي هيترفض في number أو يتخزن عربي في text)
      event.preventDefault();
      const normalized = normalizeDigits(inserted);

      // الحقن عبر execCommand بيحافظ على مكان المؤشر والتحديد، وبيطلع
      // beforeinput + input طبيعيين (بنص مطبّع ما فيهوش أرقام عربية،
      // فالمعالج ده بيرجع فوراً ومفيش recursion).
      const ok = document.execCommand('insertText', false, normalized);
      if (!ok) {
        // fallback للحقول اللي بتدعم selection API (نصية فقط — number بيرمي)
        try {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? target.value.length;
          target.setRangeText(normalized, start, end, 'end');
          target.dispatchEvent(
            new InputEvent('input', { bubbles: true, inputType: event.inputType, data: normalized })
          );
        } catch {
          // مفيش طريقة إدخال آمنة — نتجاهل بدل ما نكسر الكتابة
        }
      }
    },
    true
  );
}
