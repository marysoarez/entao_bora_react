import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { resolvePublicEntity } from "../../../core/repository";
import { checkIntoPlace } from "../../../core/placeCheckInService";
import type { Place } from "../../../shared/models";
import { MenuRepository } from "../../menu-management/data/menuRepository";
import type { MenuCategory, MenuProduct } from "../../menu-management/model/menu";
import { MAX_ORDER_ITEMS, orderStatusLabels, orderSubtotal, snapshotOrderItem, type Order } from "../../orders/model/order";
import { useSession } from "../../session";
import { prepareQrContext } from "../data/qrContextRepository";
import { QrOrdersRepository } from "../data/qrOrdersRepository";
import { parseQrTableNumber, type QrContext } from "../model/qrContext";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function QrCheckInPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const { user } = useSession();
  const [place, setPlace] = useState<Place | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState("");
  const [loadError, setLoadError] = useState({ slug: "", message: "" });
  const [context, setContext] = useState<QrContext | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState([{ menuItemId: "", quantity: 1 }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const table = useMemo(() => {
    try { return { number: parseQrTableNumber(params.get("table")), error: "" }; }
    catch (cause) { return { number: null, error: (cause as Error).message }; }
  }, [params]);
  useEffect(() => {
    if (!user || table.error) return;
    let alive = true;
    resolvePublicEntity("places", slug).then(async resolved => {
      if (!resolved) throw Error("Estabelecimento não encontrado.");
      await checkIntoPlace(resolved.id, user.id, "qr");
      if (alive) { setPlace(resolved); setContext(null); setResolvedSlug(slug); setLoadError({ slug: "", message: "" }); setError(""); }
    }).catch(cause => alive && setLoadError({ slug, message: (cause as Error).message })).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [slug, table, user]);
  useEffect(() => {
    if (!place || place.menuSchemaVersion !== 2) return;
    return MenuRepository.watch(place.id, false, (nextCategories, nextProducts) => {
      setCategories(nextCategories); setProducts(nextProducts.filter(product => product.active && product.available));
    }, cause => setError(cause.message));
  }, [place]);
  useEffect(() => context && user ? QrOrdersRepository.watch(context.placeId, user.id, setOrders, cause => setError(cause.message)) : undefined, [context, user]);
  const available = products.filter(product => categories.some(category => category.id === product.categoryId && category.active));
  const estimate = orderSubtotal(items.flatMap(line => {
    const product = available.find(row => row.id === line.menuItemId);
    try { return product ? [snapshotOrderItem(product.id, product, line.quantity)] : []; } catch { return []; }
  }));
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || !user) return;
    setBusy(true); setError("");
    try {
      await QrOrdersRepository.create(context, { items, notes }, user);
      setItems([{ menuItemId: "", quantity: 1 }]); setNotes("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function startService() {
    if (!place || !user) return;
    setBusy(true); setError("");
    try { setContext(await prepareQrContext(place.id, table.number, user)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  if (table.error) return <p role="alert">{table.error}</p>;
  if (resolvedSlug !== slug) return loadError.slug === slug ? <p role="alert">{loadError.message}</p> : <p>Preparando seu atendimento…</p>;
  if (!place) return <p role="alert">Não foi possível realizar o check-in.</p>;
  return <main className="qr-checkin-page">
    <p>Check-in realizado em</p><h1>{place.name}</h1>
    <p>{table.number ? `QR da Mesa ${String(table.number).padStart(2, "0")}` : "QR do estabelecimento"}</p>
    <Link to={`/place/${place.slug || place.id}`}>Ver página do estabelecimento</Link>
    {error && <p role="alert">{error}</p>}
    {!context ? <section>
      <h2>Presença confirmada</h2>
      <p>Você pode permanecer no estabelecimento sem iniciar um atendimento ou fazer pedidos.</p>
      <button type="button" disabled={busy} onClick={() => { void startService(); }}>
        {busy ? "Iniciando…" : "Iniciar atendimento para consumir"}
      </button>
    </section> : <>
    <p>{context.tableId ? `Atendimento na Mesa ${String(table.number).padStart(2, "0")}` : "Atendimento sem mesa"}</p>
    <p>Atendimento atual: {context.serviceSessionId}</p>
    {place.menuSchemaVersion !== 2 ? <p>Cardápio para pedidos ainda não preparado.</p> : <form className="table-form order-form" onSubmit={submit}>
      <h2>Cardápio e pedido</h2>
      <fieldset disabled={busy || !available.length}>
        {items.map((line, index) => <div className="order-item-input" key={index}>
          <label>Produto {index + 1}<select required value={line.menuItemId} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, menuItemId: event.target.value } : row))}>
            <option value="">Selecione</option>{available.filter(product => product.id === line.menuItemId || !items.some(row => row.menuItemId === product.id)).map(product => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}
          </select></label>
          <label>Quantidade<input type="number" min={1} max={999} required value={line.quantity} onChange={event => setItems(items.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) } : row))} /></label>
          <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remover</button>
        </div>)}
        <button type="button" disabled={items.length >= MAX_ORDER_ITEMS} onClick={() => setItems([...items, { menuItemId: "", quantity: 1 }])}>Adicionar produto</button>
        <label>Observações<textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <p>Total estimado: {money(estimate)}</p><button type="submit">Enviar pedido</button>
      </fieldset>
    </form>}
    <section><h2>Acompanhamento</h2>{orders.length ? <ul className="table-list">{orders.map(order => <li key={order.id}><strong>Pedido #{order.id}</strong><span>{orderStatusLabels[order.status]} · {money(order.total)}</span></li>)}</ul> : <p>Você ainda não fez pedidos neste estabelecimento.</p>}</section>
    </>}
  </main>;
}
