import QRCode from 'qrcode';

/**
 * Payment-link QR (plan week 11: "QR code for the payment link").
 *
 * The path is generated on the server from the exact link printed on the
 * document, and only a path string reaches the renderer: no markup, no scripts,
 * no third-party image. A link that is not https gets no QR.
 */
export function paymentQr(link: string | null | undefined): { path: string; size: number } | null {
  if (!link) return null;

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  try {
    const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    let path = '';
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (data[y * size + x]) path += `M${x},${y}h1v1h-1z`;
      }
    }
    return path ? { path, size } : null;
  } catch {
    return null;
  }
}
