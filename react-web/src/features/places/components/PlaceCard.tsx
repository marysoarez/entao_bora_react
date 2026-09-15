import { ArrowUpRight, Music2 } from "lucide-react";
import { Link } from "react-router-dom";
import { imageSource } from "../../../shared/domain";
import type { Place } from "../../../shared/models";

export function PlaceCard({ place }: { place: Place }) {
  return (
    <Link className="place-card" to={`/place/${place.slug || place.id}`}>
      <div className="place-photo">
        {place.photos[0] ? (
          <img src={imageSource(place.photos[0])} alt="" loading="lazy" />
        ) : (
          <Music2 />
        )}
      </div>
      <div>
        <small>{place.type}</small>
        <h3>{place.name}</h3>
        <p>{place.address.neighborhood || place.address.displayName}</p>
      </div>
      <ArrowUpRight />
    </Link>
  );
}
