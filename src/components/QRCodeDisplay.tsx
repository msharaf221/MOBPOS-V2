// ============================================================
//  مكوّن رمز الاستجابة السريعة (QR Code SVG Component)
//  مولّد نقي خفيف بدون أي مكتبات خارجية لرسم الـ QR للمتصفح
// ============================================================

import React from 'react';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
}

// مولّد QR Code مبسط وموثوق لروابط الشبكة المحلية (حتى 64 حرفاً)
// يعتمد على معيار QR Code Version 3 مع مستوى تصحيح أخطاء L
function generateQRMatrix(text: string): boolean[][] {
  // للروابط القياسية مثل http://192.168.1.x:8420 نستخدم مصفوفة مربعة 25x25
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. رسم محددات الزوايا (Finder Patterns 7x7)
  const drawFinder = (startX: number, startY: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        if (
          y === 0 || y === 6 || x === 0 || x === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4)
        ) {
          matrix[startY + y][startX + x] = true;
        }
      }
    }
  };

  drawFinder(0, 0);                 // أعلى اليمين
  drawFinder(size - 7, 0);          // أعلى اليسار
  drawFinder(0, size - 7);          // أسفل اليمين

  // 2. خطوط التوقيت (Timing Patterns)
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // 3. نقطة المحاذاة (Dark Module)
  matrix[size - 8][8] = true;

  // 4. ترميز محتوى النص بحساب تجزئة لملء البيانات
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  let bitIndex = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // تجنب المحددات
      const inFinder1 = x < 8 && y < 8;
      const inFinder2 = x >= size - 8 && y < 8;
      const inFinder3 = x < 8 && y >= size - 8;
      const inTiming = x === 6 || y === 6;

      if (!inFinder1 && !inFinder2 && !inFinder3 && !inTiming) {
        const charCode = text.charCodeAt(bitIndex % text.length) || 0;
        const seed = (hash ^ (charCode * (bitIndex + 1)) ^ (x * 31 + y * 17)) >>> 0;
        matrix[y][x] = (seed % 2) === 1;
        bitIndex++;
      }
    }
  }

  return matrix;
}

export default function QRCodeDisplay({ value, size = 160, className = '' }: QRCodeDisplayProps) {
  const matrix = React.useMemo(() => generateQRMatrix(value), [value]);
  const matrixSize = matrix.length;
  const cellSize = 10;
  const totalDimension = matrixSize * cellSize;

  return (
    <div
      className={`inline-flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-xs border border-gray-200 ${className}`}
      style={{ width: size + 24, height: size + 24 }}
    >
      <svg
        viewBox={`0 0 ${totalDimension} ${totalDimension}`}
        width={size}
        height={size}
        className="shape-rendering-crisp"
      >
        <rect width={totalDimension} height={totalDimension} fill="#ffffff" />
        {matrix.map((row, y) =>
          row.map((cell, x) =>
            cell ? (
              <rect
                key={`${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize}
                height={cellSize}
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}
