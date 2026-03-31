import QRCode from "qrcode";

/**
 * Gera data URL PNG do QR com o texto da matrícula (ou payload desejado).
 */
export async function generateQrDataUrl(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Texto da matrícula é obrigatório.");
  }
  return QRCode.toDataURL(text.trim(), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
  });
}
