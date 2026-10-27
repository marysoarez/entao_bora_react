import { useId } from "react";
import { Headphones } from "lucide-react";
import "./spotify-mini-player.css";

type SpotifyMiniPlayerProps = {
  playlistId: string;
  title: string;
  iframeTitle?: string;
};

export function SpotifyMiniPlayer({
  playlistId,
  title,
  iframeTitle = "Playlist Então Bora",
}: SpotifyMiniPlayerProps) {
  const titleId = useId();

  return (
    <section className="spotify-mini-player" aria-labelledby={titleId}>
      <h2 id={titleId}>
        <Headphones size={18} aria-hidden="true" />
        {title}
      </h2>
      <div className="spotify-mini-player-embed">
        <iframe
          src={`https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}`}
          width="100%"
          height="152"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          title={iframeTitle}
        />
      </div>
    </section>
  );
}
