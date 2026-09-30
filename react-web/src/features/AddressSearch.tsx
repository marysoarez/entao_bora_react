import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Address } from "../shared/models";
import { loadMaps } from "./MapView";
export function AddressSearch({
  value,
  onChange,
  onSelectionChange,
}: {
  value: Address;
  onChange: (a: Address) => void;
  onSelectionChange?: (selected: boolean) => void;
}) {
  const [input, setInput] = useState(""),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [error, setError] = useState("");
  const [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false);
  const token = useRef<any>(null),
    generation = useRef(0);
  useEffect(() => {
    const gen = ++generation.current;
    if (input.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearched(false);
    const timer = setTimeout(async () => {
      try {
        if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
          throw Error(
            "Busca de endereços indisponível: configure o Google Maps.",
          );
        const maps = await loadMaps(),
          lib = await maps.importLibrary("places");
        token.current ??= new lib.AutocompleteSessionToken();
        const response =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: input.trim(),
            sessionToken: token.current,
            includedRegionCodes: ["br"],
            language: "pt-BR",
          });
        if (generation.current === gen)
          setSuggestions(
            response.suggestions.filter((s: any) => s.placePrediction),
          );
      } catch (e) {
        if (generation.current === gen) setError((e as Error).message);
      } finally {
        if (generation.current === gen) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [input]);
  return (
    <div className="field">
      <label htmlFor="address-search">Endereço completo *</label>
      <Input
        id="address-search"
        required
        autoComplete="off"
        value={value.displayName}
        onChange={(e) => {
          ++generation.current;
          onSelectionChange?.(false);
          onChange({
            displayName: e.target.value,
            latitude: NaN,
            longitude: NaN,
          });
          setSuggestions([]);
          setSearched(false);
          setInput(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            ++generation.current;
            setInput("");
            setSuggestions([]);
          }
        }}
      />
      {suggestions.length > 0 && (
        <div aria-label="Sugestões de endereço">
          {suggestions.map((s, i) => (
            <button
              type="button"
              style={{ display: "block", padding: 12, textAlign: "left" }}
              key={i}
              onClick={async () => {
                const gen = ++generation.current;
                setSearching(true);
                try {
                  const place = s.placePrediction.toPlace();
                  await place.fetchFields({
                    fields: [
                      "formattedAddress",
                      "displayName",
                      "location",
                      "addressComponents",
                    ],
                  });
                  if (gen !== generation.current) return;
                  if (!place.location)
                    throw Error(
                      "Endereço sem localização. Selecione outro resultado.",
                    );
                  const component = (type: string) =>
                    place.addressComponents?.find((c: any) =>
                      c.types.includes(type),
                    )?.longText ?? "";
                  onChange({
                    displayName:
                      place.displayName ||
                      place.formattedAddress ||
                      value.displayName,
                    latitude: place.location.lat(),
                    longitude: place.location.lng(),
                    street: component("route"),
                    number: component("street_number"),
                    complement: "",
                    neighborhood:
                      component("sublocality_level_1") ||
                      component("sublocality"),
                    city:
                      component("locality") ||
                      component("administrative_area_level_2"),
                    state: component("administrative_area_level_1"),
                    country: component("country"),
                    postalCode: component("postal_code"),
                  });
                  onSelectionChange?.(true);
                  token.current = null;
                  setSuggestions([]);
                  setInput("");
                } catch (e) {
                  if (gen === generation.current)
                    setError((e as Error).message);
                } finally {
                  if (gen === generation.current) setSearching(false);
                }
              }}
            >
              {s.placePrediction.text.toString()}
            </button>
          ))}
          <small className="subtle">Google Maps</small>
        </div>
      )}
      {error && <p role="status">{error}</p>}
      {searching && <p role="status">Buscando endereço…</p>}
      {searched &&
        !searching &&
        !error &&
        !suggestions.length &&
        input.trim().length >= 3 && (
          <p role="status">Nenhum endereço encontrado.</p>
        )}
    </div>
  );
}
