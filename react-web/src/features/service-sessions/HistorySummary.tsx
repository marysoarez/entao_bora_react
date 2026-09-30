import { useState } from "react";
import { currency } from "../../shared/domain";
import type { PlaceTable } from "../tables/model/table";
import type { AccountState } from "./SessionAccount";
import type { ServiceSession } from "./model/serviceSession";
import { historyAnalytics, type HistoryPeriod } from "./model/historyAnalytics";

export function HistorySummaryView({
  placeId,
  sessions,
  orders,
  period,
  tables,
}: {
  placeId: string;
  sessions: ServiceSession[];
  orders: AccountState;
  period: HistoryPeriod;
  tables: PlaceTable[];
}) {
  if (orders.status !== "ready")
    return (
      <p>
        Resumo indisponível:{" "}
        {orders.status === "error"
          ? orders.message
          : orders.status === "disabled"
            ? "ative Pedidos para consultar os totais."
            : "aguardando os pedidos do servidor."}
      </p>
    );
  let report;
  try {
    report = historyAnalytics(placeId, sessions, orders.orders, period);
  } catch (error) {
    return (
      <p role="alert">
        Revise os dados antes de usar as métricas: {(error as Error).message}
      </p>
    );
  }
  const { summary } = report;
  const money = (cents: number | null) =>
    cents === null ? "—" : currency(cents / 100);
  const duration = (minutes: number | null) =>
    minutes === null ? "—" : `${Math.round(minutes)} min`;
  const labels = {
    table: "Mesa",
    counter: "Balcão",
    lounge: "Salão",
    takeaway: "Retirada",
  };
  return (
    <>
      <p>
        Atendimentos encerrados entre o início (inclusivo) e o fim (exclusivo).
        Fuso: {period.timeZone}.
      </p>
      <p>
        Clientes são visitas de pessoas registradas, sem deduplicação. Ticket
        médio por atendimento encerrado.
      </p>
      <p>
        Faturamento operacional é o consumo dos atendimentos encerrados, sem
        pedidos cancelados. Recebimentos não estão disponíveis: encerrar não
        registra pagamento.
      </p>
      {report.pendingOrdersInClosedSessions > 0 && (
        <p role="alert">
          Há {report.pendingOrdersInClosedSessions} pedido(s) ainda em andamento
          nos atendimentos encerrados. Revise antes de usar os totais.
        </p>
      )}
      <dl className="history-summary-metrics">
        <div>
          <dt>Atendimentos</dt>
          <dd>{summary.sessions}</dd>
        </div>
        <div>
          <dt>Clientes (visitas)</dt>
          <dd>{summary.customerVisits}</dd>
        </div>
        <div>
          <dt>Pedidos não cancelados</dt>
          <dd>{summary.orders}</dd>
        </div>
        <div>
          <dt>Ticket médio</dt>
          <dd>{money(summary.averageTicketCents)}</dd>
        </div>
        <div>
          <dt>Duração média</dt>
          <dd>{duration(summary.averageDurationMinutes)}</dd>
        </div>
        <div>
          <dt>Faturamento operacional</dt>
          <dd>{money(summary.operationalRevenueCents)}</dd>
        </div>
      </dl>
      <p>
        {report.cancelledSessions} atendimento(s) cancelado(s) excluído(s).{" "}
        {summary.cancelledOrders} pedido(s) cancelado(s) preservado(s) no
        histórico.
      </p>
      <p>
        Horários com mais aberturas dos atendimentos deste resumo:{" "}
        {report.peakArrivalHours.length
          ? report.peakArrivalHours
              .map((hour) => `${String(hour).padStart(2, "0")}h`)
              .join(", ")
          : "sem dados"}
        .
      </p>
      <details>
        <summary>Por mesa e tipo de atendimento</summary>
        <p>
          Ocupações e giro contam visitas encerradas por mesa no período. A
          duração considera a visita inteira. Ordenação por ocupações.
        </p>
        <div className="history-table-scroll">
          <table>
            <caption>Mesas mais utilizadas</caption>
            <thead>
              <tr>
                <th scope="col">Mesa</th>
                <th scope="col">Ocupações / giro</th>
                <th scope="col">Duração média</th>
                <th scope="col">Consumo / faturamento operacional</th>
              </tr>
            </thead>
            <tbody>
              {report.tables.map((row) => (
                <tr key={row.tableId}>
                  <th scope="row">
                    {tables.find((table) => table.id === row.tableId)?.name ||
                      row.tableId}
                  </th>
                  <td>{row.occupations}</td>
                  <td>{duration(row.averageDurationMinutes)}</td>
                  <td>{money(row.consumptionCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report.tables.length && <p>Nenhuma ocupação encerrada no período.</p>}
        <ul>
          {report.byServiceType.map((row) => (
            <li key={row.serviceType}>
              {labels[row.serviceType]}: {row.sessions} atendimento(s) ·{" "}
              {row.customerVisits} pessoas ·{" "}
              {money(row.operationalRevenueCents)}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Faturamento operacional por dia</summary>
        {report.daily.length ? (
          <ul>
            {report.daily.map((row) => (
              <li key={row.date}>
                {row.date}: {money(row.operationalRevenueCents)}
              </li>
            ))}
          </ul>
        ) : (
          <p>Sem atendimentos encerrados no período.</p>
        )}
      </details>
    </>
  );
}

export function HistorySummary(props: {
  placeId: string;
  sessions: ServiceSession[];
  orders: AccountState;
  tables: PlaceTable[];
}) {
  // Inputs and displayed hour buckets use the browser's explicit local timezone.
  const [start, setStart] = useState(
    () =>
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01T00:00`,
  );
  const [end, setEnd] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T00:00`;
  });
  return (
    <details className="history-summary">
      <summary>Histórico e resumo por período</summary>
      <div className="history-period">
        <label>
          Início
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label>
          Fim (exclusivo)
          <input
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </div>
      <HistorySummaryView
        {...props}
        period={{
          start: new Date(start),
          end: new Date(end),
          timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
        }}
      />
    </details>
  );
}
