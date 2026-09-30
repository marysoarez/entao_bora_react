import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "./firebase";
import { PartnerAccessService } from "./partnerAccessService";
import { parsePlace } from "../shared/domain";
import {
  isPlaceModuleAvailable,
  moduleDefinition,
  parsePlaceModules,
  type PlaceModuleId,
  type PlaceModules,
} from "../shared/placeModules";
import type { User } from "../shared/models";
import {
  isModuleEntitled,
  modulePaidFeature,
} from "../shared/placeEntitlements";
import { PlaceEntitlementsService } from "./placeEntitlementsService";

export const modulesRef = (placeId: string) =>
  doc(database(), "places", placeId, "settings", "modules");
export const PlaceModulesService = {
  async get(placeId: string, tx?: Transaction): Promise<PlaceModules> {
    const ref = modulesRef(placeId);
    const snapshot = await (tx ? tx.get(ref) : getDoc(ref));
    return parsePlaceModules(snapshot.exists() ? snapshot.data() : undefined);
  },
  watch(
    placeId: string,
    onChange: (modules: PlaceModules) => void,
    onError: (error: Error) => void,
  ) {
    return onSnapshot(
      modulesRef(placeId),
      (snapshot) => {
        try {
          onChange(
            parsePlaceModules(snapshot.exists() ? snapshot.data() : undefined),
          );
        } catch (error) {
          onError(error as Error);
        }
      },
      onError,
    );
  },
  async assertAvailable(placeId: string, id: PlaceModuleId, tx?: Transaction) {
    // Core modules never depend on commercial entitlements.
    if (moduleDefinition(id).alwaysEnabled) return;
    const modules = await this.get(placeId, tx);
    if (!isPlaceModuleAvailable(modules, id))
      throw Error("Este módulo não está disponível para o estabelecimento.");
    if (modulePaidFeature(id)) {
      const entitlements = await PlaceEntitlementsService.get(placeId, tx);
      if (!isModuleEntitled(entitlements, id))
        throw Error(
          "Este recurso não está incluído no plano do estabelecimento.",
        );
    }
  },
  async setEnabled(
    placeId: string,
    id: PlaceModuleId,
    enabled: boolean,
    user: User,
  ) {
    assertProductWritesEnabled("Configuração de módulos");
    const definition = moduleDefinition(id);
    if (typeof enabled !== "boolean" || (definition.alwaysEnabled && !enabled))
      throw Error("Este módulo deve permanecer habilitado.");
    await runTransaction(database(), async (tx) => {
      const place = await tx.get(doc(database(), "places", placeId));
      if (!place.exists()) throw Error("Estabelecimento não encontrado.");
      if (
        !(await PartnerAccessService.canPlace(
          user,
          parsePlace(place.id, place.data()),
          "manageModules",
          tx,
        ))
      )
        throw Error("Sem permissão para configurar módulos.");
      const current = await this.get(placeId, tx);
      if (enabled && definition.plannedPaid) {
        const entitlements = await PlaceEntitlementsService.get(placeId, tx);
        if (!isModuleEntitled(entitlements, id))
          throw Error(
            "Este recurso não está incluído no plano do estabelecimento.",
          );
      }
      tx.set(modulesRef(placeId), {
        ...current,
        enabled: { ...current.enabled, [id]: enabled },
        updatedAt: serverTimestamp(),
        updatedBy: user.id,
      });
    });
  },
};
