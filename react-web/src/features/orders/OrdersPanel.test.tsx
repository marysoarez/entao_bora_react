import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OrderForm, OrderList } from "./OrdersPanel";
import type { Order } from "./model/order";
const order: Order = {
  id: "123",
  placeId: "p",
  serviceSessionId: "s",
  tableId: null,
  customerUid: null,
  serviceType: "counter",
  status: "pending",
  items: [
    {
      menuItemId: "ipa",
      name: "IPA 500ml",
      quantity: 2,
      unitPrice: 18,
      total: 36,
    },
  ],
  subtotal: 36,
  total: 36,
  notes: "Sem gelo",
  createdAt: new Date(1),
  updatedAt: new Date(1),
};
it("renders table, counter and lounge labels with live status and product snapshots", () => {
  const html = renderToStaticMarkup(
    <OrderList
      tables={[]}
      orders={[
        order,
        {
          ...order,
          id: "124",
          serviceType: "table",
          tableId: "05",
          status: "preparing",
        },
        { ...order, id: "125", serviceType: "lounge", status: "ready" },
      ]}
    />,
  );
  for (const text of [
    "#123",
    "#124",
    "#125",
    "Mesa 05",
    "Balcão",
    "Salão",
    "Novo pedido",
    "Preparando",
    "Pronto",
    "IPA 500ml",
    "Sem gelo",
  ])
    expect(html).toContain(text);
});
it("read-only members and finalized orders have no status actions", () => {
  expect(
    renderToStaticMarkup(<OrderList orders={[order]} tables={[]} />),
  ).not.toContain("<button");
  for (const status of ["delivered", "cancelled"] as const)
    expect(
      renderToStaticMarkup(
        <OrderList orders={[{ ...order, status }]} tables={[]} editable />,
      ),
    ).not.toContain("<button");
  expect(
    renderToStaticMarkup(<OrderList orders={[order]} tables={[]} editable />),
  ).toContain("Marcar como aceito");
});
it("creation asks for an open session, never a mandatory table or customer", () => {
  const html = renderToStaticMarkup(
    <OrderForm
      sessions={[]}
      tables={[]}
      products={[]}
      busy={false}
      onCreate={async () => {}}
    />,
  );
  expect(html).toContain("Atendimento");
  expect(html).toContain("Abra um atendimento");
  expect(html).not.toContain("Selecione uma mesa");
  expect(html).not.toContain("customerUid");
});
