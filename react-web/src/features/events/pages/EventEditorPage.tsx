import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listPlaces,
  resolvePublicEntity,
  saveEntity,
  setFeaturedEvent,
} from "../../../core/repository";
import { imageSource, parseEvent, validateEvent } from "../../../shared/domain";
import {
  genres,
  type Event,
  type Place,
  type Genre,
} from "../../../shared/models";
import { Field } from "../../../shared/ui/Field";
import { Message } from "../../../shared/ui/Message";
import { useSession } from "../../session";
import { AddressSearch } from "../../AddressSearch";
import { ImageUpload } from "../../ImageUpload";
import { refineEventAddress } from "../eventAddress";
import { isPlatformAdmin } from "../../../shared/partnerPermissions";
import { canEditEvent } from "../../../shared/eventPermissions";

const emptyAddress = () => ({ displayName: "", latitude: NaN, longitude: NaN });
const emptyEvent = () =>
  parseEvent("", {
    address: emptyAddress(),
    startDate: new Date(NaN),
    endDate: new Date(NaN),
  });
const dateInput = (d: Date) =>
  Number.isFinite(+d)
    ? new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";

export function EventEditorPage() {
  const { id } = useParams(),
    { user } = useSession();
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate();
  const requestedPlace = params.get("placeId") || location.state?.place?.id;
  const origin = location.state?.from;
  const returnTo =
    typeof origin === "string" &&
    origin.startsWith("/") &&
    !origin.startsWith("//")
      ? origin
      : "/";
  const [value, setValue] = useState<Event>(emptyEvent);
  const [places, setPlaces] = useState<Place[]>([]);
  const [featureOnly, setFeatureOnly] = useState(false);
  const contextKey = JSON.stringify([user?.id, id, requestedPlace]);
  const [loadedContext, setLoadedContext] = useState("");
  const [mode, setMode] = useState<"registered" | "custom">("custom");
  const [selected, setSelected] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false),
    [error, setError] = useState("");
  const [placesError, setPlacesError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setPlacesError("");
    setValue(emptyEvent());
    setFeatureOnly(false);
    setPlaces([]);
    setMode("custom");
    setSelected(false);
    if (!user) {
      setLoading(false);
      return;
    }
    const currentUser = user;
    async function initialize() {
      try {
        const [loaded, event] = await Promise.all([
          listPlaces().catch(() => {
            if (alive)
              setPlacesError(
                "Não foi possível carregar os estabelecimentos. Use outro endereço ou reabra o formulário.",
              );
            return [] as Place[];
          }),
          id ? resolvePublicEntity("events", id) : Promise.resolve(null),
        ]);
        if (!alive) return;
        if (id && !event) throw Error("Evento não encontrado.");
        if (event && !canEditEvent(currentUser, event)) {
          if (!isPlatformAdmin(currentUser))
            throw Error("Sem permissão para editar.");
          setFeatureOnly(true);
        } else {
          setFeatureOnly(false);
        }
        if (!alive) return;
        if (
          !event &&
          requestedPlace &&
          !loaded.some((p) => p.id === requestedPlace)
        )
          throw Error("Estabelecimento não encontrado.");
        setPlaces(loaded);
        const next = event || emptyEvent();
        const place = event?.placeId
          ? loaded.find((p) => p.id === event.placeId)
          : !event
            ? loaded.find((p) => p.id === requestedPlace) || loaded[0]
            : undefined;
        // Preserve the association if the linked place is no longer available.
        if (place && !event) {
          setValue({
            ...next,
            placeId: place.id,
            locationName: place.name,
            address: { ...place.address },
          });
          setMode("registered");
          setSelected(true);
        } else {
          setValue(next);
          setMode(next.placeId ? "registered" : "custom");
          setSelected(!!event);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) {
          setLoadedContext(contextKey);
          setLoading(false);
        }
      }
    }
    void initialize();
    return () => {
      alive = false;
    };
  }, [id, user, requestedPlace, contextKey]);

  const patch = (data: Partial<Event>) => setValue((v) => ({ ...v, ...data }));
  function switchMode(next: "registered" | "custom") {
    setMode(next);
    const place = next === "registered" ? places[0] : undefined;
    patch({
      placeId: place?.id ?? null,
      locationName: place?.name ?? "",
      address: place ? { ...place.address } : emptyAddress(),
    });
    setSelected(!!place);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || coverBusy) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!user) throw Error("Faça login para criar um evento.");
      if (loading || loadedContext !== contextKey)
        throw Error("Aguarde o carregamento do evento.");
      if (featureOnly) {
        if (!id || !isPlatformAdmin(user))
          throw Error("Sem permissão para alterar o destaque.");
        await setFeaturedEvent(value.id, value.featured, user);
        await navigate(returnTo, {
          state: {
            eventSuccess: value.featured
              ? "Evento destacado na home."
              : "Destaque removido.",
          },
        });
        return;
      }
      if (id && !canEditEvent(user, value))
        throw Error("Sem permissão para editar.");
      const next = {
        ...value,
        address: selected ? value.address : emptyAddress(),
      };
      validateEvent(next);
      if (mode === "custom") {
        next.placeId = null;
        next.address = await refineEventAddress(next.address);
        next.locationName = next.address.displayName;
      }
      const savedId = await saveEntity("events", next, user);
      if (isPlatformAdmin(user) && next.featured)
        await setFeaturedEvent(savedId, next.featured, user);
      await navigate(returnTo, {
        state: {
          eventSuccess: id
            ? "Evento atualizado com sucesso!"
            : "Evento criado com sucesso!",
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!user)
    return <Message>Faça login para criar ou editar um evento.</Message>;
  if (loading || loadedContext !== contextKey)
    return (
      <div
        className="form event-form-skeleton"
        role="status"
        aria-label="Carregando formulário"
      >
        <h1>Preparando seu evento</h1>
        <i />
        <i />
        <i />
        <i />
      </div>
    );
  if (id && !value.id)
    return <Message>{error || "Evento indisponível."}</Message>;
  if (featureOnly)
    return (
      <form className="form" onSubmit={submit}>
        <Link to={returnTo} className="subtle">
          ← Voltar
        </Link>
        <h1>Gerenciar destaque</h1>
        <p>O conteúdo e a autoria do evento não podem ser alterados aqui.</p>
        <label className="event-feature-toggle">
          <input
            type="checkbox"
            checked={value.featured}
            onChange={(e) => patch({ featured: e.target.checked })}
          />
          <span>
            <strong>Evento de destaque na home</strong>
            <small>Este evento será o único destaque ativo.</small>
          </span>
        </label>
        {error && <Message>{error}</Message>}
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando destaque…" : "SALVAR DESTAQUE"}
        </Button>
      </form>
    );
  return (
    <form className="form" onSubmit={submit} noValidate>
      <Link to={returnTo} className="subtle">
        ← Voltar
      </Link>
      <h1>{id ? "Editar evento" : "Criar evento"}</h1>
      <p>Compartilhe as informações para a galera encontrar você.</p>
      {error && (
        <div role="alert">
          <Message>{error}</Message>
        </div>
      )}
      <fieldset disabled={busy} className="event-form-fields">
        <Field label="Nome do evento *">
          <Input
            required
            value={value.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
        <Field label="Descrição *">
          <textarea
            required
            rows={4}
            value={value.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
        <Field label="Instagram">
          <Input
            placeholder="@usuario"
            value={value.instagram ?? ""}
            onChange={(e) => patch({ instagram: e.target.value })}
          />
        </Field>
        <ImageUpload
          label="Imagem de capa *"
          rawBase64
          maxLength={1048487}
          onBusyChange={setCoverBusy}
          onImage={(coverImage) => patch({ coverImage })}
        />
        {value.coverImage && (
          <div>
            <img
              className="event-cover-preview"
              src={imageSource(value.coverImage)}
              alt="Prévia da capa do evento"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={coverBusy}
              onClick={() => patch({ coverImage: "" })}
            >
              Remover capa
            </Button>
          </div>
        )}
        {placesError && <Message>{placesError}</Message>}
        {places.length > 0 || value.placeId ? (
          <fieldset className="field">
            <legend>Tipo de local</legend>
            <div className="chips">
              <label>
                <input
                  type="radio"
                  name="event-location"
                  checked={mode === "registered"}
                  onChange={() => switchMode("registered")}
                />{" "}
                Estabelecimentos cadastrados
              </label>
              <label>
                <input
                  type="radio"
                  name="event-location"
                  checked={mode === "custom"}
                  onChange={() => switchMode("custom")}
                />{" "}
                Outro endereço
              </label>
            </div>
          </fieldset>
        ) : (
          !placesError && (
            <p>
              Nenhum estabelecimento disponível. Selecione outro endereço
              abaixo.
            </p>
          )
        )}
        {mode === "registered" ? (
          <>
            <Field label="Estabelecimento *">
              <select
                value={value.placeId ?? ""}
                onChange={(e) => {
                  const p = places.find((p) => p.id === e.target.value);
                  patch({
                    placeId: p?.id ?? null,
                    locationName: p?.name ?? "",
                    address: p ? { ...p.address } : emptyAddress(),
                  });
                  setSelected(!!p);
                }}
              >
                {!places.some((p) => p.id === value.placeId) && (
                  <option value={value.placeId ?? ""}>
                    {value.locationName || "Selecione um local"}
                  </option>
                )}
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="subtle">{value.address.displayName}</p>
          </>
        ) : (
          <>
            <AddressSearch
              value={value.address}
              onSelectionChange={setSelected}
              onChange={(address) =>
                patch({
                  address,
                  placeId: null,
                  locationName: address.displayName,
                })
              }
            />
            {selected && (
              <div className="form-grid">
                {(["number", "complement"] as const).map((key) => (
                  <Field
                    key={key}
                    label={key === "number" ? "Número" : "Complemento"}
                  >
                    <Input
                      value={value.address[key] ?? ""}
                      onChange={(e) =>
                        patch({
                          address: {
                            ...value.address,
                            [key]: e.target.value.trim(),
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
          </>
        )}
        <div className="form-grid">
          <Field label="Início *">
            <Input
              type="datetime-local"
              required
              min={
                id ? undefined : `${dateInput(new Date()).slice(0, 10)}T00:00`
              }
              max="2100-01-01T23:59"
              value={dateInput(value.startDate)}
              onChange={(e) => patch({ startDate: new Date(e.target.value) })}
            />
          </Field>
          <Field label="Término *">
            <Input
              type="datetime-local"
              required
              min={
                dateInput(value.startDate) ||
                `${dateInput(new Date()).slice(0, 10)}T00:00`
              }
              max="2100-01-01T23:59"
              value={dateInput(value.endDate)}
              onChange={(e) => patch({ endDate: new Date(e.target.value) })}
            />
          </Field>
        </div>
        <fieldset className="field">
          <legend>Gêneros musicais</legend>
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
        <Field label="Ingresso">
          <select
            value={value.ticket.type}
            onChange={(e) =>
              patch({
                ticket: {
                  type: e.target.value as "free" | "external",
                  ticketUrl: null,
                },
              })
            }
          >
            <option value="free">Gratuito</option>
            <option value="external">Venda externa</option>
          </select>
        </Field>
        {value.ticket.type === "external" && (
          <Field label="Link para compra *">
            <Input
              type="url"
              required
              placeholder="https://…"
              value={value.ticket.ticketUrl ?? ""}
              onChange={(e) =>
                patch({
                  ticket: { ...value.ticket, ticketUrl: e.target.value },
                })
              }
            />
          </Field>
        )}
        {isPlatformAdmin(user) && (
          <label className="event-feature-toggle">
            <input
              type="checkbox"
              checked={value.featured}
              onChange={(e) => patch({ featured: e.target.checked })}
            />
            <span>
              <strong>Evento de destaque na home</strong>
              <small>Este evento será o único destaque ativo.</small>
            </span>
          </label>
        )}
        <Button type="submit" disabled={busy || coverBusy}>
          {coverBusy
            ? "Processando capa…"
            : busy
              ? "Salvando evento…"
              : id
                ? "SALVAR ALTERAÇÕES"
                : "PUBLICAR EVENTO"}
        </Button>
      </fieldset>
    </form>
  );
}
