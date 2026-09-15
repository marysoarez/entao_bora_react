import {
  editMenu,
  listPlaces,
  resolvePublicEntity,
  saveEntity,
} from "../../../core/repository";
import type { Place, User } from "../../../shared/models";

export const getPlace = (idOrSlug: string) =>
  resolvePublicEntity("places", idOrSlug);
export const getPlaces = listPlaces;
export const savePlace = (place: Place, user: User) =>
  saveEntity("places", place, user);
export const updatePlaceMenu = editMenu;
