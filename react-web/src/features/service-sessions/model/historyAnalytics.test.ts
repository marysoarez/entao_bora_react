import { expect, it } from "vitest";
import { historyAnalytics, type HistoryPeriod } from "./historyAnalytics";
import type { ServiceSession } from "./serviceSession";
import type { Order } from "../../orders/model/order";

const start = new Date("2026-09-25T03:00:00Z");
const end = new Date("2026-09-26T03:00:00Z");
const period: HistoryPeriod = { start, end, timeZone: "America/Sao_Paulo" };
const session = (
  id: string,
  extra: Partial<ServiceSession> = {},
): ServiceSession => ({
  id,
  placeId: "p",
  tableId: "t1",
  serviceType: "table",
  status: "closed",
  customerCount: 4,
  openedAt: new Date("2026-09-25T20:00:00Z"),
  closedAt: new Date("2026-09-25T21:20:00Z"),
  openedBy: "u",
  closedBy: "u",
  source: "partner_web",
  createdAt: start,
  updatedAt: end,
  ...extra,
});
const order = (
  id: string,
  serviceSessionId: string,
  total: number,
  extra: Partial<Order> = {},
): Order => ({
  id,
  serviceSessionId,
  placeId: "p",
  tableId: "t1",
  serviceType: "table",
  customerUid: null,
  status: "delivered",
  items: [],
  subtotal: total,
  total,
  notes: "",
  createdAt: new Date("2026-09-25T20:30:00Z"),
  updatedAt: end,
  ...extra,
});
it("calculates closed cohorts with cent precision, durations, customers, turnover and no cancelled consumption", () => {
  const sessions = [
    session("a"),
    session("b", {
      customerCount: 2,
      closedAt: new Date("2026-09-25T20:40:00Z"),
    }),
  ];
  const orders = [
    order("o1", "a", 100.1),
    order("o2", "a", 25.9),
    order("o3", "a", 99, { status: "cancelled" }),
    order("o4", "b", 14),
  ];
  const original = structuredClone({ sessions, orders });
  const report = historyAnalytics("p", sessions, orders, period);
  expect(report.summary).toEqual({
    sessions: 2,
    customerVisits: 6,
    orders: 3,
    cancelledOrders: 1,
    consumptionCents: 14000,
    operationalRevenueCents: 14000,
    receivedRevenueCents: null,
    averageTicketCents: 7000,
    averageDurationMinutes: 60,
  });
  expect(report.tables[0]).toMatchObject({
    tableId: "t1",
    occupations: 2,
    turnover: 2,
    averageDurationMinutes: 60,
  });
  expect(report.sessions[0]).toMatchObject({
    source: "partner_web",
    customerCount: 4,
    durationMinutes: 80,
    totalCents: 12600,
  });
  expect(report.sessions[0].orders).toHaveLength(3);
  expect(report.peakArrivalHours).toEqual([17]);
  expect(report.daily[0]).toMatchObject({
    date: "2026-09-25",
    operationalRevenueCents: 14000,
  });
  expect({ sessions, orders }).toEqual(original);
});
it("uses closing time with inclusive start and exclusive end, retaining full overnight duration and account", () => {
  const previous = new Date("2026-09-24T23:00:00Z");
  const report = historyAnalytics(
    "p",
    [
      session("included", { openedAt: previous, closedAt: start }),
      session("excluded", { closedAt: end }),
    ],
    [order("o", "included", 10, { createdAt: previous })],
    period,
  );
  expect(report.summary.sessions).toBe(1);
  expect(report.summary.averageDurationMinutes).toBe(240);
  expect(report.summary.consumptionCents).toBe(1000);
  expect(report.peakArrivalHours).toEqual([20]);
});
it("excludes cancelled and open sessions from completed metrics without losing their input history", () => {
  const report = historyAnalytics(
    "p",
    [
      session("open", { status: "open", closedAt: null }),
      session("cancelled", { status: "cancelled" }),
    ],
    [order("o", "cancelled", 50)],
    period,
  );
  expect(report.summary.sessions).toBe(0);
  expect(report.summary.averageTicketCents).toBeNull();
  expect(report.summary.averageDurationMinutes).toBeNull();
  expect(report.cancelledSessions).toBe(1);
  expect(report.peakArrivalHours).toEqual([]);
});
it("isolates places and compares table, counter, lounge and takeaway including zero-order sessions", () => {
  const sessions = [
    session("table"),
    ...(["counter", "lounge", "takeaway"] as const).map((serviceType) =>
      session(serviceType, { serviceType, tableId: null }),
    ),
    session("foreign", { placeId: "other" }),
  ];
  const report = historyAnalytics(
    "p",
    sessions,
    [order("foreign", "foreign", 999, { placeId: "other" })],
    period,
  );
  expect(report.summary).toMatchObject({
    sessions: 4,
    customerVisits: 16,
    orders: 0,
    averageTicketCents: 0,
  });
  expect(report.byServiceType.map((row) => row.sessions)).toEqual([1, 1, 1, 1]);
  expect(report.tables).toHaveLength(1);
});
it("flags pending orders on closed accounts and groups closing revenue by local day", () => {
  const report = historyAnalytics(
    "p",
    [session("a", { closedAt: new Date("2026-09-26T02:00:00Z") })],
    [order("o", "a", 20, { status: "preparing" })],
    period,
  );
  expect(report.pendingOrdersInClosedSessions).toBe(1);
  expect(report.daily[0].date).toBe("2026-09-25");
});
it("rejects invalid periods, zones, dates, counts, links, duplicate IDs and monetary data", () => {
  for (const change of [
    { end: start },
    { start: new Date(NaN) },
    { timeZone: "Invalid/Zone" },
  ])
    expect(() =>
      historyAnalytics("p", [], [], { ...period, ...change }),
    ).toThrow();
  for (const change of [
    { customerCount: 0 },
    { closedAt: null },
    { closedAt: new Date(0) },
    { openedAt: new Date(NaN) },
    { source: "" },
  ])
    expect(() =>
      historyAnalytics("p", [session("a", change)], [], period),
    ).toThrow();
  expect(() =>
    historyAnalytics("p", [session("a"), session("a")], [], period),
  ).toThrow();
  for (const change of [
    { serviceSessionId: "missing" },
    { tableId: "other" },
    { createdAt: end },
    { total: NaN },
    { total: 1.001 },
    { total: -1 },
  ])
    expect(() =>
      historyAnalytics(
        "p",
        [session("a")],
        [order("o", "a", 10, change)],
        period,
      ),
    ).toThrow();
  expect(() =>
    historyAnalytics(
      "p",
      [session("a")],
      [order("o", "a", 10), order("o", "a", 10)],
      period,
    ),
  ).toThrow();
});
it("ranks historical table IDs without depending on current table names or activation", () => {
  const report = historyAnalytics(
    "p",
    [session("a", { tableId: "old" }), session("b"), session("c")],
    [],
    period,
  );
  expect(report.tables.map((table) => [table.tableId, table.turnover])).toEqual(
    [
      ["t1", 2],
      ["old", 1],
    ],
  );
});
