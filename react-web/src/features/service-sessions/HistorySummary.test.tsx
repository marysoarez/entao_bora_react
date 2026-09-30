import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HistorySummaryView } from "./HistorySummary";
import type { AccountState } from "./SessionAccount";
import type { ServiceSession } from "./model/serviceSession";

const start = new Date("2026-09-01T00:00:00Z");
const end = new Date("2026-10-01T00:00:00Z");
const session: ServiceSession = {
  id: "s", placeId: "p", tableId: "historical-table", serviceType: "table", status: "closed", customerCount: 4,
  openedAt: start, closedAt: new Date(+start + 3600000), openedBy: "u", closedBy: "u",
  source: "customer_qr", createdAt: start, updatedAt: start,
};
const render = (orders: AccountState, sessions = [session]) => renderToStaticMarkup(
  <HistorySummaryView placeId="p" sessions={sessions} orders={orders} tables={[]}
    period={{ start, end, timeZone: "America/Sao_Paulo" }} />,
);
it("shows historical IDs and transparent definitions without implying unique people or payments", () => {
  const html = render({ status: "ready", orders: [] });
  for (const label of ["historical-table", "sem deduplicação", "encerrar não registra pagamento", "60 min", "America/Sao_Paulo", "Mesa", "Balcão", "Salão", "Retirada"])
    expect(html).toContain(label);
});
it("does not report zero metrics for unavailable or unconfirmed orders", () => {
  for (const state of [{ status: "loading" }, { status: "disabled" }, { status: "error", message: "denied" }] as AccountState[]) {
    expect(render(state)).toContain("Resumo indisponível");
    expect(render(state)).not.toContain("<dl");
  }
});
it("blocks inconsistent historical data and distinguishes an empty period", () => {
  expect(render({ status: "ready", orders: [] }, [{ ...session, closedAt: null }])).toContain("Revise os dados");
  expect(render({ status: "ready", orders: [] }, [])).toContain("Sem atendimentos encerrados no período");
});
