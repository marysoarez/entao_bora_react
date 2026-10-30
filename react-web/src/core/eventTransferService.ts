import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export interface TransferRecipient {
  id: string;
  name: string;
  email: string;
}

export interface TransferSearchError extends Error {
  code?: string;
  stage?: string;
  details?: unknown;
  customData?: { details?: unknown };
}

function transferSearchError(cause: unknown): TransferSearchError {
  const source = cause as TransferSearchError;
  const error = new Error(source?.message || "Não foi possível buscar usuários.") as TransferSearchError;
  error.code = source?.code;
  error.details = source?.details ?? source?.customData?.details;
  const details = error.details;
  if (details && typeof details === "object" && "stage" in details && typeof details.stage === "string") {
    error.stage = details.stage;
  }
  return error;
}

export async function searchEventTransferRecipients(
  eventId: string,
  term: string,
): Promise<TransferRecipient[]> {
  if (!functions) throw Error("Configure o Firebase para buscar usuários.");
  const search = httpsCallable<
    { eventId: string; term: string },
    { recipients: TransferRecipient[] }
  >(functions, "searchEventTransferRecipients");
  try {
    const result = await search({ eventId, term });
    return result.data.recipients;
  } catch (cause) {
    throw transferSearchError(cause);
  }
}
