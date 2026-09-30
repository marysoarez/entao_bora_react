import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { parseUser } from "../../shared/domain";
import type { ServiceSession } from "../service-sessions/model/serviceSession";
import type { PlaceTable } from "../tables/model/table";
import type { Order } from "../orders/model/order";

const mocks = vi.hoisted(() => ({
  tables: vi.fn(),
  sessions: vi.fn(),
  orders: vi.fn(),
}));
vi.mock("../tables/data/tablesRepository", () => ({
  TablesRepository: { watch: mocks.tables },
}));
vi.mock("../service-sessions/data/serviceSessionsRepository", () => ({
  ServiceSessionsRepository: { watch: mocks.sessions },
}));
vi.mock("../orders/data/ordersRepository", () => ({
  OrdersRepository: { watch: mocks.orders },
}));
import { OperationalDashboardView } from "./OperationalDashboard";
import {
  initialOperationalData,
  watchOperationalDashboard,
  type OperationalData,
} from "./operationalSubscriptions";

const now = +new Date("2026-09-25T21:20:00Z");
const openedAt = new Date("2026-09-25T20:00:00Z");
const enabled = { tables: true, sessions: true, orders: true };
const table = (id: string, number: number): PlaceTable => ({
  id,
  number,
  name: `Mesa ${String(number).padStart(2, "0")}`,
  capacity: 4,
  active: true,
  createdAt: openedAt,
  updatedAt: openedAt,
});
const session = (
  id = "123",
  serviceType: ServiceSession["serviceType"] = "table",
): ServiceSession => ({
  id,
  placeId: "p",
  tableId: serviceType === "table" ? "t2" : null,
  serviceType,
  status: "open",
  customerCount: 4,
  openedAt,
  closedAt: null,
  openedBy: "u",
  closedBy: null,
  source: "manual",
  createdAt: openedAt,
  updatedAt: openedAt,
});
const order = (
  id: string,
  serviceSessionId: string,
  total: number,
  status: Order["status"] = "preparing",
): Order => ({
  id,
  placeId: "p",
  serviceSessionId,
  total,
  subtotal: total,
  tableId: "t2",
  serviceType: "table",
  customerUid: null,
  status,
  items: [],
  notes: "",
  createdAt: openedAt,
  updatedAt: openedAt,
});
const data = (): OperationalData => ({
  tables: {
    status: "ready",
    rows: [table("t1", 1), table("t2", 2), table("t3", 3)],
  },
  sessions: {
    status: "ready",
    rows: [session(), session("128", "counter"), session("129", "lounge")],
  },
  orders: {
    status: "ready",
    rows: [
      order("184", "123", 100),
      order("185", "123", 26, "delivered"),
      order("186", "123", 50, "cancelled"),
    ],
  },
});
const render = (state: OperationalData, time = now) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <OperationalDashboardView data={state} placeId="p" now={time} />
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  for (const watch of Object.values(mocks)) watch.mockReturnValue(vi.fn());
});
it("shows available tables and current consumption, duration and people without cancelled orders", () => {
  const html = render(data());
  expect(html.match(/Disponível/g)).toHaveLength(2);
  expect(html).toContain("Ocupada há 1h20");
  expect(html).toContain("4 pessoas");
  expect(html).toContain("126,00");
  expect(html).not.toContain("176,00");
  expect(html).toContain("Balcão");
  expect(html).toContain("Salão");
  expect(html).toContain("Atendimento #128");
  expect(html).toContain("Preparando");
  expect(html).not.toContain("#185");
  expect(render(data(), now + 60000)).toContain("Ocupada há 1h21");
});
it("does not report availability or zero consumption while dependent streams are unavailable", () => {
  const state = data();
  state.sessions = { status: "error", rows: [], error: "permission-denied" };
  const html = render(state);
  expect(html).not.toContain("Disponível");
  expect(html).toContain("Ocupação indisponível");
  expect(html).toContain("permission-denied");
  state.sessions = data().sessions;
  state.orders = { status: "loading", rows: [] };
  expect(render(state)).toContain("Consumo indisponível");
  expect(render(state)).not.toContain("0,00");
});
it("excludes closed sessions and foreign orders, flags conflicts and keeps inactive tables unavailable", () => {
  const state = data();
  state.tables.rows[0].active = false;
  state.sessions.rows.push({ ...session("old"), status: "closed" });
  state.orders.rows.push({ ...order("foreign", "123", 999), placeId: "other" });
  expect(render(state)).not.toContain("Atendimento #old");
  expect(render(state)).not.toContain("999,00");
  expect(render(state).match(/Disponível/g)).toHaveLength(1);
  state.sessions.rows.push(session("duplicate"));
  expect(render(state)).toContain("Atendimentos conflitantes");
});
it("distinguishes empty, loading and disabled modules", () => {
  expect(render(initialOperationalData(enabled))).toContain("Carregando mesas");
  const empty = data();
  empty.tables.rows = [];
  empty.sessions.rows = [];
  empty.orders.rows = [];
  const html = render(empty);
  expect(html).toContain("Nenhuma mesa cadastrada");
  expect(html).toContain("Nenhum atendimento aberto");
  expect(html).toContain("Nenhum pedido em andamento");
  expect(
    render(
      initialOperationalData({ tables: false, sessions: false, orders: false }),
    ),
  ).not.toContain("Ver mesas");
});
it("updates each stream and clears failed data while preserving independent streams", () => {
  const update = vi.fn();
  const user = parseUser("u", {});
  watchOperationalDashboard("p", user, enabled, update);
  expect(mocks.tables).toHaveBeenCalledWith(
    "p",
    user,
    expect.any(Function),
    expect.any(Function),
  );
  mocks.tables.mock.calls[0][2](data().tables.rows);
  mocks.sessions.mock.calls[0][2](data().sessions.rows);
  mocks.orders.mock.calls[0][2]([order("184", "123", 126)]);
  expect(update.mock.lastCall?.[0].orders.rows[0].status).toBe("preparing");
  mocks.orders.mock.calls[0][2]([order("184", "123", 126, "ready")]);
  expect(update.mock.lastCall?.[0].orders.rows[0].status).toBe("ready");
  mocks.sessions.mock.calls[0][3](Error("denied"));
  expect(update.mock.lastCall?.[0].sessions).toEqual({
    rows: [],
    status: "error",
    error: "denied",
  });
  expect(update.mock.lastCall?.[0].tables.rows).toHaveLength(3);
});
it("unsubscribes all listeners and rejects late callbacks when leaving or switching place", () => {
  const update = vi.fn();
  const stop = watchOperationalDashboard(
    "p",
    parseUser("u", {}),
    enabled,
    update,
  );
  stop();
  const count = update.mock.calls.length;
  mocks.tables.mock.calls[0][2]([table("late", 4)]);
  mocks.orders.mock.calls[0][3](Error("late"));
  expect(update).toHaveBeenCalledTimes(count);
  for (const watch of Object.values(mocks))
    expect(watch.mock.results[0].value).toHaveBeenCalledOnce();
});
it("does not subscribe to disabled modules and isolates returned place records", () => {
  const update = vi.fn();
  watchOperationalDashboard(
    "p",
    parseUser("u", {}),
    { tables: false, sessions: true, orders: false },
    update,
  );
  expect(mocks.tables).not.toHaveBeenCalled();
  expect(mocks.orders).not.toHaveBeenCalled();
  mocks.sessions.mock.calls[0][2]([
    session(),
    { ...session("foreign"), placeId: "other" },
  ]);
  expect(update.mock.lastCall?.[0].sessions.rows).toHaveLength(1);
});
