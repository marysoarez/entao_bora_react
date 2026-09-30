// A physical resource only. Visits, customers and orders belong to separate entities.
export interface PlaceTable {
  id: string;
  number: number;
  name: string;
  capacity: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type TableInput = Pick<
  PlaceTable,
  "number" | "name" | "capacity" | "active"
>;
export function validateTable(input: TableInput): TableInput {
  if (!Number.isSafeInteger(input.number) || input.number < 1)
    throw Error("Informe um número inteiro positivo para a mesa.");
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1)
    throw Error("A capacidade deve ser um número inteiro positivo.");
  if (typeof input.name !== "string" || input.name.trim().length > 100)
    throw Error("O nome deve ter até 100 caracteres.");
  if (typeof input.active !== "boolean")
    throw Error("Informe se a mesa está ativa.");
  return {
    number: input.number,
    name: input.name.trim() || `Mesa ${String(input.number).padStart(2, "0")}`,
    capacity: input.capacity,
    active: input.active,
  };
}
export const sortTables = (tables: PlaceTable[]) =>
  [...tables].sort(
    (a, b) =>
      a.number - b.number ||
      a.name.localeCompare(b.name, "pt-BR") ||
      a.id.localeCompare(b.id),
  );
