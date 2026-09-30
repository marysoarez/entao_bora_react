import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSession } from "../session";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { usePlaceModules } from "../place-modules/usePlaceModules";
import { MenuRepository } from "../menu-management/data/menuRepository";
import type { MenuProduct } from "../menu-management/model/menu";
import type { User } from "../../shared/models";
import { InventoryRepository } from "./data/inventoryRepository";
import {
  displayQuantity,
  inventoryUnits,
  movementLabels,
  movementTypes,
  quantityMilli,
  type InventoryItem,
  type InventoryMovement,
  type InventoryUnit,
  type MovementType,
  type Recipe,
} from "./model/inventory";

function ItemForm({
  item,
  save,
  busy,
  cancel,
}: {
  item?: InventoryItem;
  busy: boolean;
  cancel: () => void;
  save: (
    fields: Pick<InventoryItem, "name" | "unit" | "minimumMilli" | "active">,
  ) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState<InventoryUnit>(item?.unit ?? "un");
  const [minimum, setMinimum] = useState(
    String((item?.minimumMilli ?? 0) / 1000),
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await save({ name, unit, minimumMilli: quantityMilli(minimum), active });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <form className="table-form" onSubmit={submit}>
      <h2>{item ? "Editar insumo" : "Novo insumo"}</h2>
      <fieldset disabled={busy}>
        <label>
          Nome
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Unidade
          <select
            value={unit}
            disabled={!!item}
            onChange={(e) => setUnit(e.target.value as InventoryUnit)}
          >
            {inventoryUnits.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Estoque mínimo
          <input
            required
            inputMode="decimal"
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{" "}
          Insumo ativo
        </label>
        <p>
          Cadastre em unidades, gramas ou mililitros. O saldo inicial é zero;
          registre uma entrada para abastecer.
        </p>
        <button type="submit">Salvar insumo</button>{" "}
        <button type="button" onClick={cancel}>
          Cancelar
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function MovementPanel({
  placeId,
  item,
  user,
  editable,
}: {
  placeId: string;
  item: InventoryItem;
  user: User;
  editable: boolean;
}) {
  const [rows, setRows] = useState<InventoryMovement[] | null>(null);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [type, setType] = useState<MovementType>("entry");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(
    () =>
      InventoryRepository.watchMovements(
        placeId,
        item.id,
        user,
        (next) => {
          setRows(next);
          setReadError("");
        },
        (cause) => {
          setRows(null);
          setReadError(cause.message);
        },
      ),
    [placeId, item.id, user],
  );
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const input = {
        type,
        amountMilli: quantityMilli(amount),
        reason: reason.trim(),
      };
      const fingerprint = JSON.stringify(input);
      if (operation.current?.fingerprint !== fingerprint)
        operation.current = { fingerprint, id: crypto.randomUUID() };
      await InventoryRepository.move(
        placeId,
        item.id,
        operation.current.id,
        input,
        user,
      );
      operation.current = null;
      setAmount("");
      setReason("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Movimentações · {item.name}</h2>
      {editable && item.active && (
        <form className="table-form" onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Tipo
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MovementType)}
              >
                {movementTypes.map((value) => (
                  <option value={value} key={value}>
                    {movementLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade ({item.unit})
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <p>
              Para ajustes, informe a variação positiva ou negativa. Para os
              demais tipos, informe uma quantidade positiva.
            </p>
            <label>
              Motivo
              <input
                required
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button type="submit">
              {busy ? "Registrando…" : "Registrar movimentação"}
            </button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <p>
        Histórico permanente. Corrija diferenças com uma nova movimentação de
        ajuste.
      </p>
      {readError ? (
        <p role="alert">{readError}</p>
      ) : !rows ? (
        <p>Carregando movimentações…</p>
      ) : !rows.length ? (
        <p>Nenhuma movimentação.</p>
      ) : (
        <ul className="table-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {movementLabels[row.type]} · {displayQuantity(row.deltaMilli)}{" "}
                  {row.unit}
                </strong>
                <p>
                  {displayQuantity(row.beforeMilli)} →{" "}
                  {displayQuantity(row.afterMilli)} {row.unit}
                </p>
                <p>
                  {row.reason} · {row.createdAt.toLocaleString("pt-BR")}
                </p>
                <p>
                  Responsável: {row.createdBy} · #{row.id}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecipeForm({
  items,
  recipe,
  menuItemId,
  save,
  busy,
}: {
  items: InventoryItem[];
  recipe?: Recipe;
  menuItemId: string;
  busy: boolean;
  save: (components: Recipe["components"], active: boolean) => Promise<void>;
}) {
  const [rows, setRows] = useState(() =>
    recipe
      ? Object.entries(recipe.components).map(([itemId, component]) => ({
          itemId,
          amount: String(component.quantityMilli / 1000),
        }))
      : [{ itemId: "", amount: "" }],
  );
  const [active, setActive] = useState(recipe?.active ?? true);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (new Set(rows.map((row) => row.itemId)).size !== rows.length)
        throw Error("Agrupe as quantidades do mesmo insumo.");
      const components: Recipe["components"] = {};
      for (const row of rows) {
        const item = items.find((item) => item.id === row.itemId);
        if (!item) throw Error("Selecione os insumos.");
        components[item.id] = {
          unit: item.unit,
          quantityMilli: quantityMilli(row.amount),
        };
      }
      await save(components, active);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <form className="table-form" onSubmit={submit}>
      <h3>Composição por porção</h3>
      <p>
        Até 5 insumos por receita. Salvar uma receita não altera o estoque.
        Revisão atual: {recipe?.revision ?? 0}.
      </p>
      <fieldset disabled={busy || !menuItemId}>
        {rows.map((row, index) => (
          <div key={index} className="order-item-input">
            <label>
              Insumo {index + 1}
              <select
                required
                value={row.itemId}
                onChange={(e) =>
                  setRows(
                    rows.map((r, i) =>
                      i === index ? { ...r, itemId: e.target.value } : r,
                    ),
                  )
                }
              >
                <option value="">Selecione</option>
                {items.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} ({item.unit}){!item.active && " · inativo"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade por porção
              <input
                required
                inputMode="decimal"
                value={row.amount}
                onChange={(e) =>
                  setRows(
                    rows.map((r, i) =>
                      i === index ? { ...r, amount: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Remover insumo {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={rows.length >= 5}
          onClick={() => setRows([...rows, { itemId: "", amount: "" }])}
        >
          Adicionar insumo
        </button>
        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{" "}
          Receita ativa
        </label>
        <button type="submit">Salvar receita</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function Workspace({
  placeId,
  user,
  editable,
  menuEnabled,
}: {
  placeId: string;
  user: User;
  editable: boolean;
  menuEnabled: boolean;
}) {
  const [data, setData] = useState<{
    items: InventoryItem[];
    recipes: Recipe[];
  } | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [error, setError] = useState("");
  const [menuError, setMenuError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  useEffect(
    () =>
      InventoryRepository.watch(
        placeId,
        user,
        (items, recipes) => {
          setData({ items, recipes });
          setError("");
        },
        (cause) => {
          setData(null);
          setError(cause.message);
        },
      ),
    [placeId, user],
  );
  useEffect(() => {
    if (!menuEnabled) return;
    return MenuRepository.watch(
      placeId,
      true,
      (_categories, next) => {
        setProducts(next);
        setMenuError("");
      },
      (cause) => {
        setProducts([]);
        setMenuError(cause.message);
      },
    );
  }, [placeId, menuEnabled]);
  async function action(work: () => Promise<unknown>) {
    if (inFlight.current) throw Error("Aguarde a gravação atual.");
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      await work();
      setNotice("Registro salvo.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Carregando estoque…</p>;
  const item = data.items.find((row) => row.id === selected);
  const recipe = data.recipes.find((row) => row.menuItemId === menuItemId);
  return (
    <>
      {notice && <output>{notice}</output>}
      {editable && (
        <button type="button" onClick={() => setEditing("new")}>
          Novo insumo
        </button>
      )}
      {editable && editing && (
        <ItemForm
          key={editing}
          item={data.items.find((row) => row.id === editing)}
          busy={busy}
          cancel={() => setEditing(null)}
          save={(fields) =>
            action(async () => {
              await InventoryRepository.saveItem(
                placeId,
                editing === "new" ? null : editing,
                fields,
                user,
              );
              setEditing(null);
            })
          }
        />
      )}
      {!data.items.length && <p>Nenhum insumo cadastrado.</p>}
      <ul className="table-list">
        {data.items.map((row) => (
          <li key={row.id}>
            <div>
              <h2>{row.name}</h2>
              <p>
                Estoque atual: {displayQuantity(row.stockMilli)} {row.unit} ·
                Mínimo: {displayQuantity(row.minimumMilli)} {row.unit}
              </p>
              <p>
                {!row.active
                  ? "Inativo"
                  : row.stockMilli <= row.minimumMilli
                    ? "No mínimo ou abaixo"
                    : "Estoque disponível"}
              </p>
              <button type="button" onClick={() => setSelected(row.id)}>
                Movimentações de {row.name}
              </button>
              {editable && (
                <button type="button" onClick={() => setEditing(row.id)}>
                  Editar {row.name}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {item && (
        <MovementPanel
          key={`${placeId}:${item.id}`}
          placeId={placeId}
          item={item}
          user={user}
          editable={editable}
        />
      )}
      <section>
        <h2>Receitas</h2>
        <p>
          Um item do cardápio pode combinar vários insumos. Pedidos ainda não
          geram baixas automáticas.
        </p>
        {data.recipes.length > 0 && (
          <ul>
            {data.recipes.map((row) => (
              <li key={row.menuItemId}>
                {products.find((p) => p.id === row.menuItemId)?.name ||
                  row.menuItemId}{" "}
                · revisão {row.revision} · {row.active ? "ativa" : "inativa"}
                <ul>
                  {Object.entries(row.components).map(([id, component]) => (
                    <li key={id}>
                      {data.items.find((item) => item.id === id)?.name || id}:{" "}
                      {displayQuantity(component.quantityMilli)}{" "}
                      {component.unit}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {menuError && <p role="alert">Cardápio: {menuError}</p>}
        {editable &&
          (menuEnabled ? (
            <>
              <label>
                Item do cardápio
                <select
                  value={menuItemId}
                  onChange={(e) => setMenuItemId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {products.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              {menuItemId && (
                <RecipeForm
                  key={`${menuItemId}:${recipe?.revision ?? 0}`}
                  items={data.items}
                  recipe={recipe}
                  menuItemId={menuItemId}
                  busy={busy}
                  save={(components, active) =>
                    action(() =>
                      InventoryRepository.saveRecipe(
                        placeId,
                        menuItemId,
                        components,
                        active,
                        user,
                      ),
                    )
                  }
                />
              )}
            </>
          ) : (
            <p>Ative Cardápio para selecionar produtos e preparar receitas.</p>
          ))}
      </section>
    </>
  );
}

export function InventoryPage() {
  const { user } = useSession();
  const access = usePartnerAccess();
  const [params, setParams] = useSearchParams();
  const selected = params.get("placeId")
    ? access.places.find((row) => row.place.id === params.get("placeId"))
    : access.places[0];
  const placeId = selected?.place.id;
  const modules = usePlaceModules(placeId);
  if (access.loading) return <p>Carregando estabelecimentos…</p>;
  if (access.error) return <p role="alert">{access.error}</p>;
  if (!user || !placeId || !access.can(placeId, "view"))
    return <p role="alert">Estabelecimento indisponível ou sem permissão.</p>;
  return (
    <main className="tables-management">
      <Link to={`/partner-dashboard?placeId=${encodeURIComponent(placeId)}`}>
        Voltar ao painel
      </Link>
      <h1>Estoque</h1>
      <label>
        Estabelecimento
        <select
          value={placeId}
          onChange={(e) => setParams({ placeId: e.target.value })}
        >
          {access.places.map((row) => (
            <option key={row.place.id} value={row.place.id}>
              {row.place.name}
            </option>
          ))}
        </select>
      </label>
      {modules.loading ? (
        <p>Carregando módulo…</p>
      ) : modules.error ? (
        <p role="alert">{modules.error}</p>
      ) : !modules.available("inventory") ? (
        <p>
          Estoque desativado. O proprietário ou administrador pode ativá-lo nas
          configurações do painel.
        </p>
      ) : (
        <Workspace
          key={`${placeId}:${user.id}:${access.can(placeId, "manageInventory")}:${modules.available("menu")}`}
          placeId={placeId}
          user={user}
          editable={access.can(placeId, "manageInventory")}
          menuEnabled={modules.available("menu")}
        />
      )}
    </main>
  );
}
