import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link } from "react-router-dom";
import type { User } from "../../shared/models";
import type { PlaceTable } from "../tables/model/table";
import { TablesRepository } from "../tables/data/tablesRepository";
import { ServiceSessionsRepository } from "../service-sessions/data/serviceSessionsRepository";
import type { ServiceSession } from "../service-sessions/model/serviceSession";
import { MenuRepository } from "../menu-management/data/menuRepository";
import type { MenuProduct } from "../menu-management/model/menu";
import { OrdersRepository } from "./data/ordersRepository";
import {
  MAX_ORDER_ITEMS,
  nextOrderStatus,
  orderLocation,
  orderStatusLabels,
  orderStatuses,
  orderSubtotal,
  snapshotOrderItem,
  type CreateOrderInput,
  type Order,
  type OrderStatus,
} from "./model/order";

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível salvar o pedido.";
export function OrderList({
  orders,
  tables,
  editable = false,
  busy = false,
  onStatus,
}: {
  orders: Order[];
  tables: PlaceTable[];
  editable?: boolean;
  busy?: boolean;
  onStatus?: (id: string, status: OrderStatus) => void;
}) {
  if (!orders.length) return <p>Nenhum pedido encontrado.</p>;
  return (
    <ul className="table-list order-list">
      {orders.map((order) => {
        const next = nextOrderStatus(order.status);
        return (
          <li key={order.id}>
            <div>
              <h3>
                #{order.id} · {orderLocation(order, tables)}
              </h3>
              <strong>{orderStatusLabels[order.status]}</strong>
              <p>
                Atendimento {order.serviceSessionId} ·{" "}
                {order.createdAt.toLocaleString("pt-BR")}
              </p>
              <ul>
                {order.items.map((item, index) => (
                  <li key={`${item.menuItemId}:${index}`}>
                    {item.quantity} × {item.name} · {money(item.unitPrice)} cada
                    · {money(item.total)}
                  </li>
                ))}
              </ul>
              <p>
                Total: <strong>{money(order.total)}</strong>
              </p>
              {order.notes && <p>Observações: {order.notes}</p>}
            </div>
            {editable && next && (
              <div className="order-actions">
                <button
                  disabled={busy}
                  onClick={() => onStatus?.(order.id, next)}
                >
                  Marcar como {orderStatusLabels[next].toLowerCase()}
                </button>
                <button
                  disabled={busy}
                  onClick={() => onStatus?.(order.id, "cancelled")}
                >
                  Cancelar pedido #{order.id}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function OrderForm({
  sessions,
  products,
  tables,
  busy,
  onCreate,
}: {
  sessions: ServiceSession[];
  products: MenuProduct[];
  tables: PlaceTable[];
  busy: boolean;
  onCreate: (input: CreateOrderInput) => Promise<void>;
}) {
  const [sessionId, setSessionId] = useState("");
  const [items, setItems] = useState([{ menuItemId: "", quantity: 1 }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const open = sessions.filter((session) => session.status === "open");
  let estimate = 0;
  try {
    estimate = orderSubtotal(
      items.flatMap((item) => {
        const product = products.find((row) => row.id === item.menuItemId);
        return product
          ? [snapshotOrderItem(product.id, product, item.quantity)]
          : [];
      }),
    );
  } catch {
    /* Invalid draft quantities are validated on submit. */
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onCreate({
        serviceSessionId: sessionId,
        items,
        notes,
        customerUid: null,
      });
      setItems([{ menuItemId: "", quantity: 1 }]);
      setNotes("");
    } catch (cause) {
      setError(message(cause));
    }
  }
  return (
    <form className="table-form order-form" onSubmit={submit}>
      <h2>Novo pedido</h2>
      <p>
        Escolha um atendimento aberto. Você pode registrar vários pedidos no
        mesmo atendimento.
      </p>
      {!open.length && <p>Abra um atendimento para começar.</p>}
      {!products.length && (
        <p>Nenhum produto disponível. Confira o cardápio e suas categorias.</p>
      )}
      <fieldset disabled={busy || !open.length || !products.length}>
        <label>
          Atendimento
          <select
            required
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Selecione</option>
            {open.map((session) => (
              <option key={session.id} value={session.id}>
                {orderLocation(session, tables)} · {session.id}
              </option>
            ))}
          </select>
        </label>
        {items.map((item, index) => (
          <div className="order-item-input" key={index}>
            <label>
              Produto {index + 1}
              <select
                required
                value={item.menuItemId}
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === index
                        ? { ...row, menuItemId: e.target.value }
                        : row,
                    ),
                  )
                }
              >
                <option value="">Selecione um produto</option>
                {products
                  .filter(
                    (product) =>
                      product.id === item.menuItemId ||
                      !items.some((row) => row.menuItemId === product.id),
                  )
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {money(product.price)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantidade {index + 1}
              <input
                type="number"
                required
                min={1}
                max={999}
                step={1}
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === index
                        ? { ...row, quantity: Number(e.target.value) }
                        : row,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={items.length === 1}
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              Remover produto {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= MAX_ORDER_ITEMS}
          onClick={() => setItems([...items, { menuItemId: "", quantity: 1 }])}
        >
          Adicionar produto
        </button>
        <p>Até {MAX_ORDER_ITEMS} produtos diferentes por pedido.</p>
        <label>
          Observações
          <textarea
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <p>Total estimado: {money(estimate)}</p>
        <button type="submit">{busy ? "Salvando…" : "Registrar pedido"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function OrderComposer({
  placeId,
  user,
  tables,
  busy,
  onCreate,
}: {
  placeId: string;
  user: User;
  tables: PlaceTable[];
  busy: boolean;
  onCreate: (input: CreateOrderInput) => Promise<void>;
}) {
  const [sessions, setSessions] = useState<ServiceSession[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [sessionError, setSessionError] = useState("");
  const [menuError, setMenuError] = useState("");
  useEffect(
    () =>
      ServiceSessionsRepository.watch(
        placeId,
        user,
        (rows) => {
          setSessions(rows);
          setSessionError("");
        },
        (cause) => {
          setSessions([]);
          setSessionError(cause.message);
        },
      ),
    [placeId, user],
  );
  useEffect(
    () =>
      MenuRepository.watch(
        placeId,
        true,
        (categories, items) => {
          setProducts(
            items.filter(
              (item) =>
                item.active &&
                item.available &&
                categories.some(
                  (category) =>
                    category.id === item.categoryId && category.active,
                ),
            ),
          );
          setMenuError("");
        },
        (cause) => {
          setProducts([]);
          setMenuError(cause.message);
        },
      ),
    [placeId],
  );
  return (
    <>
      <Link to={`/places/menu?placeId=${encodeURIComponent(placeId)}`}>
        Preparar ou consultar cardápio
      </Link>
      {sessionError && <p role="alert">{sessionError}</p>}
      {menuError && <p role="alert">{menuError}</p>}
      <OrderForm
        sessions={sessions}
        products={products}
        tables={tables}
        busy={busy || !!sessionError || !!menuError}
        onCreate={onCreate}
      />
    </>
  );
}

export function OrdersPanel({
  placeId,
  user,
  editable,
  tablesEnabled,
  canCreate = false,
  compact = false,
}: {
  placeId: string;
  user: User;
  editable: boolean;
  tablesEnabled: boolean;
  canCreate?: boolean;
  compact?: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<PlaceTable[]>([]);
  const [error, setError] = useState("");
  const [tableError, setTableError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [filter, setFilter] = useState("active");
  useEffect(
    () =>
      OrdersRepository.watch(
        placeId,
        user,
        (rows) => {
          setOrders(rows);
          setError("");
          setLoading(false);
        },
        (cause) => {
          setOrders([]);
          setError(cause.message);
          setLoading(false);
        },
      ),
    [placeId, user],
  );
  useEffect(() => {
    if (!tablesEnabled) return;
    return TablesRepository.watch(
      placeId,
      user,
      (rows) => {
        setTables(rows);
        setTableError("");
      },
      (cause) => {
        setTables([]);
        setTableError(cause.message);
      },
    );
  }, [placeId, user, tablesEnabled]);
  async function create(input: CreateOrderInput) {
    if (inFlight.current) throw Error("Aguarde o pedido atual.");
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const id = await OrdersRepository.create(placeId, input, user);
      setFilter("active");
      setNotice(`Pedido #${id} registrado.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function update(id: string, status: OrderStatus) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError("");
    try {
      await OrdersRepository.updateStatus(placeId, id, status, user);
    } catch (cause) {
      setActionError(message(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const visible = orders.filter(
    (order) =>
      filter === "all" ||
      (filter === "active"
        ? !["delivered", "cancelled"].includes(order.status)
        : order.status === filter),
  );
  return (
    <section className="orders-panel">
      <h2>Pedidos em tempo real</h2>
      {compact ? (
        <Link to={`/places/orders?placeId=${encodeURIComponent(placeId)}`}>
          Abrir gestão de pedidos
        </Link>
      ) : (
        <>
          <Link
            to={`/places/service-sessions?placeId=${encodeURIComponent(placeId)}`}
          >
            Abrir ou consultar atendimentos
          </Link>
          {editable &&
            (canCreate ? (
              <OrderComposer
                placeId={placeId}
                user={user}
                tables={tablesEnabled ? tables : []}
                busy={busy}
                onCreate={create}
              />
            ) : (
              <p>
                Para novos pedidos, habilite Atendimentos e Cardápio e prepare o
                cardápio do estabelecimento.
              </p>
            ))}
        </>
      )}
      {notice && <output>{notice}</output>}
      <label>
        Status
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="active">Em andamento</option>
          <option value="all">Todos</option>
          {orderStatuses.map((status) => (
            <option key={status} value={status}>
              {orderStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {tablesEnabled && tableError && (
        <p role="alert">
          Não foi possível consultar os nomes das mesas: {tableError}
        </p>
      )}
      {loading ? (
        <p>Carregando pedidos…</p>
      ) : (
        <OrderList
          orders={compact ? visible.slice(0, 10) : visible}
          tables={tablesEnabled ? tables : []}
          editable={editable}
          busy={busy}
          onStatus={(id, status) => {
            void update(id, status);
          }}
        />
      )}
      {compact && visible.length > 10 && (
        <p>
          Exibindo os 10 pedidos mais recentes. Consulte os demais na gestão de
          pedidos.
        </p>
      )}
    </section>
  );
}
