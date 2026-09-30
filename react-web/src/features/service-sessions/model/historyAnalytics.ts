import { orderStatuses, type Order } from "../../orders/model/order";
import { sessionAccount } from "./sessionAccount";
import {
  serviceTypes,
  validateServiceSessionInput,
  type ServiceSession,
} from "./serviceSession";

export interface HistoryPeriod {
  start: Date;
  end: Date;
  timeZone: string;
}
export interface HistoryMetrics {
  sessions: number;
  customerVisits: number;
  orders: number;
  cancelledOrders: number;
  consumptionCents: number;
  /** Closed-account consumption, not payment receipts. */
  operationalRevenueCents: number;
  receivedRevenueCents: null;
  averageTicketCents: number | null;
  averageDurationMinutes: number | null;
}
const validDate = (date: Date) =>
  date instanceof Date && Number.isFinite(+date);
const inPeriod = (date: Date, period: HistoryPeriod) =>
  date >= period.start && date < period.end;

/** Closed-at cohort, [start, end). All inputs must be complete authorized histories. */
export function historyAnalytics(
  placeId: string,
  sessions: readonly ServiceSession[],
  orders: readonly Order[],
  period: HistoryPeriod,
) {
  if (
    !placeId ||
    !validDate(period.start) ||
    !validDate(period.end) ||
    period.start >= period.end
  )
    throw Error("Informe um período válido, com início anterior ao fim.");
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: period.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = (date: Date) =>
    Object.fromEntries(
      clock.formatToParts(date).map((part) => [part.type, part.value]),
    );
  const local = sessions.filter((session) => session.placeId === placeId);
  const byId = new Map<string, ServiceSession>();
  for (const session of local) {
    if (!session.id || byId.has(session.id))
      throw Error("Atendimento duplicado ou sem identificação.");
    validateServiceSessionInput(session);
    if (
      !validDate(session.openedAt) ||
      !["open", "closed", "cancelled"].includes(session.status) ||
      !session.source?.trim() ||
      (session.status === "open"
        ? session.closedAt !== null
        : !session.closedAt ||
          !validDate(session.closedAt) ||
          session.closedAt < session.openedAt)
    )
      throw Error(`Histórico inválido no atendimento ${session.id}.`);
    byId.set(session.id, session);
  }
  const localOrders = orders.filter((order) => order.placeId === placeId);
  const orderIds = new Set<string>();
  const groupedOrders = new Map<string, Order[]>();
  for (const order of localOrders) {
    const session = byId.get(order.serviceSessionId);
    if (
      !order.id ||
      orderIds.has(order.id) ||
      !session ||
      !orderStatuses.includes(order.status) ||
      order.tableId !== session.tableId ||
      order.serviceType !== session.serviceType ||
      !validDate(order.createdAt) ||
      order.createdAt < session.openedAt ||
      (session.closedAt && order.createdAt > session.closedAt)
    )
      throw Error(`Vínculo ou histórico inválido no pedido ${order.id}.`);
    orderIds.add(order.id);
    const rows = groupedOrders.get(session.id) ?? [];
    rows.push(order);
    groupedOrders.set(session.id, rows);
  }
  // Validate monetary data even outside the selected cohort; never hide corrupt totals.
  const accounts = new Map(
    local.map((session) => [
      session.id,
      sessionAccount(session, groupedOrders.get(session.id) ?? []),
    ]),
  );
  const selected = local.filter(
    (session) =>
      session.status === "closed" && inPeriod(session.closedAt!, period),
  );
  const rows = selected.map((session) => {
    const account = accounts.get(session.id)!;
    return {
      ...session,
      durationMinutes: (+session.closedAt! - +session.openedAt) / 60000,
      orders: account.orders,
      totalCents: account.totalCents,
      pendingOrders: account.orders.filter(
        (order) => !["delivered", "cancelled"].includes(order.status),
      ).length,
    };
  });
  type Row = (typeof rows)[number];
  function summarize(items: Row[]): HistoryMetrics {
    const sum = (values: number[]) => {
      const result = values.reduce((total, value) => total + value, 0);
      if (!Number.isSafeInteger(result))
        throw Error("Métrica excede o limite suportado.");
      return result;
    };
    const cents = sum(items.map((row) => row.totalCents));
    return {
      sessions: items.length,
      customerVisits: sum(items.map((row) => row.customerCount)),
      orders: sum(
        items.map(
          (row) =>
            row.orders.filter((order) => order.status !== "cancelled").length,
        ),
      ),
      cancelledOrders: sum(
        items.map(
          (row) =>
            row.orders.filter((order) => order.status === "cancelled").length,
        ),
      ),
      consumptionCents: cents,
      operationalRevenueCents: cents,
      receivedRevenueCents: null,
      averageTicketCents: items.length
        ? Math.round(cents / items.length)
        : null,
      averageDurationMinutes: items.length
        ? items.reduce((total, row) => total + row.durationMinutes, 0) /
          items.length
        : null,
    };
  }
  const tableIds = [
    ...new Set(rows.flatMap((row) => (row.tableId ? [row.tableId] : []))),
  ];
  const tables = tableIds
    .map((tableId) => {
      const visits = rows.filter((row) => row.tableId === tableId);
      return {
        tableId,
        occupations: visits.length,
        turnover: visits.length,
        ...summarize(visits),
      };
    })
    .sort(
      (a, b) =>
        b.occupations - a.occupations || a.tableId.localeCompare(b.tableId),
    );
  const hourlyArrivals = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessions: 0,
    customerVisits: 0,
  }));
  const days = new Map<string, Row[]>();
  for (const row of rows) {
    const hour = Number(parts(row.openedAt).hour);
    hourlyArrivals[hour].sessions++;
    hourlyArrivals[hour].customerVisits += row.customerCount;
    const date = parts(row.closedAt!);
    const key = `${date.year}-${date.month}-${date.day}`;
    days.set(key, [...(days.get(key) ?? []), row]);
  }
  const peak = Math.max(...hourlyArrivals.map((hour) => hour.sessions));
  return {
    placeId,
    period,
    sessions: rows,
    summary: summarize(rows),
    tables,
    byServiceType: serviceTypes.map((serviceType) => ({
      serviceType,
      ...summarize(rows.filter((row) => row.serviceType === serviceType)),
    })),
    hourlyArrivals,
    peakArrivalHours: peak
      ? hourlyArrivals
          .filter((hour) => hour.sessions === peak)
          .map((hour) => hour.hour)
      : [],
    daily: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, visits]) => ({ date, ...summarize(visits) })),
    cancelledSessions: local.filter(
      (session) =>
        session.status === "cancelled" && inPeriod(session.closedAt!, period),
    ).length,
    pendingOrdersInClosedSessions: rows.reduce(
      (total, row) => total + row.pendingOrders,
      0,
    ),
  };
}
