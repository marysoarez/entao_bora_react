import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { usePlaceModules } from "../place-modules/usePlaceModules";
import { useSession } from "../session";
import { NotificationsRepository } from "./data/notificationsRepository";
import type { NotificationCampaign } from "./model/notification";

const labels = {
  draft: "Rascunho",
  queued: "Agendada",
  sent: "Enviada",
  cancelled: "Cancelada",
};

export function NotificationsPage() {
  const [params] = useSearchParams();
  const placeId = params.get("placeId");
  const { user } = useSession();
  const access = usePartnerAccess();
  const modules = usePlaceModules(placeId);
  const moduleAvailable = modules.available("notifications");
  const canManage = !!placeId && access.can(placeId, "manageCampaigns");
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!placeId || !moduleAvailable || !canManage) return;
    return NotificationsRepository.watchCampaigns(
      placeId,
      setCampaigns,
      (cause) => setError(cause.message),
    );
  }, [placeId, moduleAvailable, canManage]);

  if (!placeId) return <p>Escolha um estabelecimento no dashboard.</p>;
  if (access.loading || modules.loading) return <p>Carregando notificações…</p>;
  if (!canManage)
    return <p>Somente o proprietário pode gerenciar campanhas.</p>;
  if (!moduleAvailable)
    return (
      <p>
        O módulo de notificações não está habilitado para este estabelecimento.
      </p>
    );

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await NotificationsRepository.createDraft(
        placeId!,
        { title, body },
        user,
      );
      setTitle("");
      setBody("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ENGAJAMENTO</span>
          <h1>Notificações</h1>
          <p>
            Campanhas e novidades, separadas dos avisos transacionais de eventos
            e pedidos.
          </p>
        </div>
        <Link to={`/partner-dashboard?placeId=${encodeURIComponent(placeId)}`}>
          Voltar ao dashboard
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
      <form className="table-form" onSubmit={submit}>
        <h2>Novo rascunho de campanha</h2>
        <p>
          O aplicativo salva apenas rascunhos. O envio futuro será feito por
          serviço autorizado, considerando o consentimento de marketing de cada
          usuário.
        </p>
        <label>
          Título
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Mensagem
          <textarea
            required
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button disabled={busy}>
          {busy ? "Salvando…" : "Salvar rascunho"}
        </button>
      </form>
      <h2>Campanhas</h2>
      <div className="management-list">
        {campaigns.map((campaign) => (
          <article className="management-row" key={campaign.id}>
            <div>
              <h3>{campaign.title}</h3>
              <p>{campaign.body}</p>
              <small>{labels[campaign.status]}</small>
            </div>
            {campaign.status === "draft" && (
              <button
                onClick={() =>
                  NotificationsRepository.cancelDraft(
                    placeId,
                    campaign.id,
                  ).catch((cause) => setError(cause.message))
                }
              >
                Cancelar
              </button>
            )}
          </article>
        ))}
        {!campaigns.length && <p>Nenhuma campanha cadastrada.</p>}
      </div>
    </section>
  );
}
