// ============================================================
//  مكوّن رمز الاستجابة السريعة (QR Code Component)
//  يولّد رمز QR قياسي 100% متوافق مع معايير كاميرات الهواتف
// ============================================================

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
}

export default function QRCodeDisplay({ value, size = 160, className = '' }: QRCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (!value) return;

    QRCode.toDataURL(value, {
      margin: 1,
      width: size * 2, // دقة مضاعفة للشاشات عالية الكثافة Retina / High-DPI
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url: string) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err: unknown) => {
        console.error('[QRCodeDisplay] Failed to generate QR code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [value, size]);

  return (
    <div
      className={`inline-flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-xs border border-gray-200 ${className}`}
      style={{ width: size + 24, height: size + 24 }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`QR Code for ${value}`}
          width={size}
          height={size}
          className="rounded-md select-none pointer-events-none"
        />
      ) : (
        <div
          className="flex items-center justify-center bg-gray-50 rounded-md animate-pulse text-center p-2"
          style={{ width: size, height: size }}
        >
          <span className="text-xs text-gray-400">جاري إنشاء الرمز...</span>
        </div>
      )}
    </div>
  );
}
