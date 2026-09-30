import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import { assertProductWritesEnabled, database } from "../../../core/firebase";
import { PlaceModulesService } from "../../../core/placeModulesService";
import type { User } from "../../../shared/models";
import {
  parseCampaign,
  type NotificationCampaign,
} from "../model/notification";

export const NotificationsRepository = {
  watchCampaigns(
    placeId: string,
    next: (items: NotificationCampaign[]) => void,
    error: (cause: Error) => void,
  ) {
    return onSnapshot(
      query(
        collection(database(), "places", placeId, "notificationCampaigns"),
        orderBy("createdAt", "desc"),
      ),
      (snapshot) =>
        next(snapshot.docs.map((item) => parseCampaign(item.id, item.data()))),
      error,
    );
  },
  async createDraft(
    placeId: string,
    input: { title: string; body: string },
    user: User,
  ) {
    assertProductWritesEnabled("Criação de campanha");
    await PlaceModulesService.assertAvailable(placeId, "notifications");
    const title = input.title.trim(),
      body = input.body.trim();
    if (!title || title.length > 120 || !body || body.length > 500)
      throw Error("Informe título e mensagem válidos.");
    return addDoc(
      collection(database(), "places", placeId, "notificationCampaigns"),
      {
        title,
        body,
        kind: "marketing",
        status: "draft",
        createdBy: user.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
  },
  async cancelDraft(placeId: string, campaignId: string) {
    assertProductWritesEnabled("Cancelamento de campanha");
    await PlaceModulesService.assertAvailable(placeId, "notifications");
    await updateDoc(
      doc(database(), "places", placeId, "notificationCampaigns", campaignId),
      {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      },
    );
  },
};
