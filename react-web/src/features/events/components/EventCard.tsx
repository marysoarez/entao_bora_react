import { ArrowUpRight, MapPin, Music2 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, imageSource } from "../../../shared/domain";
import { genres, type Event } from "../../../shared/models";
import { Star } from "lucide-react";

export function EventCard({ event }: { event: Event }) {
  return (
    <Link className="event-card" to={`/events/${event.slug || event.id}`}>
      <div className="card-image">
        {event.coverImage ? (
          <img src={imageSource(event.coverImage)} alt="" loading="lazy" />
        ) : (
          <Music2 size={48} />
        )}
        <span className="badge">
          {event.ticket.type === "free" ? "Entrada gratuita" : "Ingressos"}
        </span>
        {event.featured && (
          <span className="featured-card-badge">
            <Star size={13} fill="currentColor" /> Em destaque
          </span>
        )}
      </div>
      <div className="card-body">
        <small className="accent">{formatDate(event.startDate)}</small>
        <h3>{event.title}</h3>
        <p>
          <MapPin size={14} />
          {event.locationName}
        </p>
        <div className="card-bottom">
          <span>
            {event.musicGenres
              .slice(0, 2)
              .map((genre) => genres[genre])
              .join(" · ")}
          </span>
          <ArrowUpRight size={18} />
        </div>
      </div>
    </Link>
  );
}
