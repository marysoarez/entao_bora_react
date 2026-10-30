import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { PlaceMembers } from "./PlaceMembers";
import { OperationalDashboard } from "./OperationalDashboard";
import { QrManagementPanel } from "../qr/QrManagementPanel";
import { usePlaceModules } from "../place-modules/usePlaceModules";
import { PlaceModuleNavigation } from "../place-modules/PlaceModuleNavigation";
import { PlaceModuleSettings } from "../place-modules/PlaceModuleSettings";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  CheckCircle2,
  Eye,
  Flame,
  LayoutDashboard,
  RefreshCw,
  Send,
  Share2,
  Store,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { owned, transferEvent } from "../../core/repository";
import {
  searchEventTransferRecipients,
  type TransferRecipient,
} from "../../core/eventTransferService";
import { formatDate } from "../../shared/domain";
import { genres, type Event, type Place } from "../../shared/models";
import { Field } from "../../shared/ui/Field";
import { Message } from "../../shared/ui/Message";
import { useSession } from "../session";

export const eventsForPlace = (events: Event[], placeId?: string | null) =>
  events.filter((event) => {
    const eventPlaceId = event.placeId?.trim();
    return !placeId || !eventPlaceId || eventPlaceId === placeId;
  });

export function PartnerDashboardPage() {
  const { user } = useSession();
  const access = usePartnerAccess();
  const accessKey = access.places
    .map((a) => `${a.place.id}:${a.membership?.role ?? "legacy"}`)
    .sort()
    .join("|");
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipients, setRecipients] = useState<TransferRecipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] =
    useState<TransferRecipient | null>(null);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [recipientError, setRecipientError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedPlace = useMemo(() => {
    const requested = params.get("placeId");
    return (
      places.find(
        (place) => place.id === requested && access.can(place.id, "view"),
      ) ??
      places.find((place) => access.can(place.id, "view")) ??
      null
    );
  }, [params, places, access]);
  const modules = usePlaceModules(selectedPlace?.id);
  useEffect(() => {
    if (
      !loading &&
      ["#partner-overview", "#partner-events", "#partner-team"].includes(
        location.hash,
      )
    ) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }, [location.hash, location.key, loading]);
  const visibleEvents = useMemo(
    () => eventsForPlace(events, selectedPlace?.id),
    [events, selectedPlace],
  );
  const transferEventDetails = events.find((event) => event.id === selectedEvent);

  useEffect(() => {
    const term = recipientQuery.trim();
    if (!selectedEvent || selectedRecipient || term.length < 2) {
      setRecipients([]);
      setRecipientError("");
      setSearchingRecipients(false);
      return;
    }
    let active = true;
    setSearchingRecipients(true);
    const timeout = window.setTimeout(async () => {
      setRecipientError("");
      try {
        const result = await searchEventTransferRecipients(selectedEvent, term);
        if (active) setRecipients(result);
      } catch (cause) {
        if (active) {
          const error = cause as Error & { code?: string; stage?: string };
          const friendlyMessage = error.code === "functions/permission-denied"
            ? "Sua conta não tem permissão para buscar destinatários deste evento."
            : error.code === "functions/unauthenticated"
              ? "Sua sessão expirou. Entre novamente para buscar destinatários."
              : error.code === "functions/resource-exhausted"
                ? "Há muitos perfis semelhantes. Digite mais caracteres para refinar a busca."
                : error.message;
          const diagnostics = [error.code, error.stage && `etapa: ${error.stage}`]
            .filter(Boolean)
            .join(" · ");
          setRecipientError(
            `${friendlyMessage}${diagnostics ? ` (${diagnostics})` : ""}`,
          );
        }
      } finally {
        if (active) setSearchingRecipients(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [recipientQuery, selectedEvent, selectedRecipient]);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [nextPlaces, nextEvents] = await Promise.all([
        owned("places", user),
        owned("events", user),
      ]);
      setPlaces(nextPlaces);
      setEvents(nextEvents);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    if (!user) return;
    setLoading(true);
    Promise.all([owned("places", user), owned("events", user)])
      .then(([nextPlaces, nextEvents]) => {
        if (!active) return;
        setPlaces(nextPlaces);
        setEvents(nextEvents);
      })
      .catch((cause) => active && setError((cause as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user, accessKey]);

  useEffect(() => {
    if (
      places.length &&
      !places.some((place) => place.id === params.get("placeId"))
    ) {
      setParams({ placeId: places[0].id }, { replace: true });
    }
  }, [params, places, setParams]);

  async function submitTransfer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedEvent || !selectedRecipient || busy) return;
    setBusy(true);
    setError("");
    try {
      await transferEvent(selectedEvent, selectedRecipient.id, user);
      setTransferSuccess(
        `“${transferEventDetails?.title ?? "Evento"}” foi transferido para ${selectedRecipient.name}.`,
      );
      setSelectedEvent("");
      setRecipientQuery("");
      setSelectedRecipient(null);
      setRecipients([]);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || access.loading)
    return <Message>Carregando a gestão do estabelecimento…</Message>;

  if (error && !places.length && !events.length) {
    return (
      <Message>
        <h1>Não foi possível abrir o painel</h1>
        <p>{error}</p>
        <Button onClick={load}>Tentar novamente</Button>
      </Message>
    );
  }

  if (!places.length && !events.length) {
    return (
      <div className="partner-dashboard-empty">
        <Store size={38} />
        <h1>Nenhum estabelecimento cadastrado</h1>
        <p>
          Cadastre ou reivindique um local para editar informações, criar o
          cardápio e publicar eventos.
        </p>
        {access.canCreate && (
          <Link className={buttonVariants()} to="/places/create">
            Cadastrar estabelecimento
          </Link>
        )}
        {error && <Message>{error}</Message>}
      </div>
    );
  }

  const createEventPath = selectedPlace
    ? `/events/create?placeId=${encodeURIComponent(selectedPlace.id)}`
    : "/events/create";

  const metrics = [
    { label: "Eventos", value: visibleEvents.length, icon: CalendarPlus },
    {
      label: "Visualizações",
      value: visibleEvents.reduce((total, event) => total + event.views, 0),
      icon: Eye,
    },
    {
      label: "Boras",
      value: visibleEvents.reduce((total, event) => total + event.boraCount, 0),
      icon: Flame,
    },
    {
      label: "Check-ins",
      value: visibleEvents.reduce(
        (total, event) => total + event.checkinCount,
        0,
      ),
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="partner-dashboard">
      <div className="partner-dashboard-heading">
        <div>
          <span className="eyebrow">
            <LayoutDashboard size={13} /> ÁREA DO PARCEIRO
          </span>
          <h1>Gestão do estabelecimento</h1>
          <p>
            Acompanhe a operação, gerencie conteúdos e cuide do seu
            estabelecimento.
          </p>
        </div>
        <div className="partner-dashboard-heading-actions">
          {(!selectedPlace || access.can(selectedPlace.id, "manageEvents")) && (
            <Link className={buttonVariants()} to={createEventPath}>
              <CalendarPlus size={17} /> Criar evento
            </Link>
          )}
          {access.canCreate && (
            <Link
              className={buttonVariants({ variant: "outline" })}
              to="/places/create"
            >
              <Store size={17} /> Novo local
            </Link>
          )}
          <Button variant="ghost" onClick={load} aria-label="Atualizar painel">
            <RefreshCw size={17} />
          </Button>
        </div>
      </div>

      {error && <Message>{error}</Message>}

      {selectedPlace && (
        <>
          <Field label="Estabelecimento para gerenciar">
            <select
              className="partner-place-select"
              value={selectedPlace.id}
              onChange={(event) =>
                setParams({ placeId: event.target.value }, { replace: true })
              }
            >
              {places
                .filter((place) => access.can(place.id, "view"))
                .map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
            </select>
          </Field>
          <p className="subtle partner-place-address">
            {selectedPlace.address.displayName}
          </p>

          <div className="partner-overview-actions">
            {access.can(selectedPlace.id, "editPlace") && (
              <Link to={`/places/${selectedPlace.id}/edit`}>
                Editar estabelecimento
              </Link>
            )}
            <Link to={`/place/${selectedPlace.slug || selectedPlace.id}`}>
              Ver página pública
            </Link>
          </div>
        </>
      )}

      <section className="partner-results-section" id="partner-overview">
        <h2>Visão geral</h2>
        <div className="partner-metric-grid">
          {metrics.map(({ icon: Icon, label, value }) => (
            <div className="partner-metric" key={label}>
              <Icon size={23} />
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      {selectedPlace &&
        user &&
        access.can(selectedPlace.id, "view") &&
        !modules.loading &&
        !modules.error && (
          <OperationalDashboard
            key={`${selectedPlace.id}:${user.id}:${accessKey}:${modules.available("tables")}:${modules.available("serviceSessions")}:${modules.available("orders")}`}
            placeId={selectedPlace.id}
            user={user}
            enabled={{
              tables: modules.available("tables"),
              sessions: modules.available("serviceSessions"),
              orders: modules.available("orders"),
            }}
          />
        )}

      {selectedPlace && (
        <>
          {modules.error && (
            <Message>
              Não foi possível carregar a configuração de módulos. Eventos e
              Equipe continuam disponíveis.
            </Message>
          )}
          <PlaceModuleNavigation
            placeId={selectedPlace.id}
            available={modules.available}
            can={(permission) => access.can(selectedPlace.id, permission)}
          />
          <PlaceModuleSettings
            key={selectedPlace.id}
            placeId={selectedPlace.id}
            modules={modules.modules}
            entitlements={modules.entitlements}
            loading={modules.loading}
            error={modules.error}
          />
        </>
      )}

      {selectedPlace &&
        modules.available("serviceSessions") &&
        modules.available("menu") &&
        modules.available("orders") && (
          <QrManagementPanel slug={selectedPlace.slug} />
        )}

      <section className="partner-results-section" id="partner-events">
        <div className="section-title">
          <h2>Seus eventos</h2>
          <span>{visibleEvents.length} evento(s)</span>
        </div>
        <div className="partner-event-list">
          {transferSuccess && <Message>{transferSuccess}</Message>}
          {visibleEvents.map((event) => (
            <article className="partner-event-row" key={event.id}>
              <div>
                <Link to={`/events/${event.slug || event.id}`}>
                  <h3>{event.title}</h3>
                </Link>
                <p>
                  {formatDate(event.startDate)} até {formatDate(event.endDate)}{" "}
                  · {event.locationName}
                </p>
                <p>{event.description}</p>
                <p>{event.address.displayName}</p>
                <p>
                  {
                    {
                      draft: "Rascunho",
                      published: "Publicado",
                      cancelled: "Cancelado",
                      finished: "Encerrado",
                      hidden: "Oculto",
                    }[event.status]
                  }{" "}
                  ·{" "}
                  {event.ticket.type === "free"
                    ? "Gratuito"
                    : event.ticket.ticketUrl || "Ingresso externo"}
                </p>
                {event.instagram && <p>{event.instagram}</p>}
                <div className="chips">
                  {event.musicGenres.map((genre) => (
                    <span key={genre}>{genres[genre]}</span>
                  ))}
                </div>
                {!!event.attractions.length && (
                  <p>
                    Atrações:{" "}
                    {event.attractions
                      .map((attraction) => attraction.name)
                      .join(", ")}
                  </p>
                )}
                <p>{event.gallery.length} foto(s) na galeria</p>
                <div className="partner-event-metrics">
                  <span>
                    <Eye size={14} /> {event.views}
                  </span>
                  <span>
                    <Flame size={14} /> {event.boraCount}
                  </span>
                  <span>
                    <CheckCircle2 size={14} /> {event.checkinCount}
                  </span>
                  <span aria-label={`${event.shares} compartilhamentos`}>
                    <Share2 size={14} /> {event.shares}
                  </span>
                </div>
              </div>
              <div className="partner-event-actions">
                {access.canEvent(event) && (
                  <Link to={`/events/${event.id}/edit`}>Editar</Link>
                )}
                {access.canEvent(event, "transferEvents") && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferSuccess("");
                      setSelectedEvent(event.id);
                      setRecipientQuery("");
                      setSelectedRecipient(null);
                      setRecipients([]);
                    }}
                  >
                    <Send size={15} /> Transferir
                  </button>
                )}
              </div>
              {selectedEvent === event.id && access.canEvent(event, "transferEvents") && (
                <form className="partner-transfer" onSubmit={submitTransfer}>
                  <div className="partner-transfer-heading">
                    <div>
                      <span className="eyebrow">REVISÃO DA TRANSFERÊNCIA</span>
                      <h3>Confirme o evento e o novo responsável</h3>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setSelectedEvent("")}
                    >
                      Cancelar
                    </Button>
                  </div>
                  <div className="partner-transfer-review">
                    <div>
                      <span>EVENTO</span>
                      <strong>{event.title}</strong>
                      <small>{formatDate(event.startDate)} · {event.locationName}</small>
                    </div>
                    <div aria-hidden="true" className="partner-transfer-arrow">→</div>
                    <div>
                      <span>NOVO RESPONSÁVEL</span>
                      {selectedRecipient ? (
                        <>
                          <strong>{selectedRecipient.name}</strong>
                          <small>{selectedRecipient.email || "E-mail não informado"}</small>
                        </>
                      ) : (
                        <strong className="subtle">Selecione uma pessoa abaixo</strong>
                      )}
                    </div>
                  </div>
                  {!selectedRecipient ? (
                    <Field label="Buscar destinatário por nome ou e-mail">
                      <Input
                        autoComplete="off"
                        value={recipientQuery}
                        onChange={(inputEvent) => {
                          setRecipientQuery(inputEvent.target.value);
                          setRecipients([]);
                        }}
                        placeholder="Digite ao menos 2 caracteres"
                      />
                      <small>Pesquise por qualquer trecho com pelo menos 2 caracteres do nome ou do e-mail.</small>
                      {searchingRecipients && <small role="status" aria-live="polite">Buscando pessoas…</small>}
                      {recipientError && <small role="alert">{recipientError}</small>}
                      {!!recipients.length && (
                        <div className="partner-transfer-results" aria-label="Resultados da busca">
                          {recipients.map((recipient) => (
                            <button
                              type="button"
                              key={recipient.id}
                              onClick={() => setSelectedRecipient(recipient)}
                            >
                              <strong>{recipient.name || "Nome não informado"}</strong>
                              <span>{recipient.email || "E-mail não informado"}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!searchingRecipients && recipientQuery.trim().length >= 2 && !recipients.length && !recipientError && (
                        <small role="status" aria-live="polite">Nenhuma pessoa encontrada. Confira a grafia ou tente outro trecho do nome ou e-mail.</small>
                      )}
                    </Field>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedRecipient(null)}
                    >
                      Escolher outra pessoa
                    </Button>
                  )}
                  <p>A transferência altera o responsável e mantém o vínculo com o estabelecimento.</p>
                  <div className="form-actions">
                    <Button type="submit" disabled={busy || !selectedRecipient}>
                      {busy ? "Transferindo…" : "Confirmar transferência"}
                    </Button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
        {!visibleEvents.length && (
          <Message>
            Nenhum evento disponível para esta seleção.{" "}
            {(!selectedPlace ||
              access.can(selectedPlace.id, "manageEvents")) && (
              <Link to={createEventPath}>Criar evento</Link>
            )}
          </Message>
        )}
      </section>

      {selectedPlace && (
        <div id="partner-team">
          <PlaceMembers key={selectedPlace.id} placeId={selectedPlace.id} />
        </div>
      )}
    </div>
  );
}
