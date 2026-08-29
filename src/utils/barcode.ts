// Barcode generation and rendering utilities for POS & Inventory
// Generates standard barcodes and prints barcode label stickers

/**
 * Calculates EAN-13 checksum digit
 */
export function calculateEAN13Checksum(code12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code12[i] || '0', 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
}

/**
 * Generates a unique 13-digit barcode (Egypt prefix 622 or random standard)
 */
export function generateBarcode(existingBarcodes: string[] = []): string {
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    // Use 622 prefix (Egypt) + 9 random digits + 1 checksum digit
    const randomDigits = Math.floor(Math.random() * 900000000 + 100000000).toString();
    const base12 = '622' + randomDigits;
    const checksum = calculateEAN13Checksum(base12);
    const barcode = base12 + checksum;
    if (!existingBarcodes.includes(barcode)) {
      return barcode;
    }
  }
  return '622' + Date.now().toString().slice(-10);
}

/**
 * Simple Code 128-B encoder to SVG paths for rendering barcode stripes
 */
const CODE128_PATTERNS: Record<number, string> = {
  0: '212222', 1: '222122', 2: '222221', 3: '121223', 4: '121322',
  5: '131222', 6: '122213', 7: '122312', 8: '132212', 9: '221213',
  10: '221312', 11: '231212', 12: '112232', 13: '122132', 14: '122231',
  15: '113222', 16: '123122', 17: '123221', 18: '223211', 19: '221132',
  20: '221231', 21: '213212', 22: '223112', 23: '312131', 24: '311222',
  25: '321122', 26: '321221', 27: '312212', 28: '322112', 29: '322211',
  30: '212123', 31: '212321', 32: '232121', 33: '111323', 34: '131123',
  35: '131321', 36: '112313', 37: '132113', 38: '132311', 39: '211313',
  40: '231113', 41: '231311', 42: '112133', 43: '112331', 44: '132131',
  45: '113123', 46: '113321', 47: '133121', 48: '313121', 49: '211331',
  50: '231131', 51: '213113', 52: '213311', 53: '213131', 54: '311123',
  55: '311321', 56: '331121', 57: '312113', 58: '312311', 59: '332111',
  60: '314111', 61: '221411', 62: '431111', 63: '111224', 64: '111422',
  65: '121124', 66: '121421', 67: '141122', 68: '141221', 69: '112214',
  70: '112412', 71: '122114', 72: '122411', 73: '142112', 74: '142211',
  75: '241211', 76: '221114', 77: '413111', 78: '241112', 79: '134111',
  80: '111242', 81: '121142', 82: '121241', 83: '114212', 84: '124112',
  85: '124211', 86: '411212', 87: '421112', 88: '421211', 89: '212141',
  90: '214121', 91: '412121', 92: '111143', 93: '111341', 94: '131141',
  95: '114113', 96: '114311', 97: '411113', 98: '411311', 99: '113141',
  100: '114131', 101: '311141', 102: '411131', 103: '211412', 104: '211214',
  105: '211232', 106: '2331112'
};

export function encodeCode128(text: string): string {
  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const code = charCode - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
      checksum += code * (i + 1);
    }
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  let patternStr = '';
  for (const c of codes) {
    patternStr += CODE128_PATTERNS[c] || '';
  }

  return patternStr;
}

/**
 * Generates an SVG data URL for a given barcode string
 */
export function generateBarcodeSvg(barcode: string, height = 48): string {
  if (!barcode) return '';
  const pattern = encodeCode128(barcode);
  if (!pattern) return '';

  const barWidth = 2;
  let currentX = 10;
  const rects: string[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const width = parseInt(pattern[i], 10) * barWidth;
    if (i % 2 === 0) {
      // Black bar
      rects.push(`<rect x="${currentX}" y="0" width="${width}" height="${height}" fill="currentColor" />`);
    }
    currentX += width;
  }

  const totalWidth = currentX + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" class="w-full h-full">${rects.join('')}</svg>`;
}

/**
 * Print Barcode Sticker / Label Modal Utility
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printBarcodeSticker(
  itemName: string,
  price: number,
  barcode: string,
  shopName: string,
  copies = 1
) {
  const safeItemName = escapeHtml(itemName);
  const safeBarcode = escapeHtml(barcode);
  const safeShopName = escapeHtml(shopName);
  const copyCount = Math.min(1000, Math.max(1, Math.floor(Number(copies) || 1)));
  const formattedPrice = new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0
  }).format(price);

  const svgBarcode = generateBarcodeSvg(barcode, 40);

  const printWindow = window.open('', '_blank', 'width=450,height=600');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }

  let labelsHtml = '';
  for (let i = 0; i < copyCount; i++) {
    labelsHtml += `
      <div class="sticker-card">
        <div class="shop-title">${safeShopName}</div>
        <div class="item-name">${safeItemName}</div>
        <div class="barcode-svg">${svgBarcode}</div>
        <div class="barcode-text">${safeBarcode}</div>
        <div class="price-tag">${formattedPrice}</div>
      </div>
    `;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>طباعة باركود - ${safeItemName}</title>
      <style>
        @page {
          size: auto;
          margin: 4mm;
        }
        body {
          font-family: 'Cairo', system-ui, sans-serif;
          margin: 0;
          padding: 8px;
          background: #fff;
          color: #000;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }
        .sticker-card {
          width: 50mm;
          min-height: 28mm;
          box-sizing: border-box;
          border: 1px dashed #bbb;
          padding: 4px 6px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          page-break-inside: avoid;
        }
        @media print {
          .sticker-card {
            border: none;
          }
        }
        .shop-title {
          font-size: 9px;
          font-weight: bold;
          color: #555;
        }
        .item-name {
          font-size: 11px;
          font-weight: bold;
          line-height: 1.2;
          max-width: 46mm;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin: 1px 0;
        }
        .barcode-svg {
          width: 44mm;
          height: 14mm;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 1px 0;
        }
        .barcode-svg svg {
          max-width: 100%;
          max-height: 100%;
        }
        .barcode-text {
          font-family: monospace;
          font-size: 10px;
          letter-spacing: 1.5px;
          margin-top: 1px;
        }
        .price-tag {
          font-size: 12px;
          font-weight: 900;
          color: #000;
          margin-top: 1px;
        }
      </style>
    </head>
    <body>
      ${labelsHtml}
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() {
            window.close();
          }, 500);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
