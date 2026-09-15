export const genres = {
  classicRock: "Rock clássico",
  hardRock: "Hard rock",
  heavyMetal: "Heavy metal",
  thrashMetal: "Thrash metal",
  deathMetal: "Death metal",
  blackMetal: "Black metal",
  powerMetal: "Power metal",
  doomMetal: "Doom metal",
  punk: "Punk",
  hardcore: "Hardcore",
  grunge: "Grunge",
  indie: "Indie",
  alternative: "Alternativo",
  blues: "Blues",
  jazz: "Jazz",
  popRock: "Pop rock",
  nacional: "Rock nacional",
  coverBand: "Cover",
  autoral: "Autoral",
  other: "Outros",
};
export type Genre = keyof typeof genres;
export interface Address {
  displayName: string;
  latitude: number;
  longitude: number;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}
export interface User {
  id: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  partnerId: string | null;
  role: "user" | "partner" | "admin";
  active: boolean;
  isAnonymous: boolean;
  notificationsEnabled: boolean;
  locationSharingEnabled: boolean;
  lastKnownLocation: { latitude: number; longitude: number } | null;
}
export interface MenuItem {
  id: string;
  title: string;
  description: string;
  price: number;
  photo: string;
  category: string;
}
export interface Place {
  id: string;
  slug: string;
  name: string;
  description: string;
  address: Address;
  type: string;
  phone: string;
  instagram: string;
  website: string;
  photos: string[];
  ownerId: string;
  musicGenres: Genre[];
  openingHours: {
    weekday: string;
    opensAt: { hour: number; minute: number };
    closesAt: { hour: number; minute: number };
  }[];
  menuItems: MenuItem[];
  menuCategories: string[];
}
export interface Event {
  id: string;
  slug: string;
  title: string;
  description: string;
  placeId: string | null;
  locationName: string;
  address: Address;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  coverImage: string;
  gallery: string[];
  musicGenres: Genre[];
  attractions: {
    id: string;
    name: string;
    instagram?: string;
    image?: string;
    isHeadliner: boolean;
  }[];
  ticket: { type: "free" | "external"; ticketUrl: string | null };
  instagram: string | null;
  boraCount: number;
  checkinCount: number;
  views: number;
  shares: number;
  createdBy: string;
  status: "draft" | "published" | "cancelled" | "finished" | "hidden";
}
