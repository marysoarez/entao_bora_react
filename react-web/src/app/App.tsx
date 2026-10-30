import {
  PartnerAccessProvider,
  usePartnerAccess,
} from "../features/partner-access/PartnerAccess";
import { TablesManagementPage } from "../features/tables/pages/TablesManagementPage";
import { ServiceSessionsPage } from "../features/service-sessions/pages/ServiceSessionsPage";
import { OrdersPage } from "../features/orders/pages/OrdersPage";
import { InventoryPage } from "../features/inventory/InventoryPage";
import { PurchasesPage } from "../features/purchases/PurchasesPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { QrCheckInPage } from "../features/qr/pages/QrCheckInPage";
import { useEffect, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Compass,
  List,
  MapPin,
  Music2,
  Search,
  UserRound,
  LogOut,
  SlidersHorizontal,
  Ghost,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SessionProvider, useSession } from "../features/session";
import { configured } from "../core/firebase";
import { logPageView } from "../core/analytics";
import { watchPublic } from "../core/repository";
import { imageSource, locate } from "../shared/domain";
import { genres, type Event, type Place } from "../shared/models";
import { MapView } from "../features/MapView";
import { registerSearchTool } from "../shared/webmcp";
import {
  EventCard,
  EventDetailsPage,
  EventEditorPage,
} from "../features/events";
import {
  MenuManagementPage,
  PlaceCard,
  PlaceDetailsPage,
  PlaceEditorPage,
  PlacesManagementPage,
} from "../features/places";
import { PartnerDashboardPage } from "../features/partner-dashboard/PartnerDashboardPage";
import { UserArea } from "../features/user-area/UserArea";
import { Message } from "../shared/ui/Message";
import { PrivacyPolicyPage } from "../features/privacy/PrivacyPolicyPage";
import { SpotifyMiniPlayer } from "../features/music/SpotifyMiniPlayer";
import { AdminPage } from "../features/admin/AdminPage";
import { isPlatformAdmin } from "../shared/partnerPermissions";
function Home() {
  const [places, setPlaces] = useState<Place[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(configured),
    [search, setSearch] = useState(""),
    [genre, setGenre] = useState(""),
    [tab, setTab] = useState("events"),
    [view, setView] = useState("map"),
    [free, setFree] = useState(false),
    [position, setPosition] = useState<{
      latitude: number;
      longitude: number;
    } | null>(null);
  useEffect(
    () =>
      registerSearchTool((value) => {
        setSearch(value);
        setTab("events");
      }),
    [],
  );
  useEffect(() => {
    if (!configured) return;
    let count = 0;
    return watchPublic(
      (p) => {
        setPlaces(p);
        if (++count >= 2) setLoading(false);
      },
      (e) => {
        setEvents(e);
        if (++count >= 2) setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);
  const filteredEvents = events.filter(
    (e) =>
      +e.endDate >= Date.now() &&
      (!genre || e.musicGenres.includes(genre as keyof typeof genres)) &&
      (!free || e.ticket.type === "free") &&
      `${e.title} ${e.locationName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const featuredEvent = events.find((event) => event.featured);
  const filteredPlaces = places.filter(
    (p) =>
      (!genre || p.musicGenres.includes(genre as keyof typeof genres)) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="halloween-doodles" aria-hidden="true">
            <Ghost />
            <Sparkles />
          </div>
          <h1>
            Seu próximo rolê
            <br />
            começa <em>aqui.</em>
          </h1>
          <p>Música boa, lugares incríveis e gente na mesma vibe.</p>
        </div>
        <div className="city">
          <MapPin size={18} />
          <div>
            Explorando<strong>Rio de Janeiro, RJ</strong>
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const p = await locate();
                setPosition({ latitude: p.latitude, longitude: p.longitude });
                setView("map");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Usar localização
          </Button>
        </div>
      </div>
      <div className="explore-bar" aria-label="Buscar e filtrar rolês">
        <div className="search">
          <Search size={19} />
          <Input
            aria-label="Buscar eventos ou locais"
            placeholder="Qual é a boa? Busque evento, bar ou casa de show"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="select-wrap">
          <SlidersHorizontal size={17} />
          <select
            aria-label="Gênero musical"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          >
            <option value="">Todos os estilos</option>
            {Object.entries(genres).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-row">
        <div className="tabs">
          <button
            className={tab === "events" ? "selected" : ""}
            aria-pressed={tab === "events"}
            onClick={() => setTab("events")}
          >
            <CalendarDays size={17} />
            Eventos
          </button>
          <button
            className={tab === "places" ? "selected" : ""}
            aria-pressed={tab === "places"}
            onClick={() => setTab("places")}
          >
            <MapPin size={17} />
            Estabelecimentos
          </button>
        </div>
        <div className="actions">
          <label>
            <input
              type="checkbox"
              checked={free}
              onChange={(e) => setFree(e.target.checked)}
            />{" "}
            Gratuitos
          </label>
          <button
            aria-pressed={view === "map"}
            className={view === "map" ? "selected" : ""}
            onClick={() => setView(view === "map" ? "list" : "map")}
          >
            {view === "map" ? <List size={17} /> : <Compass size={17} />}
            {view === "map" ? "Ver lista" : "Explorar mapa"}
          </button>
        </div>
      </div>
      {featuredEvent && (
        <section
          className="featured-event-section"
          aria-labelledby="featured-event-title"
        >
          <div className="featured-event-heading">
            <span>
              <Star size={15} fill="currentColor" /> EM DESTAQUE
            </span>
            <span>Uma dica para seu próximo rolê</span>
          </div>
          <Link
            className="featured-event"
            to={`/events/${featuredEvent.slug || featuredEvent.id}`}
          >
            <img
              src={
                featuredEvent.coverImage
                  ? imageSource(featuredEvent.coverImage)
                  : "/brand.jpg"
              }
              alt=""
            />
            <div>
              <small>
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "short",
                }).format(featuredEvent.startDate)}
              </small>
              <h2 id="featured-event-title">{featuredEvent.title}</h2>
              <p>
                <MapPin size={15} /> {featuredEvent.locationName}
              </p>
              <strong>
                Ver evento <ArrowUpRight size={17} />
              </strong>
            </div>
          </Link>
        </section>
      )}
      <section>
        <div className="section-title">
          <h2>
            {view === "map"
              ? tab === "events"
                ? "Eventos no mapa"
                : "Estabelecimentos no mapa"
              : tab === "events"
                ? "O que vai rolar"
                : "Lugares para conhecer"}
          </h2>
          <span>
            {tab === "events" ? filteredEvents.length : filteredPlaces.length}{" "}
            {tab === "events" ? "eventos" : "lugares"}
          </span>
        </div>
        {error && (
          <Message>
            {error}{" "}
            <button onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          </Message>
        )}
        {loading ? (
          <Message>Carregando o próximo rolê…</Message>
        ) : !configured ? (
          <div className="welcome-panel">
            <img src="/brand.jpg" alt="Então Bora" />
            <div>
              <span className="eyebrow">O ROLÊ TEM PONTO DE ENCONTRO</span>
              <h2>
                Onde a música
                <br />
                encontra você.
              </h2>
              <p>
                A agenda está aguardando conexão. Em breve, explore eventos,
                descubra lugares e marque seu Bora.
              </p>
              <span className="subtle">
                Nenhum evento carregado neste ambiente.
              </span>
            </div>
          </div>
        ) : view === "map" ? (
          <MapView
            places={tab === "places" ? filteredPlaces : []}
            events={tab === "events" ? filteredEvents : []}
            position={position}
          />
        ) : tab === "events" ? (
          filteredEvents.length ? (
            <div className="card-grid">
              {filteredEvents.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <Message>
              Nenhum evento com esses filtros. Experimente outro estilo.
            </Message>
          )
        ) : filteredPlaces.length ? (
          <div className="places-grid">
            {filteredPlaces.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        ) : (
          <Message>Nenhum estabelecimento encontrado.</Message>
        )}
      </section>
      <SpotifyMiniPlayer
        playlistId="37i9dQZF1EIeujtfBpf3lR"
        title="Dá o play e bora"
      />
      <div className="partner-callout">
        <div>
          <Music2 size={25} />
          <h3>O seu palco também é aqui.</h3>
          <p>Leve seu evento a quem curte a mesma vibe.</p>
        </div>
        <Link to="/events/create">
          Divulgar um evento <ArrowUpRight size={18} />
        </Link>
      </div>
    </>
  );
}
function Guard({
  partner = false,
  admin = false,
  children,
}: {
  partner?: boolean;
  admin?: boolean;
  children: ReactNode;
}) {
  const { user, loading, login } = useSession();
  const access = usePartnerAccess();
  const [error, setError] = useState("");
  if (loading) return <Message>Restaurando sua sessão…</Message>;
  if (!user)
    return (
      <div className="empty-page">
        <UserRound size={36} />
        <h1>Seu rolê, do seu jeito.</h1>
        <p>Entre para salvar eventos e acessar sua área.</p>
        <Button onClick={() => login().catch((e) => setError(e.message))}>
          Entrar com Google
        </Button>
        {error && <Message>{error}</Message>}
      </div>
    );
  if (partner && access.loading)
    return <Message>Carregando permiss?es?</Message>;
  if (partner && access.error) return <Message>{access.error}</Message>;
  if (!user.active || (partner && !access.canEnter))
    return (
      <Message>
        Esta área está disponível para{" "}
        {partner ? "membros ativos de estabelecimentos" : "contas ativas"}.
      </Message>
    );
  if (admin && !isPlatformAdmin(user))
    return (
      <Message>
        Esta área é exclusiva para administradores globais ativos.
      </Message>
    );
  return children;
}
function Shell() {
  const access = usePartnerAccess();
  const { user, login, logout, error: sessionError } = useSession(),
    [error, setError] = useState("");
  const location = useLocation();
  useEffect(() => {
    const listener = (e: globalThis.Event) =>
      setError(String((e as CustomEvent).detail));
    window.addEventListener("bora-notification", listener);
    return () => window.removeEventListener("bora-notification", listener);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    setError("");
    void logPageView(location.pathname);
  }, [location.pathname]);
  return (
    <>
      <header className="header">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" />
          <span>
            então<span className="accent">bora</span>
            <b>🤘</b>
          </span>
        </Link>
        <nav>
          <NavLink to="/" end>
            <Compass size={17} />
            Explorar
          </NavLink>
          <NavLink to="/minha-area">
            <UserRound size={17} />
            Minha área
          </NavLink>
          {access.canEnter && (
            <NavLink to="/partner-dashboard">Gestão do estabelecimento</NavLink>
          )}
          {isPlatformAdmin(user) && (
            <NavLink to="/admin">Administração</NavLink>
          )}
        </nav>
        <Button
          className="login-button"
          variant="outline"
          onClick={() =>
            (user ? logout() : login()).catch((e) => setError(e.message))
          }
        >
          {user ? (
            <>
              <LogOut size={16} />
              {user.name.split(" ")[0]} · Sair
            </>
          ) : (
            <>
              <UserRound size={16} />
              Entrar
            </>
          )}
        </Button>
      </header>
      <main className="container">
        {location.state?.eventSuccess && (
          <div role="status">
            <Message>{location.state.eventSuccess}</Message>
          </div>
        )}
        {(error || sessionError) && <Message>{error || sessionError}</Message>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/checkin/:slug"
            element={
              <Guard>
                <QrCheckInPage />
              </Guard>
            }
          />
          <Route
            path="/politica-de-privacidade"
            element={<PrivacyPolicyPage />}
          />
          <Route
            path="/events/create"
            element={
              <Guard>
                <EventEditorPage />
              </Guard>
            }
          />
          <Route
            path="/events/:id/edit"
            element={
              <Guard>
                <EventEditorPage />
              </Guard>
            }
          />
          <Route
            path="/places/create"
            element={
              <Guard partner>
                <PlaceEditorPage />
              </Guard>
            }
          />
          <Route
            path="/places/:id/edit"
            element={
              <Guard partner>
                <PlaceEditorPage />
              </Guard>
            }
          />
          <Route
            path="/places/manage"
            element={
              <Guard partner>
                <PlacesManagementPage />
              </Guard>
            }
          />
          <Route
            path="/places/orders"
            element={
              <Guard partner>
                <OrdersPage />
              </Guard>
            }
          />
          <Route
            path="/places/inventory"
            element={
              <Guard partner>
                <InventoryPage />
              </Guard>
            }
          />
          <Route
            path="/places/purchases"
            element={
              <Guard partner>
                <PurchasesPage />
              </Guard>
            }
          />
          <Route
            path="/places/notifications"
            element={
              <Guard partner>
                <NotificationsPage />
              </Guard>
            }
          />
          <Route
            path="/places/service-sessions"
            element={
              <Guard partner>
                <ServiceSessionsPage />
              </Guard>
            }
          />
          <Route
            path="/places/tables"
            element={
              <Guard partner>
                <TablesManagementPage />
              </Guard>
            }
          />
          <Route
            path="/places/menu"
            element={
              <Guard partner>
                <MenuManagementPage />
              </Guard>
            }
          />
          <Route
            path="/partner-dashboard"
            element={
              <Guard partner>
                <PartnerDashboardPage />
              </Guard>
            }
          />
          <Route
            path="/minha-area"
            element={
              <Guard>
                <UserArea />
              </Guard>
            }
          />
          <Route
            path="/admin"
            element={
              <Guard admin>
                <AdminPage />
              </Guard>
            }
          />
          <Route path="/events/:id" element={<EventDetailsPage />} />
          <Route path="/place/:id" element={<PlaceDetailsPage />} />
          <Route path="/places/:id" element={<PlaceDetailsPage />} />
          <Route
            path="/place"
            element={
              <Message>
                Escolha um estabelecimento na <Link to="/">página inicial</Link>
                .
              </Message>
            }
          />
          <Route
            path="*"
            element={
              <Message>
                Página não encontrada. <Link to="/">Voltar ao início</Link>
              </Message>
            }
          />
        </Routes>
      </main>
      <footer>
        <Link to="/" className="brand">
          então<span className="accent">bora</span>
        </Link>
        <span>A vida acontece lá fora. Bora?</span>
        <small>Rio de Janeiro · Música e encontros</small>
        <Link className="privacy-footer-link" to="/politica-de-privacidade">
          Política de Privacidade
        </Link>
      </footer>
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <PartnerAccessProvider>
          <Shell />
        </PartnerAccessProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
