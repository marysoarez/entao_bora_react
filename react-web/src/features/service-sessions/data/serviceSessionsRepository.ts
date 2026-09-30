import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../../core/firebase";
import { PartnerAccessService } from "../../../core/partnerAccessService";
import { PlaceModulesService } from "../../../core/placeModulesService";
import { parsePlace } from "../../../shared/domain";
import type { User } from "../../../shared/models";
import {
  validateServiceSessionInput,
  validateSessionTransition,
  type ServiceSession,
  type OpenServiceSessionInput,
} from "../model/serviceSession";
const sessionsRef = (placeId: string) =>
  collection(database(), "places", placeId, "serviceSessions");
const occupancyRef = (placeId: string, tableId: string) =>
  doc(database(), "places", placeId, "tableOccupancies", tableId);
const sessionRef = (placeId: string, id: string) =>
  doc(database(), "places", placeId, "serviceSessions", id);
function date(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate();
  throw Error("Invalid session timestamp");
}
export function parseServiceSession(
  id: string,
  placeId: string,
  data: Record<string, unknown>,
): ServiceSession {
  const fields = validateServiceSessionInput({
    tableId: data.tableId as string | null,
    serviceType: data.serviceType as ServiceSession["serviceType"],
    customerCount: data.customerCount as number,
  });
  if (
    !["open", "closed", "cancelled"].includes(String(data.status)) ||
    typeof data.openedBy !== "string" ||
    typeof data.source !== "string"
  )
    throw Error("Invalid service session");
  return {
    id,
    placeId,
    ...fields,
    status: data.status as ServiceSession["status"],
    openedAt: date(data.openedAt),
    closedAt: data.closedAt === null ? null : date(data.closedAt),
    openedBy: data.openedBy,
    closedBy: data.closedBy as string | null,
    source: data.source,
    createdAt: date(data.createdAt),
    updatedAt: date(data.updatedAt),
  };
}
const sortSessions = (rows: ServiceSession[]) =>
  rows.sort(
    (a, b) =>
      b.openedAt.getTime() - a.openedAt.getTime() || a.id.localeCompare(b.id),
  );
async function authorize(
  placeId: string,
  user: User,
  write: boolean,
  tx?: Transaction,
) {
  if (!user.active) throw Error("Conta inativa.");
  const ref = doc(database(), "places", placeId);
  const place = await (tx ? tx.get(ref) : getDoc(ref));
  if (!place.exists()) throw Error("Estabelecimento não encontrado.");
  if (
    !(await PartnerAccessService.canPlace(
      user,
      parsePlace(place.id, place.data()),
      write ? "manageServiceSessions" : "view",
      tx,
    ))
  )
    throw Error(
      "Sem permissão para acessar os atendimentos deste estabelecimento.",
    );
  await PlaceModulesService.assertAvailable(placeId, "serviceSessions", tx);
}
export const ServiceSessionsRepository = {
  async list(placeId: string, user: User) {
    await authorize(placeId, user, false);
    const result = await getDocs(sessionsRef(placeId));
    return sortSessions(
      result.docs.map((s) => parseServiceSession(s.id, placeId, s.data())),
    );
  },
  watch(
    placeId: string,
    user: User,
    onChange: (tables: ServiceSession[]) => void,
    onError: (error: Error) => void,
  ) {
    let cancelled = false;
    let stop = () => {};
    void authorize(placeId, user, false)
      .then(() => {
        if (cancelled) return;
        stop = onSnapshot(
          sessionsRef(placeId),
          (snapshot) => {
            if (cancelled) return;
            try {
              onChange(
                sortSessions(
                  snapshot.docs.map((s) =>
                    parseServiceSession(s.id, placeId, s.data()),
                  ),
                ),
              );
            } catch (error) {
              onError(error as Error);
            }
          },
          (error) => {
            if (!cancelled) onError(error);
          },
        );
      })
      .catch((error: Error) => {
        if (!cancelled) onError(error);
      });
    return () => {
      cancelled = true;
      stop();
    };
  },
  async open(placeId: string, input: OpenServiceSessionInput, user: User) {
    assertProductWritesEnabled("Service sessions");
    const fields = validateServiceSessionInput(input);
    const ref = doc(sessionsRef(placeId));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      if (fields.tableId !== null) {
        await PlaceModulesService.assertAvailable(placeId, "tables", tx);
        const table = await tx.get(
          doc(database(), "places", placeId, "tables", fields.tableId),
        );
        if (!table.exists() || table.data().active !== true)
          throw Error("Mesa indisponivel.");
      }
      if (
        fields.tableId !== null &&
        (await tx.get(occupancyRef(placeId, fields.tableId))).exists()
      )
        throw Error("Esta mesa ja possui um atendimento aberto.");
      if ((await tx.get(ref)).exists())
        throw Error("Tente abrir o atendimento novamente.");
      if (fields.tableId !== null)
        tx.set(occupancyRef(placeId, fields.tableId), { sessionId: ref.id });
      tx.set(ref, {
        id: ref.id,
        placeId,
        ...fields,
        status: "open",
        openedAt: serverTimestamp(),
        closedAt: null,
        openedBy: user.id,
        closedBy: null,
        source: "partner_web",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return ref.id;
  },
  async finish(
    placeId: string,
    id: string,
    status: "closed" | "cancelled",
    user: User,
  ) {
    assertProductWritesEnabled("Service sessions");
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const ref = sessionRef(placeId, id);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw Error("Atendimento nao encontrado.");
      validateSessionTransition(snapshot.data().status, status);
      const tableId = snapshot.data().tableId;
      if (typeof tableId === "string") {
        const lock = occupancyRef(placeId, tableId);
        const current = await tx.get(lock);
        if (current.exists() && current.data().sessionId !== id)
          throw Error("Ocupacao inconsistente. Contate o administrador.");
        if (current.exists()) tx.delete(lock);
      }
      // Permanent history: release only the occupancy lock, never delete the
      // session, participants or order snapshots when finishing a visit.
      tx.update(ref, {
        status,
        closedAt: serverTimestamp(),
        closedBy: user.id,
        updatedAt: serverTimestamp(),
      });
    });
  },
};
