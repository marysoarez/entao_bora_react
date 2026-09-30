import type { PlaceTable } from "../tables/model/table";
import { QrCodeCard } from "./QrCodeCard";
import { qrPath } from "./model/qrContext";

export function QrManagementPanel({ slug, tables = [], general = true }: { slug: string; tables?: PlaceTable[]; general?: boolean }) {
  if (!slug) return <p role="alert">Defina um slug para gerar os QR Codes.</p>;
  return <section className="qr-management">
    <h2>QR Codes</h2>
    <p>Os links identificam o estabelecimento e, quando indicado, a mesa física. Eles não contêm um atendimento.</p>
    <div className="qr-grid">
      {general && <QrCodeCard path={qrPath(slug)} label="QR do estabelecimento" />}
      {tables.filter(table => table.active).map(table => <QrCodeCard key={table.id} path={qrPath(slug, table.number)} label={`Mesa ${String(table.number).padStart(2, "0")}`} />)}
    </div>
  </section>;
}
