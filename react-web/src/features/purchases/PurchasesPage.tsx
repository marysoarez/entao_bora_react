import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { currency } from "../../shared/domain";
import { useSession } from "../session";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { usePlaceModules } from "../place-modules/usePlaceModules";
import { InventoryRepository } from "../inventory/data/inventoryRepository";
import {
  displayQuantity,
  quantityMilli,
  type InventoryItem,
} from "../inventory/model/inventory";
import { PurchasesRepository } from "./data/purchasesRepository";
import type { PurchaseItem, PurchaseOrder, Supplier } from "./model/purchase";

const statusLabels = {
  ordered: "Pedido enviado",
  received: "Recebido",
  cancelled: "Cancelado",
  draft: "Rascunho",
};
function SupplierForm({
  placeId,
  user,
  done,
}: {
  placeId: string;
  user: NonNullable<ReturnType<typeof useSession>["user"]>;
  done: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await PurchasesRepository.saveSupplier(
        placeId,
        null,
        { name, contact, active: true },
        user,
      );
      setName("");
      setContact("");
      done();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <form className="table-form" onSubmit={submit}>
      <h2>Novo fornecedor</h2>
      <label>
        Nome
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Contato
        <input
          maxLength={300}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </label>
      <button>Salvar fornecedor</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function OrderForm({
  placeId,
  user,
  suppliers,
  inventory,
  done,
}: {
  placeId: string;
  user: NonNullable<ReturnType<typeof useSession>["user"]>;
  suppliers: Supplier[];
  inventory: InventoryItem[];
  done: () => void;
}) {
  const [supplierId, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState([
    { inventoryItemId: "", quantity: "", unitCost: "" },
  ]);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await PurchasesRepository.createOrder(
        placeId,
        supplierId,
        {
          notes,
          items: rows.map((row) => ({
            inventoryItemId: row.inventoryItemId,
            quantityMilli: quantityMilli(row.quantity),
            unitCostMicros: Math.round(
              Number(row.unitCost.replace(",", ".")) * 1_000_000,
            ),
          })),
        },
        user,
      );
      setRows([{ inventoryItemId: "", quantity: "", unitCost: "" }]);
      setNotes("");
      done();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <form className="table-form" onSubmit={submit}>
      <h2>Novo pedido de compra</h2>
      <label>
        Fornecedor
        <select
          required
          value={supplierId}
          onChange={(e) => setSupplier(e.target.value)}
        >
          <option value="">Selecione</option>
          {suppliers
            .filter((row) => row.active)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
      </label>
      {rows.map((row, index) => (
        <div className="order-item-input" key={index}>
          <label>
            Insumo
            <select
              required
              value={row.inventoryItemId}
              onChange={(e) =>
                setRows(
                  rows.map((old, i) =>
                    i === index
                      ? { ...old, inventoryItemId: e.target.value }
                      : old,
                  ),
                )
              }
            >
              <option value="">Selecione</option>
              {inventory
                .filter((item) => item.active)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · saldo {displayQuantity(item.stockMilli)}{" "}
                    {item.unit}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              required
              inputMode="decimal"
              value={row.quantity}
              onChange={(e) =>
                setRows(
                  rows.map((old, i) =>
                    i === index ? { ...old, quantity: e.target.value } : old,
                  ),
                )
              }
            />
          </label>
          <label>
            Custo por unidade (R$)
            <input
              required
              inputMode="decimal"
              value={row.unitCost}
              onChange={(e) =>
                setRows(
                  rows.map((old, i) =>
                    i === index ? { ...old, unitCost: e.target.value } : old,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            disabled={rows.length === 1}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
          >
            Remover item
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={rows.length >= 5}
        onClick={() =>
          setRows([
            ...rows,
            { inventoryItemId: "", quantity: "", unitCost: "" },
          ])
        }
      >
        Adicionar item
      </button>
      <label>
        Observações
        <textarea
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p>
        O custo é informativo para compras. Esta etapa não cria contas a pagar,
        caixa ou lançamentos financeiros.
      </p>
      <button>Enviar pedido de compra</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function Workspace({
  placeId,
  user,
  editable,
}: {
  placeId: string;
  user: NonNullable<ReturnType<typeof useSession>["user"]>;
  editable: boolean;
}) {
  const [data, setData] = useState<{
    suppliers: Supplier[];
    orders: PurchaseOrder[];
    items: PurchaseItem[];
  } | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSupplier, setShowSupplier] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const receiving = useRef(false);
  const receiptOperations = useRef(new Map<string, string>());
  useEffect(
    () =>
      PurchasesRepository.watch(
        placeId,
        user,
        (suppliers, orders, items) => {
          setData({ suppliers, orders, items });
          setError("");
        },
        (cause) => {
          setData(null);
          setError(cause.message);
        },
      ),
    [placeId, user],
  );
  useEffect(
    () =>
      InventoryRepository.watch(
        placeId,
        user,
        (items) => setInventory(items),
        (cause) => setError(cause.message),
      ),
    [placeId, user],
  );
  async function receive(orderId: string) {
    if (receiving.current) return;
    receiving.current = true;
    setError("");
    setNotice("");
    try {
      const operationId =
        receiptOperations.current.get(orderId) ?? crypto.randomUUID();
      receiptOperations.current.set(orderId, operationId);
      await PurchasesRepository.receive(placeId, orderId, operationId, user);
      receiptOperations.current.delete(orderId);
      setNotice(`Compra ${orderId} recebida e entrada registrada no estoque.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      receiving.current = false;
    }
  }
  if (error && !data) return <p role="alert">{error}</p>;
  if (!data) return <p>Carregando compras…</p>;
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      <section>
        <h2>Necessidades de compra</h2>
        {inventory.filter(
          (item) => item.active && item.stockMilli <= item.minimumMilli,
        ).length ? (
          <ul>
            {inventory
              .filter(
                (item) => item.active && item.stockMilli <= item.minimumMilli,
              )
              .map((item) => (
                <li key={item.id}>
                  {item.name}: {displayQuantity(item.stockMilli)} {item.unit} em
                  estoque · mínimo {displayQuantity(item.minimumMilli)}{" "}
                  {item.unit}
                </li>
              ))}
          </ul>
        ) : (
          <p>Nenhum insumo no mínimo ou abaixo.</p>
        )}
      </section>
      <section>
        <h2>Fornecedores</h2>
        {editable && (
          <button onClick={() => setShowSupplier(!showSupplier)}>
            Novo fornecedor
          </button>
        )}
        {showSupplier && (
          <SupplierForm
            placeId={placeId}
            user={user}
            done={() => setShowSupplier(false)}
          />
        )}
        {!data.suppliers.length ? (
          <p>Nenhum fornecedor.</p>
        ) : (
          <ul>
            {data.suppliers.map((row) => (
              <li key={row.id}>
                {row.name} · {row.contact || "sem contato"} ·{" "}
                {row.active ? "ativo" : "inativo"}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>Pedidos de compra</h2>
        {editable && (
          <button onClick={() => setShowOrder(!showOrder)}>Novo pedido</button>
        )}
        {showOrder && (
          <OrderForm
            placeId={placeId}
            user={user}
            suppliers={data.suppliers}
            inventory={inventory}
            done={() => setShowOrder(false)}
          />
        )}
        {!data.orders.length ? (
          <p>Nenhum pedido de compra.</p>
        ) : (
          <ul className="table-list">
            {data.orders.map((order) => (
              <li key={order.id}>
                <div>
                  <h3>Compra #{order.id}</h3>
                  <p>
                    {data.suppliers.find((row) => row.id === order.supplierId)
                      ?.name || order.supplierId}{" "}
                    · {statusLabels[order.status]}
                  </p>
                  <p>
                    {order.itemCount} item(ns) · custo total{" "}
                    {currency(order.totalCostCents / 100)}
                  </p>
                  <ul>
                    {data.items
                      .filter((item) => item.purchaseOrderId === order.id)
                      .map((item) => (
                        <li key={item.id}>
                          {item.name}: {displayQuantity(item.quantityMilli)}{" "}
                          {item.unit} · recebido{" "}
                          {displayQuantity(item.receivedMilli)} ·{" "}
                          {currency(item.totalCostCents / 100)}
                        </li>
                      ))}
                  </ul>
                  <p>
                    Responsável: {order.createdBy} · Data:{" "}
                    {order.orderedAt?.toLocaleString("pt-BR")}
                  </p>
                  {order.receivedAt && (
                    <p>
                      Recebido por {order.receivedBy} em{" "}
                      {order.receivedAt.toLocaleString("pt-BR")}
                    </p>
                  )}
                  {editable && order.status === "ordered" && (
                    <button onClick={() => void receive(order.id)}>
                      Confirmar recebimento total
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p>
          Os itens preservam nome, unidade, custo e quantidade do momento da
          compra. O modelo guarda quantidade recebida por item para suportar
          recebimentos parciais futuramente; nesta versão, a confirmação recebe
          todo o saldo de uma vez.
        </p>
      </section>
    </>
  );
}
export function PurchasesPage() {
  const { user } = useSession();
  const access = usePartnerAccess();
  const [params, setParams] = useSearchParams();
  const selected = params.get("placeId")
    ? access.places.find((row) => row.place.id === params.get("placeId"))
    : access.places[0];
  const placeId = selected?.place.id;
  const modules = usePlaceModules(placeId);
  if (access.loading) return <p>Carregando estabelecimentos…</p>;
  if (access.error) return <p role="alert">{access.error}</p>;
  if (!user || !placeId)
    return <p role="alert">Estabelecimento indisponível ou sem permissão.</p>;
  return (
    <main className="tables-management">
      <Link to={`/partner-dashboard?placeId=${encodeURIComponent(placeId)}`}>
        Voltar ao painel
      </Link>
      <h1>Compras</h1>
      <label>
        Estabelecimento
        <select
          value={placeId}
          onChange={(e) => setParams({ placeId: e.target.value })}
        >
          {access.places.map((row) => (
            <option key={row.place.id} value={row.place.id}>
              {row.place.name}
            </option>
          ))}
        </select>
      </label>
      {modules.loading ? (
        <p>Carregando módulo…</p>
      ) : modules.error ? (
        <p role="alert">{modules.error}</p>
      ) : !modules.available("purchases") ? (
        <p>Compras desativado. Ative o módulo nas configurações.</p>
      ) : !modules.available("inventory") ? (
        <p>Ative Estoque antes de usar Compras.</p>
      ) : (
        <Workspace
          key={`${placeId}:${user.id}`}
          placeId={placeId}
          user={user}
          editable={access.can(placeId, "managePurchases")}
        />
      )}
    </main>
  );
}
