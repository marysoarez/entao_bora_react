import { useState } from "react";
import { PlaceModulesService } from "../../core/placeModulesService";
import {
  placeModuleCatalog,
  type PlaceModuleId,
  type PlaceModules,
} from "../../shared/placeModules";
import { useSession } from "../session";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { Message } from "../../shared/ui/Message";
import {
  isModuleEntitled,
  type PlaceEntitlements,
} from "../../shared/placeEntitlements";

export function PlaceModuleSettings({
  placeId,
  modules,
  entitlements,
  loading,
  error,
}: {
  placeId: string;
  modules: PlaceModules;
  entitlements: PlaceEntitlements;
  loading: boolean;
  error: string;
}) {
  const { user } = useSession();
  const access = usePartnerAccess();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!access.can(placeId, "manageModules")) return null;
  async function change(id: PlaceModuleId, enabled: boolean) {
    if (!user || busy || loading || error) return;
    setBusy(true);
    setMessage("");
    try {
      await PlaceModulesService.setEnabled(placeId, id, enabled, user);
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="partner-module-settings">
      <summary>Configurar módulos</summary>
      <p>
        Eventos e Equipe permanecem disponíveis. Desativar a gestão do cardápio
        não apaga os produtos publicados.
      </p>
      <p>
        Plano atual: <strong>{entitlements.planKey}</strong> (
        {entitlements.status}). Preços e concessões são administrados fora do
        frontend.
      </p>
      {loading && <p>Carregando configuração…</p>}
      {error && <Message>{error}</Message>}
      {message && <Message>{message}</Message>}
      <div className="partner-module-options">
        {placeModuleCatalog.map((module) => (
          <label key={module.id}>
            <input
              type="checkbox"
              checked={modules.enabled[module.id]}
              disabled={
                busy ||
                loading ||
                !!error ||
                module.alwaysEnabled ||
                module.availability === "planned" ||
                !isModuleEntitled(entitlements, module.id)
              }
              onChange={(event) => {
                void change(module.id, event.target.checked);
              }}
            />
            <span>
              {module.label}
              <small>
                {module.alwaysEnabled
                  ? "Sempre disponível"
                  : module.availability === "planned"
                    ? "Em breve"
                    : !isModuleEntitled(entitlements, module.id)
                      ? "Não incluído no plano"
                      : "Gestão habilitada"}
              </small>
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}
