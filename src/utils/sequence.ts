// ============================================================
//  ترقيم المستندات (فواتير / تذاكر / جرد)
// ------------------------------------------------------------
//  كل مولّدات الأرقام كانت شغالة بنفس الطريقة:
//      const count = list.filter(x => x.number.includes(year)).length + 1;
//
//  يعني الرقم مبني على **عدد** السجلات مش على آخر رقم اتصرف. أول ما
//  يتحذف سجل، أو تتستعاد نسخة احتياطية ناقصة، أو تتدمج داتا من جهاز
//  تاني — العدّاد بيرجع لورا و**يتكرر رقم فاتورة**. ورقم فاتورة متكرر
//  يعني مستندين مختلفين بنفس الاسم في كل التقارير.
//
//  الحل: نقرأ التسلسل الحقيقي من الأرقام الموجودة ونكمّل من أعلى واحد.
// ============================================================

/**
 * يقرأ التسلسل من رقم مستند بصيغة `PREFIX-YYYY-NNNN`.
 * بيرجع `null` لو الرقم مش على الصيغة دي أو سنته مختلفة.
 */
export function parseSequence(value: unknown, prefix: string, year: number): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^([A-Za-z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;
  if (match[1].toUpperCase() !== prefix.toUpperCase()) return null;
  if (Number(match[2]) !== year) return null;
  const sequence = Number(match[3]);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : null;
}

/**
 * الرقم التالي لسنة معيّنة = (أعلى تسلسل موجود) + 1، مش (عدد السجلات) + 1.
 *
 * @param existingNumbers أرقام المستندات الحالية (كلها، مش المفلترة بالسنة)
 * @param prefix          بادئة المستند: INV / PUR / MNT / AUD
 * @param pad             عدد خانات التسلسل (4 للفواتير، 3 لتذاكر الصيانة)
 */
export function nextDocumentNumber(
  existingNumbers: readonly unknown[],
  prefix: string,
  pad = 4,
  year = new Date().getFullYear()
): string {
  let highest = 0;
  for (const value of existingNumbers) {
    const sequence = parseSequence(value, prefix, year);
    if (sequence !== null && sequence > highest) highest = sequence;
  }
  return `${prefix}-${year}-${String(highest + 1).padStart(pad, '0')}`;
}
