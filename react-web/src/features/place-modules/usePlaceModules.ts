import { useEffect, useState } from "react";
import { PlaceEntitlementsService } from "../../core/placeEntitlementsService";
import { PlaceModulesService } from "../../core/placeModulesService";
import {
  emptyPlaceEntitlements,
  type PlaceEntitlements,
} from "../../shared/placeEntitlements";
import {
  defaultPlaceModules,
  isPlaceModuleAvailable,
  moduleDefinition,
  type PlaceModuleId,
  type PlaceModules,
} from "../../shared/placeModules";
import { useSession } from "../session";

interface ModuleState {
  placeId: string;
  user: ReturnType<typeof useSession>["user"];
  modules: PlaceModules;
  entitlements: PlaceEntitlements;
  modulesReady: boolean;
  entitlementsReady: boolean;
  error: string;
}

export function usePlaceModules(placeId: string | null | undefined) {
  const { user } = useSession();
  const [state, setState] = useState<ModuleState | null>(null);
  useEffect(() => {
    if (!placeId || !user?.active) return;
    let alive = true;
    const initial: ModuleState = {
      placeId,
      user,
      modules: defaultPlaceModules(),
      entitlements: emptyPlaceEntitlements(),
      modulesReady: false,
      entitlementsReady: false,
      error: "",
    };
    const update = (change: Partial<ModuleState>) => {
      if (alive)
        setState((current) => ({
          ...(current?.placeId === placeId && current.user === user
            ? current
            : initial),
          ...change,
        }));
    };
    const stopModules = PlaceModulesService.watch(
      placeId,
      (modules) => update({ modules, modulesReady: true }),
      (cause) => update({ modulesReady: true, error: cause.message }),
    );
    const stopEntitlements = PlaceEntitlementsService.watch(
      placeId,
      (entitlements) => update({ entitlements, entitlementsReady: true }),
      (cause) => update({ entitlementsReady: true, error: cause.message }),
    );
    return () => {
      alive = false;
      stopModules();
      stopEntitlements();
    };
  }, [placeId, user]);
  const current =
    state?.placeId === placeId && state?.user === user ? state : null;
  const loading =
    !!placeId &&
    !!user?.active &&
    (!current || !current.modulesReady || !current.entitlementsReady);
  const modules = current?.modules ?? defaultPlaceModules();
  const entitlements = current?.entitlements ?? emptyPlaceEntitlements();
  const error = current?.error ?? "";
  return {
    modules,
    entitlements,
    loading,
    error,
    available: (id: PlaceModuleId) =>
      moduleDefinition(id).alwaysEnabled ||
      (!!placeId &&
        !!user?.active &&
        !loading &&
        !error &&
        isPlaceModuleAvailable(modules, id, entitlements)),
  };
}
