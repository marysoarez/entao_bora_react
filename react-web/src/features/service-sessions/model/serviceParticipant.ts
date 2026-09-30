export const participantSources = ["customer_qr"] as const;
export type ParticipantSource = (typeof participantSources)[number];

export interface ServiceParticipant {
  userId: string;
  placeId: string;
  serviceSessionId: string;
  source: ParticipantSource;
  joinedAt: Date;
  leftAt: Date | null;
}

export function validateServiceParticipant(value: Omit<ServiceParticipant, "joinedAt">) {
  if (!value.userId || value.userId.includes("/")) throw Error("Participante inválido.");
  if (!value.placeId || value.placeId.includes("/")) throw Error("Estabelecimento inválido.");
  if (!value.serviceSessionId || value.serviceSessionId.includes("/")) throw Error("Atendimento inválido.");
  if (!participantSources.includes(value.source)) throw Error("Origem do participante inválida.");
  if (value.leftAt !== null) throw Error("Novo participante não pode iniciar como removido.");
  return value;
}
