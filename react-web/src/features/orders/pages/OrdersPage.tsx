import { Link, useSearchParams } from "react-router-dom";
import { useSession } from "../../session";
import { usePartnerAccess } from "../../partner-access/PartnerAccess";
import { usePlaceModules } from "../../place-modules/usePlaceModules";
import { OrdersPanel } from "../OrdersPanel";

export function OrdersPage() {
  const { user } = useSession();
  const access = usePartnerAccess();
  const [params, setParams] = useSearchParams();
  const requested = params.get("placeId");
  const selected = requested
    ? access.places.find((entry) => entry.place.id === requested)
    : access.places[0];
  const placeId = selected?.place.id;
  const modules = usePlaceModules(placeId);
  if (access.loading) return <p>Carregando estabelecimentos…</p>;
  if (access.error) return <p role="alert">{access.error}</p>;
  if (!user || !placeId)
    return <p role="alert">Estabelecimento indisponível ou sem permissão.</p>;
  return (
    <main className="tables-management">
      <Link to={`/partner-dashboard?placeId=${encodeURIComponent(placeId)}`}>
        Voltar ao painel
      </Link>
      <h1>Pedidos</h1>
      <label>
        Estabelecimento
        <select
          value={placeId}
          onChange={(e) => setParams({ placeId: e.target.value })}
        >
          {access.places.map((entry) => (
            <option key={entry.place.id} value={entry.place.id}>
              {entry.place.name}
            </option>
          ))}
        </select>
      </label>
      {modules.loading ? (
        <p>Carregando módulo…</p>
      ) : modules.error ? (
        <p role="alert">{modules.error}</p>
      ) : !modules.available("orders") ? (
        <p>
          O módulo Pedidos está desativado. O proprietário ou administrador pode
          ativá-lo nas configurações do painel.
        </p>
      ) : (
        <OrdersPanel
          key={`${placeId}:${user.id}`}
          placeId={placeId}
          user={user}
          editable={access.can(placeId, "manageOrders")}
          tablesEnabled={modules.available("tables")}
          canCreate={
            modules.available("serviceSessions") && modules.available("menu")
          }
        />
      )}
    </main>
  );
}
