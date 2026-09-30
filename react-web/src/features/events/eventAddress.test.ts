import { beforeEach, expect, it, vi } from "vitest";
import { refineEventAddress } from "./eventAddress";
const { geocode, load } = vi.hoisted(() => ({
  geocode: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../MapView", () => ({ loadMaps: load }));
const address = {
  displayName: "Rua",
  street: "Rua",
  number: " 123 ",
  complement: "Sala 2",
  city: "Rio",
  latitude: 1,
  longitude: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  load.mockResolvedValue({
    importLibrary: async () => ({
      Geocoder: class {
        geocode = geocode;
      },
    }),
  });
});
it("não consulta Google sem número", async () => {
  await refineEventAddress({ ...address, number: "" });
  expect(load).not.toHaveBeenCalled();
});
it("refina coordenadas e nome sem incluir complemento na consulta", async () => {
  geocode.mockResolvedValue({
    results: [
      {
        formatted_address: "Rua, 123",
        geometry: { location: { lat: () => 3, lng: () => 4 } },
      },
    ],
  });
  expect(await refineEventAddress(address)).toEqual({
    ...address,
    displayName: "Rua, 123",
    latitude: 3,
    longitude: 4,
  });
  expect(geocode.mock.calls[0][0].address).toBe("Rua, 123, Rio, Brasil");
});
it("preserva o endereço sem resultados", async () => {
  geocode.mockResolvedValue({ results: [] });
  expect(await refineEventAddress(address)).toBe(address);
});
it("interrompe publicação quando o serviço falha", async () => {
  geocode.mockRejectedValue(Error("network"));
  await expect(refineEventAddress(address)).rejects.toThrow(
    "confirmar o endereço",
  );
});
