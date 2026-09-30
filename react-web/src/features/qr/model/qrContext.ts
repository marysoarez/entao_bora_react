export interface QrContext {
  userId: string;
  placeId: string;
  serviceSessionId: string;
  tableId: string | null;
  source: "qr";
}

export function parseQrTableNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) throw Error("Número de mesa inválido no QR.");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw Error("Número de mesa inválido no QR.");
  return number;
}

export function qrPath(slug: string, tableNumber?: number | null) {
  const base = `/checkin/${encodeURIComponent(slug)}`;
  return tableNumber == null ? base : `${base}?table=${String(tableNumber).padStart(2, "0")}`;
}
