import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Address } from "../shared/models";
import { loadMaps } from "./MapView";
export function AddressSearch({
  value,
  onChange,
}: {
  value: Address;
  onChange: (a: Address) => void;
}) {
  const [input, setInput] = useState(""),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [error, setError] = useState("");
  const token = useRef<any>(null),
    generation = useRef(0);
  useEffect(() => {
    const gen = ++generation.current;
    if (input.length < 3 || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const maps = await loadMaps(),
          lib = await maps.importLibrary("places");
        token.current ??= new lib.AutocompleteSessionToken();
        const response =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
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
      }
    }, 350);
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
          onChange({ ...value, displayName: e.target.value });
          setInput(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
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
                try {
                  const place = s.placePrediction.toPlace();
                  await place.fetchFields({
                    fields: [
                      "formattedAddress",
                      "location",
                      "addressComponents",
                    ],
                  });
                  if (gen !== generation.current) return;
                  const component = (type: string) =>
                    place.addressComponents?.find((c: any) =>
                      c.types.includes(type),
                    )?.longText ?? "";
                  onChange({
                    ...value,
                    displayName: place.formattedAddress ?? value.displayName,
                    latitude: place.location.lat(),
                    longitude: place.location.lng(),
                    street: component("route"),
                    number: component("street_number") || value.number || "",
                    neighborhood: component("sublocality_level_1"),
                    city: component("administrative_area_level_2"),
                    state: component("administrative_area_level_1"),
                    country: component("country"),
                    postalCode: component("postal_code"),
                  });
                  token.current = null;
                  setSuggestions([]);
                  setInput("");
                } catch (e) {
                  setError((e as Error).message);
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
    </div>
  );
}
