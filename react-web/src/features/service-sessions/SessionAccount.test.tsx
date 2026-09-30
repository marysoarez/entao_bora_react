import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Order } from "../orders/model/order";
import type { ServiceSession } from "./model/serviceSession";
import { SessionAccount } from "./SessionAccount";
import { SessionList } from "./pages/ServiceSessionsPage";
const session: ServiceSession = {
  id: "ABC",
  placeId: "one",
  tableId: null,
  serviceType: "counter",
  status: "open",
  customerCount: 2,
  openedAt: new Date(1),
  closedAt: null,
  openedBy: "owner",
  closedBy: null,
  source: "partner_web",
  createdAt: new Date(1),
  updatedAt: new Date(1),
};
const order: Order = {
  id: "150",
  placeId: "one",
  serviceSessionId: "ABC",
  tableId: null,
  serviceType: "counter",
  customerUid: null,
  status: "accepted",
  items: [
    { menuItemId: "ipa", name: "IPA", quantity: 2, unitPrice: 18, total: 36 },
  ],
  subtotal: 36,
  total: 36,
  notes: "",
  createdAt: new Date(1),
  updatedAt: new Date(1),
};
it("shows the account and item snapshots in closed session history", () => {
  const html = renderToStaticMarkup(
    <SessionList
      sessions={[{ ...session, status: "closed", closedAt: new Date(2) }]}
      editable
      busy={false}
      onFinish={() => {}}
      accountState={{ status: "ready", orders: [order] }}
    />,
  );
  for (const text of [
    "Balcão",
    "Pedido #150",
    "36,00",
    "IPA",
    "Total:",
    "Finalização:",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("<button");
});
it("does not display zero or enable closing when data is loading or inaccessible", () => {
  for (const state of [
    { status: "loading" },
    { status: "error", message: "Sem permissão" },
  ] as const) {
    const html = renderToStaticMarkup(
      <SessionList
        sessions={[session]}
        editable
        busy={false}
        onFinish={() => {}}
        accountState={state}
      />,
    );
    expect(html).not.toContain("Total:");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  }
  expect(
    renderToStaticMarkup(
      <SessionAccount session={session} state={{ status: "disabled" }} />,
    ),
  ).not.toContain("Total:");
});
it("retains cancelled lines and explains that they do not contribute", () => {
  const html = renderToStaticMarkup(
    <SessionAccount
      session={session}
      state={{ status: "ready", orders: [{ ...order, status: "cancelled" }] }}
    />,
  );
  expect(html).toContain("Pedido #150");
  expect(html).toContain("não incluído no total");
  expect(html).toContain("0,00");
});
it("shows zero for an empty loaded session, but blocks corrupt bills", () => {
  expect(
    renderToStaticMarkup(
      <SessionAccount
        session={session}
        state={{ status: "ready", orders: [] }}
      />,
    ),
  ).toContain("0,00");
  const html = renderToStaticMarkup(
    <SessionList
      sessions={[session]}
      editable
      busy={false}
      onFinish={() => {}}
      accountState={{ status: "ready", orders: [{ ...order, total: NaN }] }}
    />,
  );
  expect(html).toContain("Valor de pedido inválido");
  expect(html).not.toContain("Total:");
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
