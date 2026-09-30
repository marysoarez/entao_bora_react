import type { Order } from "../orders/model/order";
import { orderStatusLabels } from "../orders/model/order";
import type { ServiceSession } from "./model/serviceSession";
import { sessionAccount } from "./model/sessionAccount";

export type AccountState =
  | { status: "disabled" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; orders: Order[] };
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function SessionAccount({
  session,
  state,
}: {
  session: ServiceSession;
  state: AccountState;
}) {
  if (state.status === "disabled")
    return <p>Conta indisponível: o módulo Pedidos está desativado.</p>;
  if (state.status === "loading")
    return (
      <p>Aguardando pedidos confirmados pelo servidor para calcular a conta…</p>
    );
  if (state.status === "error")
    return <p role="alert">Conta indisponível: {state.message}</p>;
  if (state.status !== "ready") return null;
  let account;
  try {
    account = sessionAccount(session, state.orders);
  } catch (error) {
    return (
      <p role="alert">
        {error instanceof Error ? error.message : "Conta inválida."}
      </p>
    );
  }
  return (
    <section
      className="session-account"
      aria-label={`Conta do atendimento ${session.id}`}
    >
      <h3>Conta do atendimento</h3>
      {account.orders.length ? (
        <ul>
          {account.orders.map((order) => (
            <li key={order.id}>
              <span>
                Pedido #{order.id} — {money(order.total)}
              </span>
              <span>
                {orderStatusLabels[order.status]}
                {order.status === "cancelled" ? " · não incluído no total" : ""}
              </span>
              <details>
                <summary>Itens do pedido #{order.id}</summary>
                <ul>
                  {order.items.map((item, index) => (
                    <li key={`${item.menuItemId}:${index}`}>
                      {item.quantity} × {item.name} · {money(item.unitPrice)}{" "}
                      cada · {money(item.total)}
                    </li>
                  ))}
                </ul>
                {order.notes && <p>{order.notes}</p>}
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum pedido neste atendimento.</p>
      )}
      <p>
        <strong>Total: {money(account.totalCents / 100)}</strong>
      </p>
      <p>
        Pedidos cancelados não entram no total. Encerrar o atendimento não
        registra pagamento.
      </p>
      {session.status === "open" &&
        account.orders.some(
          (order) => !["delivered", "cancelled"].includes(order.status),
        ) && (
          <p>
            Há pedidos em andamento. Revise a conta antes de encerrar; depois,
            não será possível adicionar ou cancelar pedidos.
          </p>
        )}
    </section>
  );
}
