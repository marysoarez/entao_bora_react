export interface MenuCategory {
  id: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface MenuProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
  available: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
export type CategoryInput = Omit<
  MenuCategory,
  "id" | "createdAt" | "updatedAt"
>;
export type ProductInput = Omit<MenuProduct, "id" | "createdAt" | "updatedAt">;
export function validateCategory(input: CategoryInput): CategoryInput {
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 100
  )
    throw Error("Informe um nome de até 100 caracteres.");
  if (typeof input.description !== "string" || input.description.length > 2000)
    throw Error("Descrição deve ter até 2000 caracteres.");
  if (!Number.isSafeInteger(input.order) || input.order < 0)
    throw Error("Ordem deve ser um inteiro não negativo.");
  if (typeof input.active !== "boolean") throw Error("Ativação inválida.");
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    order: input.order,
    active: input.active,
  };
}
export function validateProduct(input: ProductInput): ProductInput {
  const base = validateCategory(input);
  if (!input.categoryId || input.categoryId.includes("/"))
    throw Error("Selecione uma categoria válida.");
  if (
    !Number.isFinite(input.price) ||
    input.price < 0 ||
    input.price > 999999.99 ||
    Math.abs(input.price * 100 - Math.round(input.price * 100)) > 0.000001
  )
    throw Error("Preço inválido: use até duas casas decimais.");
  if (typeof input.available !== "boolean")
    throw Error("Disponibilidade inválida.");
  if (
    typeof input.imageUrl !== "string" ||
    input.imageUrl.length > 250000 ||
    (input.imageUrl &&
      !/^https:\/\/|^data:image\/(jpeg|png|webp);base64,/.test(input.imageUrl))
  )
    throw Error("Use uma imagem enviada ou URL HTTPS.");
  return {
    ...base,
    categoryId: input.categoryId,
    price: Math.round(input.price * 100) / 100,
    imageUrl: input.imageUrl,
    available: input.available,
  };
}
export const menuOrder = <T extends { order: number; id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
