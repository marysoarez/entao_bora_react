// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseEvent, parsePlace, parseUser } from "../../../shared/domain";
import type { User } from "../../../shared/models";

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  id: undefined as string | undefined,
  search: "",
  listPlaces: vi.fn(),
  resolve: vi.fn(),
  save: vi.fn(),
  feature: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../../session", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useParams: () => ({ id: mocks.id }),
  useSearchParams: () => [new URLSearchParams(mocks.search)],
  useLocation: () => ({ state: null }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../../../core/repository", () => ({
  listPlaces: mocks.listPlaces,
  resolvePublicEntity: mocks.resolve,
  saveEntity: mocks.save,
  setFeaturedEvent: mocks.feature,
}));
vi.mock("../eventAddress", () => ({
  refineEventAddress: async (address: unknown) => address,
}));
vi.mock("../../AddressSearch", () => ({
  AddressSearch: ({ onChange, onSelectionChange }: any) => (
    <button
      type="button"
      onClick={() => {
        onChange({
          displayName: "Meu endereço",
          latitude: -22,
          longitude: -43,
        });
        onSelectionChange(true);
      }}
    >
      Selecionar endereço
    </button>
  ),
}));
vi.mock("../../ImageUpload", () => ({
  ImageUpload: ({ onImage }: any) => (
    <button type="button" onClick={() => onImage("Y292ZXI=")}>
      Escolher capa
    </button>
  ),
}));
import { EventEditorPage } from "./EventEditorPage";

let container: HTMLDivElement;
let root: Root;
const place = parsePlace("public-place", {
  name: "Bar de outra pessoa",
  ownerId: "other",
  address: { displayName: "Rua do bar", latitude: -23, longitude: -44 },
});
const event = (createdBy = "uid") =>
  parseEvent("existing", {
    title: "Show",
    description: "Descrição",
    createdBy,
    coverImage: "Y292ZXI=",
    startDate: new Date("2030-10-10T20:00:00Z"),
    endDate: new Date("2030-10-10T22:00:00Z"),
    address: {
      displayName: "Endereço original",
      latitude: -22,
      longitude: -43,
    },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = parseUser("uid", { role: "user" });
  mocks.id = undefined;
  mocks.search = "";
  mocks.listPlaces.mockResolvedValue([place]);
  mocks.resolve.mockResolvedValue(event());
  mocks.save.mockResolvedValue("saved");
  mocks.feature.mockResolvedValue(undefined);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <EventEditorPage />
      </MemoryRouter>,
    ),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function fill(selector: string, value: string) {
  const element = container.querySelector(selector) as
    | HTMLInputElement
    | HTMLTextAreaElement;
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
}
async function completeNewEvent() {
  await fill("input", "Novo show");
  await fill("textarea", "Descrição do show");
  await click("Escolher capa");
  await fill('input[type="datetime-local"]', "2030-10-10T18:00");
  // Date inputs belong to separate Field elements.
  const end = container.querySelectorAll('input[type="datetime-local"]')[1];
  end.setAttribute("data-test-end", "true");
  await fill('[data-test-end="true"]', "2030-10-10T22:00");
}

it.each(["user", "admin"])(
  "%s cria em estabelecimento público sem ser parceiro",
  async (role) => {
    mocks.user = parseUser("uid", { role });
    mocks.search = "placeId=public-place";
    await render();
    expect(container.textContent).toContain("Bar de outra pessoa");
    await completeNewEvent();
    await submit();
    expect(mocks.save).toHaveBeenCalledWith(
      "events",
      expect.objectContaining({ title: "Novo show", placeId: place.id }),
      mocks.user,
    );
  },
);

it("cria com endereço personalizado mesmo quando a lista de locais falha", async () => {
  mocks.listPlaces.mockRejectedValueOnce(Error("unavailable"));
  await render();
  await completeNewEvent();
  await click("Selecionar endereço");
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(
    "events",
    expect.objectContaining({ placeId: null, locationName: "Meu endereço" }),
    mocks.user,
  );
});

it.each(["user", "partner", "admin"])(
  "%s edita evento próprio",
  async (role) => {
    mocks.id = "existing";
    mocks.user = parseUser("uid", { role });
    await render();
    await fill("input", "Título editado");
    await submit();
    expect(mocks.save).toHaveBeenCalledWith(
      "events",
      expect.objectContaining({
        id: "existing",
        createdBy: "uid",
        title: "Título editado",
      }),
      mocks.user,
    );
  },
);

it.each(["user", "partner"])(
  "%s não abre formulário de edição de terceiros",
  async (role) => {
    mocks.id = "existing";
    mocks.user = parseUser("uid", { role });
    mocks.resolve.mockResolvedValueOnce(event("other"));
    await render();
    expect(container.textContent).toContain("Sem permissão");
    expect(container.querySelector("form")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);

it("administrador gerencia somente destaque de terceiros", async () => {
  mocks.id = "public-slug";
  mocks.user = parseUser("uid", { role: "admin" });
  mocks.resolve.mockResolvedValueOnce(event("other"));
  await render();
  expect(container.textContent).toContain("Gerenciar destaque");
  expect(container.querySelector("textarea")).toBeNull();
  await act(async () =>
    (
      container.querySelector('input[type="checkbox"]') as HTMLInputElement
    ).click(),
  );
  await submit();
  expect(mocks.feature).toHaveBeenCalledWith("existing", true, mocks.user);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("usuário comum não recebe controle de destaque e preserva destaque existente", async () => {
  mocks.id = "existing";
  mocks.resolve.mockResolvedValueOnce({ ...event(), featured: true });
  await render();
  expect(container.querySelector(".event-feature-toggle")).toBeNull();
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(
    "events",
    expect.objectContaining({ featured: true }),
    mocks.user,
  );
  expect(mocks.feature).not.toHaveBeenCalled();
});

it("sem sessão não apresenta nem envia formulário", async () => {
  mocks.user = null;
  await render();
  expect(container.textContent).toContain("Faça login");
  expect(container.querySelector("form")).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("troca de evento ou sessão não reutiliza formulário autorizado anteriormente", async () => {
  mocks.id = "existing";
  await render();
  expect(container.querySelector("textarea")).not.toBeNull();
  mocks.id = "third-party";
  mocks.resolve.mockResolvedValueOnce({ ...event("other"), id: "third-party" });
  await render();
  expect(container.querySelector("form")).toBeNull();
  mocks.id = "existing";
  await render();
  mocks.user = parseUser("another-user", {});
  await render();
  expect(container.querySelector("form")).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("preserva o endereço salvo ao editar evento vinculado", async () => {
  mocks.id = "existing";
  mocks.resolve.mockResolvedValueOnce({ ...event(), placeId: place.id });
  await render();
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(
    "events",
    expect.objectContaining({ address: event().address }),
    mocks.user,
  );
});
