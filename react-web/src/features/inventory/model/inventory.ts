export const inventoryUnits = ["un", "g", "ml"] as const;
export type InventoryUnit = (typeof inventoryUnits)[number];
export const movementTypes = ["entry", "exit", "adjustment", "loss"] as const;
export type MovementType = (typeof movementTypes)[number];
export const movementLabels = {
  entry: "Entrada",
  exit: "Saída",
  adjustment: "Ajuste",
  loss: "Perda",
};
export const MAX_STOCK = 1_000_000_000_000;
export interface InventoryItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  stockMilli: number;
  minimumMilli: number;
  active: boolean;
  lastMovementId: string | null;
}
export interface InventoryMovement {
  id: string;
  itemId: string;
  type: MovementType;
  deltaMilli: number;
  beforeMilli: number;
  afterMilli: number;
  unit: InventoryUnit;
  reason: string;
  createdBy: string;
  createdAt: Date;
}
export interface Recipe {
  menuItemId: string;
  revision: number;
  active: boolean;
  components: Record<string, { unit: InventoryUnit; quantityMilli: number }>;
}
export function validStock(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_STOCK;
}
export function quantityMilli(text: string): number {
  if (!/^-?\d+(?:[.,]\d{1,3})?$/.test(text.trim()))
    throw Error("Use uma quantidade com até três casas decimais.");
  const value = Math.round(Number(text.trim().replace(",", ".")) * 1000);
  if (!validStock(Math.abs(value))) throw Error("Quantidade fora do limite.");
  return value;
}
export const displayQuantity = (value: number) =>
  (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export function validateItem(
  input: Pick<InventoryItem, "name" | "unit" | "minimumMilli" | "active">,
) {
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 100 ||
    !inventoryUnits.includes(input.unit) ||
    !validStock(input.minimumMilli) ||
    typeof input.active !== "boolean"
  )
    throw Error("Insumo inválido. Confira nome, unidade e estoque mínimo.");
  return {
    name: input.name.trim(),
    unit: input.unit,
    minimumMilli: input.minimumMilli,
    active: input.active,
  };
}
export function movementDelta(type: MovementType, amountMilli: number) {
  if (
    !movementTypes.includes(type) ||
    !validStock(Math.abs(amountMilli)) ||
    amountMilli === 0 ||
    (type !== "adjustment" && amountMilli < 0)
  )
    throw Error("Quantidade ou tipo de movimentação inválido.");
  return type === "exit" || type === "loss" ? -amountMilli : amountMilli;
}
export function stockAfter(before: number, delta: number) {
  if (
    !validStock(before) ||
    !Number.isSafeInteger(delta) ||
    !validStock(before + delta)
  )
    throw Error("Saldo insuficiente ou quantidade fora do limite.");
  return before + delta;
}
export function validateRecipe(
  components: Recipe["components"],
  items: readonly InventoryItem[],
) {
  const entries = Object.entries(components);
  if (entries.length < 1 || entries.length > 5)
    throw Error("A receita deve ter de 1 a 5 insumos diferentes.");
  for (const [id, component] of entries) {
    const item = items.find((row) => row.id === id);
    if (
      !item?.active ||
      component.unit !== item.unit ||
      !validStock(component.quantityMilli) ||
      component.quantityMilli === 0
    )
      throw Error(
        "Insumo indisponível, unidade incompatível ou quantidade inválida na receita.",
      );
  }
  return components;
}
/** Planning only: no stock write or order integration. Quantity is per menu serving. */
export function recipeRequirements(recipe: Recipe, servings: number) {
  if (!recipe.active || !Number.isSafeInteger(servings) || servings < 1)
    throw Error("Receita ou quantidade de porções inválida.");
  return Object.entries(recipe.components).map(([itemId, component]) => {
    const requiredMilli = component.quantityMilli * servings;
    if (
      !validStock(component.quantityMilli) ||
      component.quantityMilli === 0 ||
      !validStock(requiredMilli) ||
      !inventoryUnits.includes(component.unit)
    )
      throw Error("Quantidade de receita fora do limite.");
    return { itemId, unit: component.unit, requiredMilli };
  });
}
