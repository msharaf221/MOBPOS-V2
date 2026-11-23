// ============================================================
//  تطبيع الأرقام العربية المشرقية (٠١٢٣٤٥٦٧٨٩) والفارسية (۰۱۲۳۴۵۶۷۸۹)
//  لوحة المفاتيح العربية على ويندوز بتكتب أرقام عربية مشرقية، وحقول
//  <input type="number"> بترفضها تماماً في المتصفح (الحرف ما بيدخلش
//  خالص، لكن المسح بيشتغل) — وده كان سبب إن الكاشير على ويندوز 7
//  «بيمسح بس مش بيكتب» في أسعار المنتجات والكميات.
// ============================================================

const EASTERN_ARABIC_DIGIT_START = 0x0660; // ٠
const EXTENDED_ARABIC_DIGIT_START = 0x06f0; // ۰
const ARABIC_DECIMAL_SEPARATOR = '٫'; // U+066B
const ARABIC_THOUSANDS_SEPARATOR = '٬'; // U+066C

/** يحوّل الأرقام العربية/الفارسية لأرقام لاتينية، والفاصلة العشرية العربية لنقطة */
export function normalizeDigits(text: string): string {
  if (!text) return text;
  let out = '';
  let changed = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= EASTERN_ARABIC_DIGIT_START && cp <= EASTERN_ARABIC_DIGIT_START + 9) {
      out += String(cp - EASTERN_ARABIC_DIGIT_START);
      changed = true;
    } else if (cp >= EXTENDED_ARABIC_DIGIT_START && cp <= EXTENDED_ARABIC_DIGIT_START + 9) {
      out += String(cp - EXTENDED_ARABIC_DIGIT_START);
      changed = true;
    } else if (ch === ARABIC_DECIMAL_SEPARATOR) {
      out += '.';
      changed = true;
    } else if (ch === ARABIC_THOUSANDS_SEPARATOR) {
      changed = true; // تسقط فواصل الآلاف
    } else {
      out += ch;
    }
  }
  return changed ? out : text;
}

/** هل النص فيه أي محارف عربية رقمية محتاجة تطبيع؟ */
export function hasLocalizedDigits(text: string | null | undefined): boolean {
  return !!text && /[٠-٩۰-۹٫٬]/.test(text);
}

/** يحوّل نص مدخل (قد يحتوي أرقام عربية) لرقم — بديل Number(e.target.value) */
export function parseLocalizedNumber(text: string): number {
  return Number(normalizeDigits(text));
}
