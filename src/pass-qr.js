import qrcode from '../vendor/qrcode.js';

// Byte mode must encode the STORED string, not a reconstructed JSON object.
qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
export function passQR(payload, titleId = 'pass-qr-title') {
  const qr = qrcode(0, 'M');
  qr.addData(payload, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true,
    title: { text: 'QR-код пропуска', id: titleId } });
}
