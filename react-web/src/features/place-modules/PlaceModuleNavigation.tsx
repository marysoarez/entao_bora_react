import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  placeModuleCatalog,
  placeModuleDestination,
  placeModuleGroups,
  type PlaceModuleId,
} from "../../shared/placeModules";
import type { PartnerPermission } from "../../shared/partnerPermissions";

export function PlaceModuleNavigation({
  placeId,
  available,
  can,
}: {
  placeId: string;
  available: (id: PlaceModuleId) => boolean;
  can: (permission: PartnerPermission) => boolean;
}) {
  return (
    <nav className="partner-modules" aria-label="Módulos do estabelecimento">
      {placeModuleGroups.map((group) => (
        <section key={group.id} aria-labelledby={`module-group-${group.id}`}>
          <h2 id={`module-group-${group.id}`}>{group.label}</h2>
          <div className="partner-action-grid">
            {placeModuleCatalog
              .filter((module) => module.group === group.id)
              .sort((a, b) => {
                const order = [
                  "events",
                  "tables",
                  "serviceSessions",
                  "orders",
                  "menu",
                  "inventory",
                  "purchases",
                  "team",
                  "notifications",
                  "analytics",
                  "heatmap",
                ];
                return order.indexOf(a.id) - order.indexOf(b.id);
              })
              .map((module) => {
                const destination = placeModuleDestination(module.id, placeId);
                const permitted = can(module.permission);
                const enabled = available(module.id);
                const status =
                  module.availability === "planned"
                    ? "Em breve"
                    : !permitted
                      ? "Sem permissão de gestão"
                      : !enabled
                        ? "Indisponível"
                        : "Acessar";
                const content = (
                  <>
                    <h3>{module.label}</h3>
                    <p>{module.description}</p>
                    {module.plannedPaid && (
                      <small className="partner-module-badge">
                        Requer plano
                      </small>
                    )}
                    <span>
                      {status}
                      {enabled && permitted && destination && (
                        <ArrowRight size={15} aria-hidden="true" />
                      )}
                    </span>
                  </>
                );
                return enabled && permitted && destination ? (
                  <Link
                    className="partner-action-card"
                    to={destination}
                    key={module.id}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className="partner-action-card partner-module-unavailable"
                    key={module.id}
                  >
                    {content}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </nav>
  );
}
