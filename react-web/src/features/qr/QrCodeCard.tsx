/* oxlint-disable next/no-img-element -- generated data URL is the downloadable QR artifact */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCodeCard({ path, label }: { path: string; label: string }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320 })
      .then(value => { if (alive) setImage(value); })
      .catch(cause => { if (alive) setError((cause as Error).message); });
    return () => { alive = false; };
  }, [url]);
  return <article className="qr-card">
    <h3>{label}</h3>
    {image ? <img src={image} alt={`QR Code: ${label}`} width={240} height={240} /> : <p>{error || "Gerando QR Code…"}</p>}
    <code>{url}</code>
    {image && <a href={image} download={`${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}>Baixar PNG</a>}
  </article>;
}
