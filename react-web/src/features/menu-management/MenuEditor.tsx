import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ImageUpload } from "../ImageUpload";
import { useSession } from "../session";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { usePlaceModules } from "../place-modules/usePlaceModules";
import type { User } from "../../shared/models";
import { currency } from "../../shared/domain";
import { MenuRepository } from "./data/menuRepository";
import type { MenuCategory, MenuProduct, ProductInput } from "./model/menu";
const empty: ProductInput = {
  name: "",
  description: "",
  order: 0,
  active: true,
  categoryId: "",
  price: 0,
  imageUrl: "",
  available: true,
};
export function MenuForm({
  kind,
  initial,
  categories,
  busy,
  onSave,
  onCancel,
}: {
  kind: "category" | "product";
  initial?: MenuCategory | MenuProduct;
  categories: MenuCategory[];
  busy: boolean;
  onSave: (data: ProductInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ProductInput>({
    ...empty,
    categoryId: categories[0]?.id ?? "",
    ...initial,
  });
  const [price, setPrice] = useState(
    String(initial && "price" in initial ? initial.price : 0),
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const change = (patch: Partial<ProductInput>) =>
    setDraft((current) => ({ ...current, ...patch }));
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (kind === "product" && !/^\d+(?:[.,]\d{1,2})?$/.test(price.trim())) throw Error("Informe um preço com até duas casas decimais.");
      await onSave({ ...draft, price: Number(price.replace(",", ".")) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao salvar.");
    }
  }
  return (
    <form onSubmit={submit} className="table-form">
      <h2>{kind === "category" ? "Categoria" : "Produto"}</h2>
      <fieldset disabled={busy}>
        <label>
          Nome
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </label>
        <label>
          Descrição
          <textarea
            maxLength={2000}
            value={draft.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
        <label>
          Ordem
          <input
            required
            type="number"
            min="0"
            step="1"
            value={draft.order}
            onChange={(e) => change({ order: Number(e.target.value) })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => change({ active: e.target.checked })}
          />{" "}
          Ativo
        </label>
        {kind === "product" && (
          <>
            <label>
              Categoria
              <select
                required
                value={draft.categoryId}
                onChange={(e) => change({ categoryId: e.target.value })}
              >
                <option value="">Selecione</option>
                {categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.active ? "" : " (desativada)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preço (R$)
              <input
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.available}
                onChange={(e) => change({ available: e.target.checked })}
              />{" "}
              Disponível
            </label>
            <label>
              URL da imagem
              <input
                value={draft.imageUrl}
                onChange={(e) => change({ imageUrl: e.target.value })}
              />
            </label>
            <ImageUpload
              onImage={(imageUrl) => change({ imageUrl })}
              onBusyChange={setUploading}
            />
            {draft.imageUrl && (
              <>
                <img src={draft.imageUrl} alt="Prévia do produto" width={120} />
                <button type="button" onClick={() => change({ imageUrl: "" })}>
                  Remover imagem
                </button>
              </>
            )}
          </>
        )}
        <button disabled={uploading} type="submit">
          {busy ? "Salvando..." : "Salvar"}
        </button>
        <button disabled={uploading} type="button" onClick={onCancel}>
          Cancelar
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function Workspace({ placeId, user }: { placeId: string; user: User }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuProduct[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    kind: "category" | "product";
    id?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    kind: "category" | "product";
    id: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    void MenuRepository.initialized(placeId)
      .then((value) => {
        if (alive) setReady(value);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    const stop = MenuRepository.watch(
      placeId,
      true,
      (c, i) => {
        setCategories(c);
        setItems(i);
      },
      (cause) => setError(cause.message),
    );
    return () => {
      alive = false;
      stop();
    };
  }, [placeId]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao concluir.");
    } finally {
      setBusy(false);
    }
  }
  async function save(data: ProductInput) {
    setBusy(true);
    try {
      if (editing?.kind === "category")
        await MenuRepository.saveCategory(placeId, data, user, editing.id);
      else await MenuRepository.saveProduct(placeId, data, user, editing?.id);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {ready === null ? (
        <p>Carregando cardápio...</p>
      ) : !ready ? (
        <section>
          <p>
            Importe as categorias e produtos existentes. Os dados antigos serão
            preservados.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await MenuRepository.initialize(placeId, user);
                setReady(true);
              });
            }}
          >
            Preparar cardápio
          </button>
        </section>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() => setEditing({ kind: "category" })}
          >
            Nova categoria
          </button>
          <button
            disabled={busy || !categories.length}
            onClick={() => setEditing({ kind: "product" })}
          >
            Novo produto
          </button>
          {editing && (
            <MenuForm
              key={`${editing.kind}:${editing.id ?? "new"}`}
              kind={editing.kind}
              initial={
                editing.kind === "category"
                  ? categories.find((row) => row.id === editing.id)
                  : items.find((row) => row.id === editing.id)
              }
              categories={categories}
              busy={busy}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          )}
          {deleting && (
            <div role="alert">
              <p>Excluir {deleting.name}? Esta ação remove o cadastro.</p>
              <button
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    if (deleting.kind === "category")
                      await MenuRepository.deleteCategory(
                        placeId,
                        deleting.id,
                        user,
                      );
                    else
                      await MenuRepository.deleteProduct(
                        placeId,
                        deleting.id,
                        user,
                      );
                    setDeleting(null);
                    setEditing(null);
                  });
                }}
              >
                Confirmar exclusão
              </button>
              <button disabled={busy} onClick={() => setDeleting(null)}>
                Manter cadastro
              </button>
            </div>
          )}
          {!categories.length && <p>Nenhuma categoria cadastrada.</p>}
          {categories.map((category) => (
            <section key={category.id}>
              <h2>
                {category.name} · Ordem {category.order} ·{" "}
                {category.active ? "Ativa" : "Desativada"}
              </h2>
              <p>{category.description}</p>
              <button
                disabled={busy}
                onClick={() =>
                  setEditing({ kind: "category", id: category.id })
                }
              >
                Editar categoria
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  setDeleting({
                    kind: "category",
                    id: category.id,
                    name: category.name,
                  })
                }
              >
                Excluir categoria
              </button>
              <ul className="table-list">
                {items
                  .filter((item) => item.categoryId === category.id)
                  .map((item) => (
                    <li key={item.id}>
                      <div>
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            width={100}
                          />
                        )}
                        <h3>
                          {item.name} · {currency(item.price)}
                        </h3>
                        <p>{item.description}</p>
                        <p>
                          Ordem {item.order} ·{" "}
                          {item.active ? "Ativo" : "Desativado"} ·{" "}
                          {item.available ? "Disponível" : "Indisponível"}
                        </p>
                      </div>
                      <div>
                        <button
                          disabled={busy}
                          onClick={() =>
                            setEditing({ kind: "product", id: item.id })
                          }
                        >
                          Editar produto
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            setDeleting({
                              kind: "product",
                              id: item.id,
                              name: item.name,
                            })
                          }
                        >
                          Excluir produto
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
export function MenuEditor() {
  const { user } = useSession();
  const access = usePartnerAccess();
  const [params, setParams] = useSearchParams();
  const places = access.places.filter((entry) =>
    access.can(entry.place.id, "editMenu"),
  );
  const requested = params.get("placeId");
  const place = requested
    ? places.find((entry) => entry.place.id === requested)?.place
    : places[0]?.place;
  const modules = usePlaceModules(place?.id);
  if (access.loading) return <p>Carregando estabelecimentos...</p>;
  if (!user || !place)
    return <p role="alert">Estabelecimento indisponivel ou sem permissão.</p>;
  return (
    <main className="tables-management">
      <Link to={`/partner-dashboard?placeId=${encodeURIComponent(place.id)}`}>
        Voltar ao painel
      </Link>
      <h1>Cardápio</h1>
      <label>
        Estabelecimento
        <select
          value={place.id}
          onChange={(e) => setParams({ placeId: e.target.value })}
        >
          {places.map((entry) => (
            <option key={entry.place.id} value={entry.place.id}>
              {entry.place.name}
            </option>
          ))}
        </select>
      </label>
      {modules.loading ? (
        <p>Carregando módulo...</p>
      ) : modules.error ? (
        <p role="alert">{modules.error}</p>
      ) : !modules.available("menu") ? (
        <p>Módulo Cardápio desativado.</p>
      ) : (
        <Workspace
          key={`${place.id}:${user.id}`}
          placeId={place.id}
          user={user}
        />
      )}
    </main>
  );
}
