import type { Address } from "../../shared/models";
import { loadMaps } from "../MapView";

export async function refineEventAddress(address: Address): Promise<Address> {
  if (!address.number?.trim()) return address;
  const maps = await loadMaps();
  const { Geocoder } = await maps.importLibrary("geocoding");
  try {
    const response = await new Geocoder().geocode({
      address: [
        address.street,
        address.number,
        address.neighborhood,
        address.city,
        address.state,
        address.postalCode,
        "Brasil",
      ]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(", "),
      region: "br",
      language: "pt-BR",
      fulfillOnZeroResults: true,
    });
    const result = response.results?.[0];
    if (!result?.geometry?.location) return address;
    return {
      ...address,
      displayName: result.formatted_address || address.displayName,
      latitude: result.geometry.location.lat(),
      longitude: result.geometry.location.lng(),
    };
  } catch {
    throw Error(
      "Não foi possível confirmar o endereço com número. Tente novamente.",
    );
  }
}
