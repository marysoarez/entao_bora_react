import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TableHistoryView } from "./TableHistory";
import type { ServiceSession } from "../model/serviceSession";
it("shows current occupancy, completed history, group size and both operators", () => {
  const table = {
    id: "t",
    number: 5,
    name: "Mesa 05",
    capacity: 4,
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const base: ServiceSession = {
    id: "past",
    placeId: "p",
    tableId: "t",
    serviceType: "table",
    status: "closed",
    customerCount: 4,
    openedAt: new Date(0),
    closedAt: new Date(90 * 60000),
    openedBy: "Maria",
    closedBy: "João",
    source: "partner_web",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const html = renderToStaticMarkup(
    <TableHistoryView
      table={table}
      sessions={[
        base,
        {
          ...base,
          id: "current",
          status: "open",
          openedAt: new Date(100 * 60000),
          closedAt: null,
          closedBy: null,
          customerCount: 3,
        },
      ]}
      now={142 * 60000}
    />,
  );
  for (const text of [
    "Agora",
    "Histórico",
    "past",
    "current",
    "1h30",
    "42 min",
    "4 pessoas",
    "3 pessoas",
    "Maria",
    "João",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Disponível");
});
