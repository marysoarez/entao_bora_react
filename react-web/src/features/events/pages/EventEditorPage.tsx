import { PartnerAccessService } from "../../../core/partnerAccessService";
import { usePartnerAccess } from "../../partner-access/PartnerAccess";
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
  owned,
  resolvePublicEntity,
  saveEntity,
} from "../../../core/repository";
import {
  imageSource,
  parseEvent,
  validateEvent,
} from "../../../shared/domain";
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
  const access = usePartnerAccess();
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
    if (!user) {
      setLoading(false);
      return;
    }
    const currentUser = user;
    async function initialize() {
      try {
        const [loaded, event] = await Promise.all([
          owned("places", currentUser).catch(() => {
            if (alive)
              setPlacesError(
                "Não foi possível carregar seus locais. Use outro endereço ou reabra o formulário.",
              );
            return [] as Place[];
          }),
          id ? resolvePublicEntity("events", id) : Promise.resolve(null),
        ]);
        if (!alive) return;
        if (id && !event) throw Error("Evento não encontrado.");
        if (event && !await PartnerAccessService.canEvent(currentUser, event))
          throw Error("Sem permissão para editar.");
        const allowedPlaces = (await Promise.all(loaded.map(async p => await PartnerAccessService.canPlace(currentUser, p, "manageEvents") ? p : null))).filter((p): p is Place => !!p);
        if (!alive) return;
        if (!event && requestedPlace && !allowedPlaces.some(p => p.id === requestedPlace)) throw Error("Sem permissão para criar eventos neste estabelecimento.");
        setPlaces(allowedPlaces);
        const next = event || emptyEvent();
        const place = event?.placeId
          ? allowedPlaces.find((p) => p.id === event.placeId)
          : !event
            ? allowedPlaces.find((p) => p.id === requestedPlace) || allowedPlaces[0]
            : undefined;
        // Preserve an existing association if its place is no longer accessible.
        if (place) {
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
        if (alive) setLoading(false);
      }
    }
    void initialize();
    return () => {
      alive = false;
    };
  }, [id, user?.id, user?.partnerId, requestedPlace]);

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
      await saveEntity("events", next, user);
      navigate(returnTo, {
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

  if (loading)
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
  if (id && value.id && !access.loading && !access.canEvent(value)) return <Message>Sem permissão para editar este evento.</Message>;
  if (!id && requestedPlace && !access.loading && !access.can(requestedPlace, "manageEvents")) return <Message>Sem permissão para criar eventos neste estabelecimento.</Message>;
  if (id && !value.id)
    return <Message>{error || "Evento indisponível."}</Message>;
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
                Meus Locais
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
              Você ainda não tem locais cadastrados. Selecione outro endereço
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
