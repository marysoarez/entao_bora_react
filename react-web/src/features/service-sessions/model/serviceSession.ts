export const serviceTypes = ["table", "counter", "lounge", "takeaway"] as const;
export type ServiceType = (typeof serviceTypes)[number];
export type ServiceSessionStatus = "open" | "closed" | "cancelled";
export interface ServiceSession {
  id: string;
  placeId: string;
  tableId: string | null;
  serviceType: ServiceType;
  status: ServiceSessionStatus;
  customerCount: number;
  openedAt: Date;
  closedAt: Date | null;
  openedBy: string;
  closedBy: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}
export type OpenServiceSessionInput = Pick<
  ServiceSession,
  "tableId" | "serviceType" | "customerCount"
>;
export function validateServiceSessionInput(
  input: OpenServiceSessionInput,
): OpenServiceSessionInput {
  if (!serviceTypes.includes(input.serviceType))
    throw Error("Tipo de atendimento inválido.");
  if (!Number.isSafeInteger(input.customerCount) || input.customerCount < 1)
    throw Error("Informe uma quantidade inteira positiva de pessoas.");
  if (input.serviceType === "table") {
    if (
      typeof input.tableId !== "string" ||
      !input.tableId.trim() ||
      input.tableId.includes("/")
    )
      throw Error("Selecione uma mesa válida.");
  } else if (input.tableId !== null)
    throw Error("Este tipo de atendimento não utiliza mesa.");
  return {
    serviceType: input.serviceType,
    tableId: input.tableId,
    customerCount: input.customerCount,
  };
}
export function validateSessionTransition(
  current: ServiceSessionStatus,
  next: "closed" | "cancelled",
) {
  if (current !== "open" || !["closed", "cancelled"].includes(next))
    throw Error(
      "Somente atendimentos abertos podem ser encerrados ou cancelados.",
    );
}
