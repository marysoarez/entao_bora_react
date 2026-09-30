import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,qr")) } }));
import { QrManagementPanel } from "./QrManagementPanel";
const table = (id: string, number: number, active = true) => ({ id, number, name: `Mesa ${number}`, capacity: 4, active, createdAt: new Date(1), updatedAt: new Date(1) });
it("renders stable general and active table URLs without session IDs", () => {
  const html = renderToStaticMarkup(<QrManagementPanel slug="heavy-beer" tables={[table("t5", 5), table("t6", 6, false)]} />);
  expect(html).toContain("/checkin/heavy-beer");
  expect(html).toContain("?table=05");
  expect(html).not.toContain("?table=06");
  expect(html).not.toMatch(/serviceSessionId/);
});
it("requires a stable place slug", () => {
  expect(renderToStaticMarkup(<QrManagementPanel slug="" />)).toContain("Defina um slug");
});
