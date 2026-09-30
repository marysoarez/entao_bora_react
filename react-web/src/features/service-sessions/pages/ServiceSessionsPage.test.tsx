import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SessionForm, SessionList } from "./ServiceSessionsPage";
import type { ServiceSession } from "../model/serviceSession";
const session: ServiceSession = {
  id: "s1",
  placeId: "one",
  tableId: null,
  serviceType: "lounge",
  customerCount: 5,
  status: "open",
  openedAt: new Date(1),
  closedAt: null,
  openedBy: "owner",
  closedBy: null,
  source: "partner_web",
  createdAt: new Date(1),
  updatedAt: new Date(1),
};
it("offers all four types without a mandatory customer identity", () => {
  const html = renderToStaticMarkup(
    <SessionForm tables={[]} busy={false} onOpen={async () => {}} />,
  );
  for (const label of [
    "Mesa",
    "Balcão",
    "Salão",
    "Retirada",
    "Quantidade de pessoas",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("customerUid");
  expect(html).not.toContain('name="email"');
});
it("read-only members cannot finish sessions", () => {
  const html = renderToStaticMarkup(
    <SessionList
      sessions={[session]}
      editable={false}
      busy={false}
      onFinish={() => {}}
    />,
  );
  expect(html).toContain("5 pessoa(s)");
  expect(html).not.toContain("<button");
});
it("only open sessions offer terminal actions", () => {
  const render = (status: ServiceSession["status"]) =>
    renderToStaticMarkup(
      <SessionList
        sessions={[{ ...session, status }]}
        editable
        busy={false}
        onFinish={() => {}}
      />,
    );
  expect(render("open")).toContain("Encerrar atendimento s1");
  expect(render("open")).toContain("Cancelar atendimento s1");
  expect(render("closed")).not.toContain("<button");
  expect(render("cancelled")).not.toContain("<button");
});
