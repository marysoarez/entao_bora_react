import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MenuForm } from "./MenuEditor";
import { PublicMenu } from "./PublicMenu";
import { parsePlace } from "../../shared/domain";
it("reuses image upload and exposes price, order, activity and availability", () => {
  const html = renderToStaticMarkup(
    <MenuForm
      kind="product"
      categories={[]}
      busy={false}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
  );
  for (const text of [
    "Preço",
    "Ordem",
    "Ativo",
    "Disponível",
    'type="file"',
    'accept="image/jpeg,image/png,image/webp"',
  ])
    expect(html).toContain(text);
});
it("keeps existing public menu readable until import", () => {
  const place = parsePlace("one", {
    menuItems: [
      {
        id: "old",
        title: "IPA antiga",
        description: "Original",
        category: "Bebidas",
        price: 18,
      },
    ],
  });
  const html = renderToStaticMarkup(<PublicMenu place={place} />);
  expect(html).toContain("IPA antiga");
  expect(html).toContain("Bebidas");
});
