import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Transaction,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../../core/firebase";
import { PartnerAccessService } from "../../../core/partnerAccessService";
import { PlaceModulesService } from "../../../core/placeModulesService";
import { parsePlace } from "../../../shared/domain";
import type { User } from "../../../shared/models";
import {
  sortTables,
  validateTable,
  type PlaceTable,
  type TableInput,
} from "../model/table";

const tablesRef = (placeId: string) =>
  collection(database(), "places", placeId, "tables");
const tableRef = (placeId: string, tableId: string) =>
  doc(database(), "places", placeId, "tables", tableId);
function date(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate();
  return new Date(0);
}
export function parseTable(
  id: string,
  data: Record<string, unknown>,
): PlaceTable {
  return {
    id,
    ...validateTable({
      number: data.number as number,
      name: data.name as string,
      capacity: data.capacity as number,
      active: data.active as boolean,
    }),
    createdAt: date(data.createdAt),
    updatedAt: date(data.updatedAt),
  };
}
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
      write ? "manageTables" : "view",
      tx,
    ))
  )
    throw Error("Sem permissão para acessar as mesas deste estabelecimento.");
  await PlaceModulesService.assertAvailable(placeId, "tables", tx);
}
export const TablesRepository = {
  async list(placeId: string, user: User) {
    await authorize(placeId, user, false);
    const result = await getDocs(tablesRef(placeId));
    return sortTables(result.docs.map((s) => parseTable(s.id, s.data())));
  },
  watch(
    placeId: string,
    user: User,
    onChange: (tables: PlaceTable[]) => void,
    onError: (error: Error) => void,
  ) {
    let cancelled = false;
    let stop = () => {};
    void authorize(placeId, user, false)
      .then(() => {
        if (cancelled) return;
        stop = onSnapshot(
          tablesRef(placeId),
          (snapshot) => {
            if (cancelled) return;
            try {
              onChange(
                sortTables(
                  snapshot.docs.map((s) => parseTable(s.id, s.data())),
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
  async save(placeId: string, input: TableInput, user: User, tableId?: string) {
    assertProductWritesEnabled("Gestão de mesas");
    const fields = validateTable(input);
    const duplicates = await getDocs(query(tablesRef(placeId), where("number", "==", fields.number)));
    if (duplicates.docs.some(row => row.id !== tableId))
      throw Error(`Já existe uma Mesa ${String(fields.number).padStart(2, "0")} neste estabelecimento.`);
    const ref = tableId ? tableRef(placeId, tableId) : doc(tablesRef(placeId));
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const old = await tx.get(ref);
      if (tableId && !old.exists()) throw Error("Mesa não encontrada.");
      if (!tableId && old.exists())
        throw Error("Não foi possível criar a mesa. Tente novamente.");
      if (old.exists())
        tx.update(ref, { ...fields, updatedAt: serverTimestamp() });
      else
        tx.set(ref, {
          id: ref.id,
          ...fields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
    });
    return ref.id;
  },
  async setActive(
    placeId: string,
    tableId: string,
    active: boolean,
    user: User,
  ) {
    assertProductWritesEnabled("Ativação de mesas");
    if (typeof active !== "boolean") throw Error("Estado da mesa inválido.");
    await runTransaction(database(), async (tx) => {
      await authorize(placeId, user, true, tx);
      const ref = tableRef(placeId, tableId);
      if (!(await tx.get(ref)).exists()) throw Error("Mesa não encontrada.");
      tx.update(ref, { active, updatedAt: serverTimestamp() });
    });
  },
};
