import { PublicMenu } from "../menu-management/PublicMenu";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { canEditEvent } from "../../shared/eventPermissions";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, CalendarDays, Share2, Heart, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resolvePublicEntity,
  watchInteractions,
  toggleBora,
  checkIn,
  count,
  watchPublic,
} from "../../core/repository";
import { configured } from "../../core/firebase";
import { formatDate, imageSource, locate, safeUrl } from "../../shared/domain";
import { genres, type Event, type Place } from "../../shared/models";
import { useSession } from "../session";
import { setPageMetadata } from "../../shared/metadata";
import { EventCard } from "../events/components/EventCard";
import { Message } from "../../shared/ui/Message";
import { googleCalendarUrl } from "./googleCalendar";
export function EntityDetails({ kind }: { kind: "events" | "places" }) {
  const access = usePartnerAccess();
  const { id = "" } = useParams(),
    { user, login } = useSession();
  const [entity, setEntity] = useState<Event | Place | null>(null),
    [place, setPlace] = useState<Place | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [bora, setBora] = useState(false),
    [checked, setChecked] = useState(false),
    [calendarConfirmation, setCalendarConfirmation] = useState(false),
    [calendarFallbackUrl, setCalendarFallbackUrl] = useState("");
  const viewed = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEntity(null);
    setError("");
    if (!configured) {
      setError("Os detalhes estarão disponíveis após conectar a agenda.");
      setLoading(false);
      return;
    }
    const request =
      kind === "events"
        ? resolvePublicEntity("events", id)
        : resolvePublicEntity("places", id);
    request
      .then(async (e) => {
        if (!alive) return;
        setEntity(e);
        if (e && kind === "events") {
          const ev = e as Event;
          if (!viewed.current.has(e.id)) {
            viewed.current.add(e.id);
            count(e.id, "views").catch(() => {});
          }
          if (ev.placeId) {
            const p = await resolvePublicEntity("places", ev.placeId);
            if (alive) setPlace(p);
          }
        }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      setPlace(null);
    };
  }, [id, kind]);
  useEffect(() => {
    setBora(false);
    setChecked(false);
    if (kind !== "events" || !entity || !user) return;
    return watchInteractions(
      entity.id,
      user,
      (k, v) => (k === "bora" ? setBora(v) : setChecked(v)),
      (e) => setError(e.message),
    );
  }, [entity?.id, user?.id, kind]);
  useEffect(() => {
    if (kind !== "places" || !entity) return;
    return watchPublic(
      () => {},
      (e) => setEvents(e.filter((x) => x.placeId === entity.id)),
      (e) => setError(e.message),
    );
  }, [kind, entity?.id]);
  useEffect(() => {
    if (!entity) return;
    const title =
      kind === "events" ? (entity as Event).title : (entity as Place).name;
    const image =
      kind === "events"
        ? (entity as Event).coverImage
        : (entity as Place).photos[0];
    setPageMetadata(
      `${title} ? Ent?o Bora`,
      entity.description,
      safeUrl(image),
    );
    return () =>
      setPageMetadata(
        "Ent?o Bora ? encontre seu pr?ximo rol?",
        "Seu pr?ximo rol? come?a aqui.",
        "https://entao-bora-react.vocal-book-0819.chatgpt.site/og.png",
      );
  }, [entity, kind]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Message>Carregando detalhes…</Message>;
  if (!entity)
    return (
      <Message>
        {error || "Não encontramos este registro."}{" "}
        <Link to="/">Explorar outros rolês</Link>
      </Message>
    );
  const event = kind === "events" ? (entity as Event) : null,
    p = kind === "places" ? (entity as Place) : place,
    title = event ? event.title : (entity as Place).name,
    cover = event ? event.coverImage : (entity as Place).photos[0];
  const eventId = entity.id;
  function handleBoraClick() {
    if (!user) {
      void action(async () => {
        await login();
        setCalendarConfirmation(true);
      });
      return;
    }
    if (!bora) {
      setCalendarConfirmation(true);
      return;
    }
    void action(async () => {
      setBora(await toggleBora(eventId, user));
    });
  }
  function handleCalendarChoice(addToCalendar: boolean) {
    if (!user || !event) {
      setCalendarConfirmation(false);
      setError("Sua sessão expirou. Entre novamente para marcar o Bora.");
      return;
    }
    const calendarTab = addToCalendar
      ? window.open("about:blank", "_blank")
      : null;
    if (calendarTab) calendarTab.opener = null;
    setCalendarConfirmation(false);
    setCalendarFallbackUrl("");
    void action(async () => {
      try {
        const nextBora = await toggleBora(eventId, user);
        setBora(nextBora);
        if (nextBora && addToCalendar) {
          const url = googleCalendarUrl(event);
          if (calendarTab && !calendarTab.closed) {
            calendarTab.location.href = url;
          } else {
            setCalendarFallbackUrl(url);
          }
        } else {
          calendarTab?.close();
        }
      } catch (e) {
        calendarTab?.close();
        throw e;
      }
    });
  }
  return (
    <>
      <Link to="/" className="subtle">
        ← Voltar para explorar
      </Link>
      {cover && (
        <img className="detail-cover" src={imageSource(cover)} alt={title} />
      )}
      <div className="detail-columns">
        <article>
          <div className="chips">
            {entity.musicGenres.map((g) => (
              <span key={g}>{genres[g]}</span>
            ))}
          </div>
          <h1>{title}</h1>
          {event && (
            <p>
              <CalendarDays size={16} /> {formatDate(event.startDate)} —{" "}
              {formatDate(event.endDate)}
            </p>
          )}
          <p>
            <MapPin size={16} /> {entity.address.displayName}
          </p>
          {event && place && (
            <Link to={`/place/${place.slug || place.id}`}>{place.name} ↗</Link>
          )}
          <h2 style={{ marginTop: 32 }}>
            Sobre {event ? "o evento" : "o lugar"}
          </h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{entity.description}</p>
          {event?.attractions.length ? (
            <>
              <h2>Atrações</h2>
              {event.attractions.map((a) => (
                <p key={a.id}>
                  {a.name}
                  {a.isHeadliner ? " · Atração principal" : ""}
                </p>
              ))}
            </>
          ) : null}
          <div className="gallery">
            {(event ? event.gallery : (entity as Place).photos.slice(1)).map(
              (s, i) => (
                <img
                  key={i}
                  src={imageSource(s)}
                  alt={`Foto ${i + 1} de ${title}`}
                  loading="lazy"
                />
              ),
            )}
          </div>
          {p && (
            <>
              <details>
                <summary>Cardápio · {p.name}</summary>
                <PublicMenu key={p.id} place={p} />
              </details>
              {p.openingHours.length > 0 && (
                <details>
                  <summary>Horários de funcionamento</summary>
                  {p.openingHours.map((h) => (
                    <p key={h.weekday}>
                      {
                        (
                          {
                            monday: "Segunda",
                            tuesday: "Terça",
                            wednesday: "Quarta",
                            thursday: "Quinta",
                            friday: "Sexta",
                            saturday: "Sábado",
                            sunday: "Domingo",
                          } as Record<string, string>
                        )[h.weekday]
                      }
                      : {String(h.opensAt.hour).padStart(2, "0")}:
                      {String(h.opensAt.minute).padStart(2, "0")} às{" "}
                      {String(h.closesAt.hour).padStart(2, "0")}:
                      {String(h.closesAt.minute).padStart(2, "0")}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {!event && (
            <>
              <h2>Próximos eventos</h2>
              <div className="card-grid">
                {events.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
              {!events.length && <p>Nenhum evento anunciado no momento.</p>}
            </>
          )}
        </article>
        <aside>
          {event ? (
            <>
              <span className="eyebrow">ENCONTRE A GALERA</span>
              <h2>
                {event.ticket.type === "free"
                  ? "Entrada gratuita"
                  : "Garanta seu ingresso"}
              </h2>
              {safeUrl(event.ticket.ticketUrl) && (
                <a
                  href={safeUrl(event.ticket.ticketUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Comprar ingresso ↗
                </a>
              )}
              <Button disabled={busy} onClick={handleBoraClick}>
                <Heart size={17} />
                {bora ? "Você vai! Desmarcar" : "Eu vou! Então Bora!"}
              </Button>
              {calendarConfirmation && (
                <div className="calendar-confirmation-backdrop">
                  <section
                    className="calendar-confirmation"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="calendar-confirmation-title"
                    aria-describedby="calendar-confirmation-description"
                  >
                    <h2 id="calendar-confirmation-title">
                      Adicionar ao calendário?
                    </h2>
                    <p id="calendar-confirmation-description">
                      Deseja adicionar esse evento ao seu calendário?
                    </p>
                    <div className="calendar-confirmation-actions">
                      <Button
                        variant="outline"
                        onClick={() => handleCalendarChoice(false)}
                      >
                        Marcar Bora sem adicionar
                      </Button>
                      <Button onClick={() => handleCalendarChoice(true)}>
                        Adicionar ao Google Agenda
                      </Button>
                    </div>
                  </section>
                </div>
              )}
              {calendarFallbackUrl && (
                <a href={calendarFallbackUrl} target="_blank" rel="noreferrer">
                  Abrir evento no Google Agenda ↗
                </a>
              )}
              <Button
                variant="outline"
                disabled={busy || checked}
                onClick={() =>
                  action(async () => {
                    if (!user) {
                      await login();
                      return;
                    }
                    const pos = await locate();
                    await checkIn(entity.id, user, {
                      latitude: pos.latitude,
                      longitude: pos.longitude,
                    });
                    setChecked(true);
                  })
                }
              >
                <Check size={17} />
                {checked ? "Check-in realizado" : "Fazer check-in"}
              </Button>
              <small className="subtle">
                Durante o evento, a até 100 metros do endereço.
              </small>
            </>
          ) : (
            <>
              <h2>Planeje sua visita</h2>
              {p?.phone && <p>{p.phone}</p>}
              {safeUrl(p?.website) && (
                <a href={safeUrl(p?.website)} target="_blank" rel="noreferrer">
                  Visitar site ↗
                </a>
              )}
            </>
          )}
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${entity.address.latitude},${entity.address.longitude}`}
          >
            Como chegar ↗
          </a>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              action(async () => {
                const url = `https://entaobora.com.br/${event ? "events" : "place"}/${entity.slug || entity.id}`;
                if (navigator.share) await navigator.share({ title, url });
                else {
                  await navigator.clipboard.writeText(url);
                  setError("Link copiado!");
                }
                if (event) await count(event.id, "shares");
              })
            }
          >
            <Share2 size={16} />
            Compartilhar
          </Button>
          {(event
            ? canEditEvent(user, event)
            : access.can(entity.id, "editPlace")) && (
            <Link to={`/${event ? "events" : "places"}/${entity.id}/edit`}>
              Editar informações
            </Link>
          )}
          {error && <Message>{error}</Message>}
        </aside>
      </div>
    </>
  );
}
