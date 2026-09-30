import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "../../shared/models";
import { currency } from "../../shared/domain";
import { orderLocation, orderStatusLabels } from "../orders/model/order";
import type { ServiceSession } from "../service-sessions/model/serviceSession";
import { sessionDuration } from "../service-sessions/model/tableHistory";
import { sessionAccount } from "../service-sessions/model/sessionAccount";
import {
  initialOperationalData,
  watchOperationalDashboard,
  type LiveRows,
  type OperationalData,
  type OperationalModules,
} from "./operationalSubscriptions";

function LoadingState({
  state,
  name,
}: {
  state: LiveRows<unknown>;
  name: string;
}) {
  if (state.status === "error")
    return (
      <p role="alert">
        Não foi possível carregar {name}: {state.error}
      </p>
    );
  if (state.status === "loading")
    return <output>Carregando {name}…</output>;
  return null;
}

export function OperationalDashboardView({
  data,
  placeId,
  now,
}: {
  data: OperationalData;
  placeId: string;
  now: number;
}) {
  const { tables, sessions, orders } = data;
  const open = sessions.rows.filter(
    (session) => session.placeId === placeId && session.status === "open",
  );
  const activeOrders = orders.rows.filter(
    (order) =>
      order.placeId === placeId &&
      !["delivered", "cancelled"].includes(order.status),
  );
  function consumption(session: ServiceSession) {
    if (orders.status !== "ready") return <p>Consumo indisponível</p>;
    try {
      return (
        <p>
          <strong>
            {currency(sessionAccount(session, orders.rows).totalCents / 100)}
          </strong>{" "}
          consumidos
        </p>
      );
    } catch {
      return <p role="alert">Consumo indisponível: confira os pedidos.</p>;
    }
  }
  const details = (session: ServiceSession) => (
    <>
      <p>
        {session.customerCount}{" "}
        {session.customerCount === 1 ? "pessoa" : "pessoas"} ·{" "}
        {sessionDuration(session, now)}
      </p>
      {consumption(session)}
    </>
  );
  const destination = (path: string) =>
    `/places/${path}?placeId=${encodeURIComponent(placeId)}`;
  return (
    <section
      className="operational-dashboard"
      aria-label="Operação do estabelecimento"
    >
      <div className="section-title">
        <h2>Operação agora</h2>
        <span>Atualizações em tempo real</span>
      </div>
      {tables.status !== "disabled" && (
        <section aria-labelledby="dashboard-tables">
          <div className="section-title">
            <h3 id="dashboard-tables">Mesas</h3>
            <Link to={destination("tables")}>Ver mesas</Link>
          </div>
          <LoadingState state={tables} name="mesas" />
          {tables.status === "ready" && (
            <>
              {!tables.rows.length && <p>Nenhuma mesa cadastrada.</p>}
              <div className="operational-grid">
                {tables.rows.map((table) => {
                  const occupied = open.filter(
                    (session) =>
                      session.serviceType === "table" &&
                      session.tableId === table.id,
                  );
                  return (
                    <article className="operational-card" key={table.id}>
                      <h4>
                        {orderLocation(
                          { tableId: table.id, serviceType: "table" },
                          tables.rows,
                        )}
                      </h4>
                      {table.name &&
                        table.name !==
                          orderLocation(
                            { tableId: table.id, serviceType: "table" },
                            tables.rows,
                          ) && <p>{table.name}</p>}
                      {!table.active && (
                        <span className="operational-status">Desativada</span>
                      )}
                      {sessions.status !== "ready" ? (
                        <p>Ocupação indisponível</p>
                      ) : occupied.length ? (
                        <>
                          <span className="operational-status occupied">
                            Ocupada há {sessionDuration(occupied[0], now)}
                          </span>
                          {occupied.length > 1 && (
                            <p role="alert">
                              Atendimentos conflitantes nesta mesa.
                            </p>
                          )}
                          {occupied.map((session) => (
                            <div key={session.id}>{details(session)}</div>
                          ))}
                        </>
                      ) : (
                        table.active && (
                          <span className="operational-status available">
                            Disponível
                          </span>
                        )
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
      {sessions.status !== "disabled" && (
        <section aria-labelledby="dashboard-sessions">
          <div className="section-title">
            <h3 id="dashboard-sessions">Atendimentos</h3>
            <Link to={destination("service-sessions")}>Ver atendimentos</Link>
          </div>
          <LoadingState state={sessions} name="atendimentos" />
          {sessions.status === "ready" && (
            <>
              {!open.length && <p>Nenhum atendimento aberto.</p>}
              <div className="operational-grid">
                {open.map((session) => (
                  <article className="operational-card" key={session.id}>
                    <h4>{orderLocation(session, tables.rows)}</h4>
                    <p className="operational-id">Atendimento #{session.id}</p>
                    {details(session)}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {orders.status !== "disabled" && (
        <section aria-labelledby="dashboard-orders">
          <div className="section-title">
            <h3 id="dashboard-orders">Pedidos</h3>
            <Link to={destination("orders")}>Gerenciar pedidos</Link>
          </div>
          <LoadingState state={orders} name="pedidos" />
          {orders.status === "ready" && (
            <>
              {!activeOrders.length && <p>Nenhum pedido em andamento.</p>}
              <div className="operational-grid">
                {activeOrders.slice(0, 12).map((order) => (
                  <article className="operational-card" key={order.id}>
                    <h4 className="operational-id">#{order.id}</h4>
                    <p>{orderLocation(order, tables.rows)}</p>
                    <strong
                      className={`operational-status order-${order.status}`}
                    >
                      {orderStatusLabels[order.status]}
                    </strong>
                    <p>{currency(order.total)}</p>
                  </article>
                ))}
              </div>
              {activeOrders.length > 12 && (
                <p>
                  Exibindo 12 de {activeOrders.length} pedidos em andamento.
                  Consulte todos em Gerenciar pedidos.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}

export function OperationalDashboard({
  placeId,
  user,
  enabled,
}: {
  placeId: string;
  user: User;
  enabled: OperationalModules;
}) {
  const [data, setData] = useState(() => initialOperationalData(enabled));
  const [now, setNow] = useState(Date.now);
  const { tables, sessions, orders } = enabled;
  useEffect(
    () =>
      watchOperationalDashboard(
        placeId,
        user,
        { tables, sessions, orders },
        setData,
      ),
    [placeId, user, tables, sessions, orders],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  if (!tables && !sessions && !orders) return null;
  return <OperationalDashboardView data={data} placeId={placeId} now={now} />;
}
