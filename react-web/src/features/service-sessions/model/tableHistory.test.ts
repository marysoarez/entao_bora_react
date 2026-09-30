import { expect, it } from "vitest";
import { sessionDuration, tableHistory } from "./tableHistory";
import type { ServiceSession } from "./serviceSession";
const session = (
  id: string,
  start: number,
  end: number | null,
): ServiceSession => ({
  id,
  placeId: "p",
  tableId: "t",
  serviceType: "table",
  status: end === null ? "open" : "closed",
  customerCount: 3,
  openedBy: "opener",
  closedBy: end === null ? null : "closer",
  openedAt: new Date(start * 60000),
  closedAt: end === null ? null : new Date(end * 60000),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  source: "partner_web",
});
it("keeps every journey in descending order and isolates the table", () => {
  const rows = [
    session("a", 0, 85),
    session("b", 100, 190),
    session("c", 210, null),
    { ...session("other", 250, null), tableId: "other" },
  ];
  expect(tableHistory(rows, "t").map((row) => row.id)).toEqual(["c", "b", "a"]);
  expect(rows[0].id).toBe("a");
  expect(sessionDuration(rows[0], 999999999)).toBe("1h25");
  expect(sessionDuration(rows[1], 999999999)).toBe("1h30");
  expect(sessionDuration(rows[2], 252 * 60000)).toBe("42 min");
});
