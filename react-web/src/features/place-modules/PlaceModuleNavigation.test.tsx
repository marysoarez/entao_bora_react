import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { PlaceModuleNavigation } from "./PlaceModuleNavigation";
import {
  isPlaceModuleAvailable,
  parsePlaceModules,
} from "../../shared/placeModules";

it("integra Eventos existentes e conserva placeId mesmo sem módulos opcionais", () => {
  const config = parsePlaceModules({
    schemaVersion: 1,
    enabled: { events: false, menu: false, tables: true },
  });
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PlaceModuleNavigation
        placeId="place-1"
        can={() => true}
        available={(id) => isPlaceModuleAvailable(config, id)}
      />
    </MemoryRouter>,
  );
  expect(html).toContain(
    'href="/partner-dashboard?placeId=place-1#partner-events"',
  );
  expect(html).not.toContain('href="/places/menu');
  expect(html).toContain('href="/places/tables?placeId=place-1"');
  for (const label of [
    "Conteúdo",
    "Operação",
    "Engajamento",
    "Gestão",
    "Atendimentos",
    "Equipe",
  ])
    expect(html).toContain(label);
  expect(html.match(/Requer plano/g)).toHaveLength(6);
  const groups = ["Conteúdo", "Operação", "Gestão", "Engajamento"].map(
    (label) => html.indexOf(`>${label}</h2>`),
  );
  expect(groups).toEqual([...groups].sort((a, b) => a - b));
  expect(html.indexOf(">Pedidos</h3>")).toBeLessThan(
    html.indexOf(">Cardápio</h3>"),
  );
  expect(html.indexOf(">Gestão</h2>")).toBeLessThan(
    html.indexOf(">Estoque</h3>"),
  );
  expect(html.indexOf(">Equipe</h3>")).toBeLessThan(
    html.indexOf(">Engajamento</h2>"),
  );
});
it("não transforma habilitação de módulos em permissão de usuário", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PlaceModuleNavigation
        placeId="p1"
        can={(permission) => permission === "view"}
        available={() => true}
      />
    </MemoryRouter>,
  );
  expect(html).toContain("#partner-events");
  expect(html).not.toContain('href="/places/menu');
  expect(html).not.toContain("#partner-team");
});
