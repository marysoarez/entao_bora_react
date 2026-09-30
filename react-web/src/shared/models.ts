export const genres = {
  classicRock: "Classic Rock",
  hardRock: "Hard Rock",
  heavyMetal: "Heavy Metal",
  thrashMetal: "Thrash Metal",
  deathMetal: "Death Metal",
  blackMetal: "Black Metal",
  powerMetal: "Power Metal",
  doomMetal: "Doom Metal",
  punk: "Punk",
  hardcore: "Hardcore",
  grunge: "Grunge",
  indie: "Indie",
  alternative: "Alternative Rock",
  blues: "Blues",
  jazz: "Jazz",
  popRock: "Pop Rock",
  nacional: "Rock Nacional",
  coverBand: "Cover",
  autoral: "Autoral",
  other: "Outro",
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
export type UserRole = "user" | "partner" | "admin";
export interface NotificationPreferences {
  events: boolean;
  orders: boolean;
  marketing: boolean;
}
export interface User {
  id: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  partnerId: string | null;
  role: UserRole;
  active: boolean;
  isAnonymous: boolean;
  notificationsEnabled: boolean;
  notificationPreferences: NotificationPreferences;
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
  autoCheckinSettings?: import("./checkIn").AutoCheckinSettings;
  menuSchemaVersion?: number;
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
