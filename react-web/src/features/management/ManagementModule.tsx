import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { doc, GeoPoint, serverTimestamp, updateDoc } from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../core/firebase";
import {
  activity,
  listPlaces,
  editMenu,
  owned,
  resolvePublicEntity,
  saveEntity,
  transferEvent,
} from "../../core/repository";
import {
  canManage,
  currency,
  formatDate,
  locate,
  normalizeSlug,
  parseEvent,
  parsePlace,
} from "../../shared/domain";
import {
  genres,
  type Event,
  type Place,
  type MenuItem,
  type Genre,
} from "../../shared/models";
import { useSession } from "../session";
import { EventCard } from "../events/components/EventCard";
import { Message } from "../../shared/ui/Message";
import { setNotifications } from "../notifications";
import { AddressSearch } from "../AddressSearch";
import { ImageUpload } from "../ImageUpload";
import { Field } from "../../shared/ui/Field";
const dateInput = (d: Date) =>
  new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function Editor({ kind }: { kind: "events" | "places" }) {
  const { id } = useParams(),
    { user } = useSession(),
    navigate = useNavigate();
  const [value, setValue] = useState<Event | Place>(() =>
      kind === "events"
        ? parseEvent("", {
            startDate: new Date(),
            endDate: new Date(Date.now() + 3600000),
          })
        : parsePlace("", {}),
    ),
    [places, setPlaces] = useState<Place[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!id),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (user)
      (kind === "events" ? listPlaces() : owned("places", user))
        .then((p) => alive && setPlaces(p))
        .catch((e) => alive && setError(e.message));
    if (id) {
      const promise =
        kind === "events"
          ? resolvePublicEntity("events", id)
          : resolvePublicEntity("places", id);
      promise
        .then((v) => {
          if (!alive) return;
          if (!v) throw Error("Registro não encontrado.");
          if (
            !canManage(
              user,
              kind === "events" ? (v as Event).createdBy : (v as Place).ownerId,
            )
          )
            throw Error("Sem permissão para editar.");
          setValue(v);
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    } else {
      setValue(
        kind === "events"
          ? parseEvent("", {
              startDate: new Date(),
              endDate: new Date(Date.now() + 3600000),
            })
          : parsePlace("", {}),
      );
    }
    return () => {
      alive = false;
    };
  }, [id, kind, user?.id]);
  const patch = (data: Partial<Event & Place>) =>
    setValue((v) => ({ ...v, ...data }));
  const event = kind === "events" ? (value as Event) : null,
    p = kind === "places" ? (value as Place) : null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const savedId = await saveEntity(kind, value, user);
      navigate(`/${kind === "events" ? "events" : "place"}/${savedId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Message>Carregando formulário…</Message>;
  if (id && !value.id)
    return <Message>{error || "Registro indisponível."}</Message>;
  return (
    <form className="form" onSubmit={submit}>
      <Link to="/" className="subtle">
        ← Voltar
      </Link>
      <h1>
        {id ? "Editar" : "Criar"} {event ? "evento" : "estabelecimento"}
      </h1>
      <p>Compartilhe as informações para a galera encontrar você.</p>
      {error && <Message>{error}</Message>}
      <Field label={event ? "Título do evento *" : "Nome do estabelecimento *"}>
        <Input
          required
          value={event ? event.title : p!.name}
          onChange={(e) =>
            patch(
              event
                ? {
                    title: e.target.value,
                    ...(!id ? { slug: normalizeSlug(e.target.value) } : {}),
                  }
                : {
                    name: e.target.value,
                    ...(!id ? { slug: normalizeSlug(e.target.value) } : {}),
                  },
            )
          }
        />
      </Field>
      <Field label="Endereço do link (slug) *">
        <Input
          required
          value={value.slug}
          readOnly={!!id}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          onChange={(e) => patch({ slug: normalizeSlug(e.target.value) })}
        />
      </Field>
      <Field label="Descrição *">
        <textarea
          required
          value={value.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Field>
      {event && (
        <Field label="Estabelecimento">
          <select
            value={event.placeId ?? ""}
            onChange={(e) => {
              const p = places.find((p) => p.id === e.target.value);
              patch({
                placeId: p?.id ?? null,
                ...(p ? { address: p.address, locationName: p.name } : {}),
              });
            }}
          >
            <option value="">Outro endereço</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {event && (
        <Field label="Nome do local *">
          <Input
            required
            value={event.locationName}
            onChange={(e) => patch({ locationName: e.target.value })}
          />
        </Field>
      )}
      <AddressSearch
        value={value.address}
        onChange={(address) => patch({ address })}
      />
      <div className="form-grid">
        {(
          [
            "number",
            "complement",
            "neighborhood",
            "city",
            "state",
            "postalCode",
          ] as const
        ).map((key, i) => (
          <Field
            key={key}
            label={
              ["Número", "Complemento", "Bairro", "Cidade", "Estado", "CEP"][i]
            }
          >
            <Input
              value={value.address[key] ?? ""}
              onChange={(e) =>
                patch({ address: { ...value.address, [key]: e.target.value } })
              }
            />
          </Field>
        ))}
        <Field label="Latitude *">
          <Input
            type="number"
            step="any"
            min="-90"
            max="90"
            required
            value={value.address.latitude}
            onChange={(e) =>
              patch({
                address: { ...value.address, latitude: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="Longitude *">
          <Input
            type="number"
            step="any"
            min="-180"
            max="180"
            required
            value={value.address.longitude}
            onChange={(e) =>
              patch({
                address: {
                  ...value.address,
                  longitude: Number(e.target.value),
                },
              })
            }
          />
        </Field>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            const pos = await locate();
            patch({
              address: {
                ...value.address,
                latitude: pos.latitude,
                longitude: pos.longitude,
              },
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Usar minha posição nas coordenadas
      </Button>
      {event && (
        <div className="form-grid">
          <Field label="Início *">
            <Input
              required
              type="datetime-local"
              value={dateInput(event.startDate)}
              onChange={(e) =>
                e.target.value && patch({ startDate: new Date(e.target.value) })
              }
            />
          </Field>
          <Field label="Término *">
            <Input
              required
              type="datetime-local"
              value={dateInput(event.endDate)}
              onChange={(e) =>
                e.target.value && patch({ endDate: new Date(e.target.value) })
              }
            />
          </Field>
        </div>
      )}
      <fieldset className="field">
        <legend>Estilos musicais</legend>
        <div className="chips">
          {Object.entries(genres).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={value.musicGenres.includes(key as Genre)}
                onChange={(e) =>
                  patch({
                    musicGenres: e.target.checked
                      ? [...value.musicGenres, key as Genre]
                      : value.musicGenres.filter((g) => g !== key),
                  })
                }
              />{" "}
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={event ? "URL da capa *" : "URLs das fotos (uma por linha)"}>
        {event ? (
          <Input
            type="url"
            required={!event.coverImage}
            value={event.coverImage.startsWith("http") ? event.coverImage : ""}
            placeholder={
              event.coverImage
                ? "Imagem legada preservada; informe uma URL para substituir"
                : "https://…"
            }
            onChange={(e) => patch({ coverImage: e.target.value })}
          />
        ) : (
          <textarea
            value={p!.photos.join("\n")}
            onChange={(e) =>
              patch({ photos: e.target.value.split("\n").filter(Boolean) })
            }
          />
        )}
      </Field>
      {event && (
        <>
          <Field label="Galeria (uma URL por linha)">
            <textarea
              value={event.gallery.join("\n")}
              onChange={(e) =>
                patch({ gallery: e.target.value.split("\n").filter(Boolean) })
              }
            />
          </Field>
          <div className="form-grid">
            <Field label="Ingresso">
              <select
                value={event.ticket.type}
                onChange={(e) =>
                  patch({
                    ticket: {
                      type: e.target.value as "free" | "external",
                      ticketUrl:
                        e.target.value === "free"
                          ? null
                          : event.ticket.ticketUrl,
                    },
                  })
                }
              >
                <option value="free">Gratuito</option>
                <option value="external">Link externo</option>
              </select>
            </Field>
            {event.ticket.type === "external" && (
              <Field label="Link para ingresso *">
                <Input
                  required
                  type="url"
                  value={event.ticket.ticketUrl ?? ""}
                  onChange={(e) =>
                    patch({
                      ticket: { ...event.ticket, ticketUrl: e.target.value },
                    })
                  }
                />
              </Field>
            )}
          </div>
          <h2>Atrações</h2>
          {event.attractions.map((a, i) => (
            <div key={a.id} className="form-grid">
              <Field label="Nome da atração">
                <Input
                  required
                  value={a.name}
                  onChange={(e) =>
                    patch({
                      attractions: event.attractions.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Instagram">
                <Input
                  value={a.instagram ?? ""}
                  onChange={(e) =>
                    patch({
                      attractions: event.attractions.map((x, j) =>
                        j === i ? { ...x, instagram: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={a.isHeadliner}
                  onChange={(e) =>
                    patch({
                      attractions: event.attractions.map((x, j) =>
                        j === i ? { ...x, isHeadliner: e.target.checked } : x,
                      ),
                    })
                  }
                />{" "}
                Atração principal
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  patch({
                    attractions: event.attractions.filter((_, j) => j !== i),
                  })
                }
              >
                Remover atração
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patch({
                attractions: [
                  ...event.attractions,
                  { id: crypto.randomUUID(), name: "", isHeadliner: false },
                ],
              })
            }
          >
            Adicionar atração
          </Button>
        </>
      )}
      {p && (
        <>
          <div className="form-grid">
            <Field label="Tipo de estabelecimento">
              <select
                value={p.type}
                onChange={(e) => patch({ type: e.target.value })}
              >
                {[
                  "bar",
                  "pub",
                  "restaurant",
                  "brewery",
                  "concertHall",
                  "club",
                  "festival",
                  "square",
                  "other",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Telefone">
              <Input
                type="tel"
                value={p.phone}
                onChange={(e) => patch({ phone: e.target.value })}
              />
            </Field>
            <Field label="Site">
              <Input
                type="url"
                value={p.website}
                onChange={(e) => patch({ website: e.target.value })}
              />
            </Field>
          </div>
          <details>
            <summary>Horários de funcionamento</summary>
            {[
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ].map((day, i) => {
              const h = p.openingHours.find((h) => h.weekday === day);
              return (
                <div className="form-grid" key={day}>
                  <Field
                    label={
                      [
                        "Segunda",
                        "Terça",
                        "Quarta",
                        "Quinta",
                        "Sexta",
                        "Sábado",
                        "Domingo",
                      ][i]
                    }
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={!!h}
                        onChange={(e) =>
                          patch({
                            openingHours: e.target.checked
                              ? [
                                  ...p.openingHours,
                                  {
                                    weekday: day,
                                    opensAt: { hour: 18, minute: 0 },
                                    closesAt: { hour: 23, minute: 59 },
                                  },
                                ]
                              : p.openingHours.filter((x) => x.weekday !== day),
                          })
                        }
                      />{" "}
                      Aberto
                    </label>
                  </Field>
                  {h && (
                    <div className="form-grid">
                      {(["opensAt", "closesAt"] as const).map((k, j) => (
                        <Field key={k} label={j ? "Fecha às" : "Abre às"}>
                          <Input
                            type="time"
                            value={`${String(h[k].hour).padStart(2, "0")}:${String(h[k].minute).padStart(2, "0")}`}
                            onChange={(e) => {
                              const [hour, minute] = e.target.value
                                .split(":")
                                .map(Number);
                              patch({
                                openingHours: p.openingHours.map((x) =>
                                  x.weekday === day
                                    ? { ...x, [k]: { hour, minute } }
                                    : x,
                                ),
                              });
                            }}
                          />
                        </Field>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </details>
        </>
      )}
      <ImageUpload
        onImage={(image) =>
          patch(
            event ? { coverImage: image } : { photos: [...p!.photos, image] },
          )
        }
      />
      <Field label="Instagram">
        <Input
          value={value.instagram ?? ""}
          onChange={(e) => patch({ instagram: e.target.value })}
        />
      </Field>
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar e visualizar"}
        </Button>
        <Link to="/">Cancelar</Link>
      </div>
    </form>
  );
}
export function Management({ dashboard = false }: { dashboard?: boolean }) {
  const { user } = useSession(),
    [places, setPlaces] = useState<Place[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [params, setParams] = useSearchParams(),
    [target, setTarget] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (user)
      Promise.all([owned("places", user), owned("events", user)])
        .then(([p, e]) => {
          if (alive) {
            setPlaces(p);
            setEvents(e);
          }
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user?.id]);
  return (
    <>
      <div className="section-title">
        <h1 style={{ fontSize: 36 }}>
          {dashboard ? "Painel do parceiro" : "Seus estabelecimentos"}
        </h1>
        <Link to={dashboard ? "/events/create" : "/places/create"}>
          + Criar {dashboard ? "evento" : "local"}
        </Link>
      </div>
      {error && <Message>{error}</Message>}
      {loading && <Message>Carregando seus registros…</Message>}
      {dashboard && (
        <>
          <Field label="Estabelecimento para gerenciar">
            <select
              value={params.get("placeId") ?? ""}
              onChange={(e) =>
                setParams(e.target.value ? { placeId: e.target.value } : {})
              }
            >
              <option value="">Selecionar estabelecimento</option>
              {places.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="subtle">
            As métricas incluem todos os seus eventos, independentemente do
            local selecionado.
          </p>
          <div className="metric-grid">
            {(["views", "boraCount", "checkinCount"] as const).map((k, i) => (
              <div className="metric" key={k}>
                {["Visualizações", "Boras", "Check-ins"][i]}
                <strong>{events.reduce((n, e) => n + e[k], 0)}</strong>
              </div>
            ))}
          </div>
          <h2>Seus eventos</h2>
          {events.map((e) => (
            <div className="management-row" key={e.id}>
              <div>
                <Link to={`/events/${e.id}`}>
                  <h3>{e.title}</h3>
                </Link>
                <p>
                  {formatDate(e.startDate)} · {e.locationName}
                </p>
              </div>
              <div className="actions">
                <Link to={`/events/${e.id}/edit`}>Editar</Link>
                <button
                  onClick={() => {
                    setSelected(e.id);
                    setTarget("");
                  }}
                >
                  Transferir
                </button>
              </div>
            </div>
          ))}
          {!events.length && !loading && <p>Você ainda não tem eventos.</p>}
          {selected && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!user) return;
                setBusy(true);
                try {
                  await transferEvent(selected, target, user);
                  setEvents(events.filter((e) => e.id !== selected));
                  setSelected("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="ID do usuário que receberá o evento">
                <Input
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </Field>
              <p>
                A transferência altera o responsável pelo evento e mantém o
                estabelecimento.
              </p>
              <Button disabled={busy}>Confirmar transferência</Button>{" "}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected("")}
              >
                Cancelar
              </Button>
            </form>
          )}
        </>
      )}
      <h2 style={{ marginTop: 32 }}>Estabelecimentos</h2>
      {places
        .filter(
          (p) =>
            !dashboard ||
            !params.get("placeId") ||
            p.id === params.get("placeId"),
        )
        .map((p) => (
          <div className="management-row" key={p.id}>
            <Link to={`/place/${p.id}`}>
              <h3>{p.name}</h3>
              <p>{p.address.displayName}</p>
            </Link>
            <div className="actions">
              <Link to={`/places/${p.id}/edit`}>Editar</Link>
              <Link to={`/places/menu?placeId=${p.id}`}>Cardápio</Link>
            </div>
          </div>
        ))}
      {!places.length && !loading && (
        <p>
          Você ainda não tem estabelecimentos.{" "}
          <Link to="/places/create">Cadastrar local</Link>
        </p>
      )}
    </>
  );
}
export function MenuEditor() {
  const { user } = useSession(),
    [params, setParams] = useSearchParams(),
    [places, setPlaces] = useState<Place[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState(""),
    [item, setItem] = useState<MenuItem>({
      id: "",
      title: "",
      description: "",
      price: 0,
      photo: "",
      category: "Geral",
    });
  const place = places.find((p) => p.id === params.get("placeId"));
  async function reload() {
    if (user) setPlaces(await owned("places", user));
  }
  useEffect(() => {
    let alive = true;
    if (user)
      owned("places", user)
        .then((p) => alive && setPlaces(p))
        .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [user?.id]);
  async function mutate(
    change: (
      items: MenuItem[],
      categories: string[],
    ) => { menuItems: MenuItem[]; menuCategories: string[] },
  ) {
    if (!user || !place) return;
    setBusy(true);
    setError("");
    try {
      await editMenu(place.id, user, change);
      await reload();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form">
      <h1>Gerenciar cardápio</h1>
      {error && <Message>{error}</Message>}
      <Field label="Estabelecimento">
        <select
          value={place?.id ?? ""}
          onChange={(e) => {
            setParams({ placeId: e.target.value });
            setItem({
              id: "",
              title: "",
              description: "",
              price: 0,
              photo: "",
              category: "Geral",
            });
          }}
        >
          <option value="">Selecione um local</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {place && (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = category.trim();
              if (!name) return;
              if (
                await mutate((items, categories) => {
                  if (
                    categories.some(
                      (c) => c.toLocaleLowerCase() === name.toLocaleLowerCase(),
                    ) ||
                    name.toLowerCase() === "geral"
                  )
                    throw Error("Esta categoria já existe.");
                  return {
                    menuItems: items,
                    menuCategories: [...categories, name],
                  };
                })
              )
                setCategory("");
            }}
          >
            <Field label="Nova categoria">
              <Input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
            <Button disabled={busy} variant="outline">
              Adicionar categoria
            </Button>
          </form>
          <h2 style={{ marginTop: 30 }}>
            {item.id ? "Editar item" : "Novo item"}
          </h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !item.title.trim() ||
                !Number.isFinite(item.price) ||
                item.price < 0
              ) {
                setError("Informe um título e preço válido.");
                return;
              }
              const saved = { ...item, id: item.id || crypto.randomUUID() };
              if (
                await mutate((items, categories) => ({
                  menuItems: [...items.filter((i) => i.id !== saved.id), saved],
                  menuCategories: categories,
                }))
              )
                setItem({
                  id: "",
                  title: "",
                  description: "",
                  price: 0,
                  photo: "",
                  category: "Geral",
                });
            }}
          >
            <Field label="Nome *">
              <Input
                required
                value={item.title}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
              />
            </Field>
            <Field label="Descrição">
              <textarea
                value={item.description}
                onChange={(e) =>
                  setItem({ ...item, description: e.target.value })
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Preço (R$) *">
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.price}
                  onChange={(e) =>
                    setItem({ ...item, price: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={item.category}
                  onChange={(e) =>
                    setItem({ ...item, category: e.target.value })
                  }
                >
                  {[
                    ...new Set([
                      "Geral",
                      ...place.menuCategories,
                      item.category,
                    ]),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="URL da foto">
              <Input
                value={item.photo}
                onChange={(e) => setItem({ ...item, photo: e.target.value })}
              />
            </Field>
            <Button disabled={busy}>Salvar item</Button>
          </form>
          <h2 style={{ marginTop: 32 }}>Itens do cardápio</h2>
          {place.menuItems.map((i) => (
            <div className="management-row" key={i.id}>
              <div>
                <h3>{i.title}</h3>
                <p>
                  {i.category} · {currency(i.price)}
                </p>
              </div>
              <div className="actions">
                <button onClick={() => setItem(i)}>Editar</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    mutate((items, categories) => ({
                      menuItems: items.filter((x) => x.id !== i.id),
                      menuCategories: categories,
                    }))
                  }
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
export function UserArea() {
  const { user } = useSession(),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setEvents([]);
    if (user)
      activity(user)
        .then((e) => alive && setEvents(e))
        .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [user?.id]);
  async function preference(action: () => Promise<unknown>) {
    assertProductWritesEnabled("Atualização de preferências do perfil");
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!user) return null;
  return (
    <>
      <div className="profile">
        {user.photoUrl && <img src={user.photoUrl} alt="Sua foto" />}
        <div>
          <span className="eyebrow">MINHA ÁREA</span>
          <h1 style={{ fontSize: 36 }}>Bora, {user.name.split(" ")[0]}.</h1>
          <p>{user.email}</p>
        </div>
      </div>
      {error && <Message>{error}</Message>}
      <h2>Preferências</h2>
      <div className="management-row">
        <div>
          <h3>Compartilhar localização</h3>
          <p>Salva sua posição nas preferências da conta.</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            preference(async () => {
              const ref = doc(database(), "users", user.id);
              if (user.locationSharingEnabled) {
                await updateDoc(ref, {
                  locationSharingEnabled: false,
                  locationUpdatedAt: serverTimestamp(),
                });
                return;
              }
              const p = await locate();
              await updateDoc(ref, {
                locationSharingEnabled: true,
                lastKnownLocation: new GeoPoint(p.latitude, p.longitude),
                locationUpdatedAt: serverTimestamp(),
              });
            })
          }
        >
          {user.locationSharingEnabled ? "Desativar" : "Ativar"}
        </Button>
      </div>
      <div className="management-row">
        <div>
          <h3>Notificações neste dispositivo</h3>
          <p>Receba novidades dos seus rolês.</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            preference(() => setNotifications(user, !user.notificationsEnabled))
          }
        >
          {user.notificationsEnabled ? "Desativar" : "Ativar"}
        </Button>
      </div>
      <h2 style={{ margin: "32px 0 20px" }}>Atividade recente</h2>
      <p>Seus Boras e check-ins, ordenados pela data dos eventos.</p>
      <div className="card-grid">
        {events.slice(0, 5).map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
      {!events.length && (
        <Message>
          Você ainda não tem atividades.{" "}
          <Link to="/">Encontre seu próximo rolê.</Link>
        </Message>
      )}
    </>
  );
}
