import { useState } from "react";
export function ImageUpload({
  onImage,
  rawBase64 = false,
  maxLength = 250000,
  onBusyChange,
  label = "Ou enviar imagem",
}: {
  onImage: (image: string) => void;
  rawBase64?: boolean;
  maxLength?: number;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="field">
      <label>
        {label}{" "}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            onBusyChange?.(true);
            setError("");
            let url = "";
            try {
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(
                  file.type,
                ) ||
                file.size > 15 * 1024 * 1024
              )
                throw Error("Selecione JPG, PNG ou WebP de até 15 MB.");
              url = URL.createObjectURL(file);
              const image = new Image();
              image.src = url;
              await image.decode();
              const ratio = Math.min(
                1,
                1600 / Math.max(image.width, image.height),
              );
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(image.width * ratio);
              canvas.height = Math.round(image.height * ratio);
              const ctx = canvas.getContext("2d");
              if (!ctx) throw Error("Não foi possível processar a imagem.");
              ctx.fillStyle = "#161616";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
              let result = "";
              for (let quality = 0.9; quality >= 0.19; quality -= 0.1) {
                result = canvas.toDataURL("image/jpeg", quality);
                if (rawBase64) result = result.split(",")[1];
                if (result.length < maxLength) break;
              }
              if (result.length >= maxLength)
                throw Error(
                  "A imagem continua muito grande. Escolha uma imagem menor.",
                );
              onImage(result);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              if (url) URL.revokeObjectURL(url);
              setBusy(false);
              onBusyChange?.(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {busy && <small>Preparando imagem…</small>}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
