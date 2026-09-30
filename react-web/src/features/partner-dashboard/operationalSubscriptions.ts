import type { User } from "../../shared/models";
import { TablesRepository } from "../tables/data/tablesRepository";
import type { PlaceTable } from "../tables/model/table";
import { ServiceSessionsRepository } from "../service-sessions/data/serviceSessionsRepository";
import type { ServiceSession } from "../service-sessions/model/serviceSession";
import { OrdersRepository } from "../orders/data/ordersRepository";
import type { Order } from "../orders/model/order";

export interface OperationalModules {
  tables: boolean;
  sessions: boolean;
  orders: boolean;
}
export interface LiveRows<T> {
  rows: T[];
  status: "disabled" | "loading" | "ready" | "error";
  error?: string;
}
export interface OperationalData {
  tables: LiveRows<PlaceTable>;
  sessions: LiveRows<ServiceSession>;
  orders: LiveRows<Order>;
}
export function initialOperationalData(
  enabled: OperationalModules,
): OperationalData {
  const state = (active: boolean) => ({
    rows: [],
    status: active ? ("loading" as const) : ("disabled" as const),
  });
  return {
    tables: state(enabled.tables),
    sessions: state(enabled.sessions),
    orders: state(enabled.orders),
  };
}

/** All streams retain their existing authorization and module checks. */
export function watchOperationalDashboard(
  placeId: string,
  user: User,
  enabled: OperationalModules,
  onChange: (data: OperationalData) => void,
) {
  let alive = true;
  let data = initialOperationalData(enabled);
  onChange(data);
  const stops: (() => void)[] = [];
  function update<K extends keyof OperationalData>(
    key: K,
    value: OperationalData[K],
  ) {
    if (!alive) return;
    data = { ...data, [key]: value };
    onChange(data);
  }
  const failed = (key: keyof OperationalData) => (error: Error) =>
    update(key, { rows: [], status: "error", error: error.message });
  if (enabled.tables)
    stops.push(
      TablesRepository.watch(
        placeId,
        user,
        (rows) => update("tables", { rows, status: "ready" }),
        failed("tables"),
      ),
    );
  if (enabled.sessions)
    stops.push(
      ServiceSessionsRepository.watch(
        placeId,
        user,
        (rows) =>
          update("sessions", {
            rows: rows.filter((row) => row.placeId === placeId),
            status: "ready",
          }),
        failed("sessions"),
      ),
    );
  if (enabled.orders)
    stops.push(
      OrdersRepository.watch(
        placeId,
        user,
        (rows) =>
          update("orders", {
            rows: rows.filter((row) => row.placeId === placeId),
            status: "ready",
          }),
        failed("orders"),
      ),
    );
  return () => {
    alive = false;
    stops.forEach((stop) => stop());
  };
}
