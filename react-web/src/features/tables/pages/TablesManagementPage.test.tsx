import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TableForm, TableList } from "./TablesManagementPage";
const table = {
  id: "stable",
  number: 5,
  name: "Mesa 05",
  capacity: 4,
  active: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
it("shows physical capacity and hides mutations for read-only membership", () => {
  const html = renderToStaticMarkup(
    <TableList
      tables={[table]}
      editable={false}
      busy={false}
      onEdit={() => {}}
      onToggle={() => {}}
    />,
  );
  expect(html).toContain("Capacidade: 4 pessoas");
  expect(html).toContain("Ativa");
  expect(html).not.toContain("<button");
});
it("offers edit and reactivation without deletion", () => {
  const html = renderToStaticMarkup(
    <TableList
      tables={[{ ...table, active: false }]}
      editable
      busy={false}
      onEdit={() => {}}
      onToggle={() => {}}
    />,
  );
  expect(html).toContain("Editar Mesa 05");
  expect(html).toContain("Ativar Mesa 05");
  expect(html).not.toContain("Excluir");
});
it("has positive integer fields and locks the form while saving", () => {
  const html = renderToStaticMarkup(
    <TableForm
      table={table}
      busy
      onSave={async () => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain('min="1"');
  expect(html).toContain('step="1"');
  expect(html).toContain('<fieldset disabled=""');
});
