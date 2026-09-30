import { useEffect, useState } from "react";
import type { User } from "../../../shared/models";
import type { PlaceTable } from "../../tables/model/table";
import { usePlaceModules } from "../../place-modules/usePlaceModules";
import { ServiceSessionsRepository } from "../data/serviceSessionsRepository";
import type { ServiceSession } from "../model/serviceSession";
import { sessionDuration, tableHistory } from "../model/tableHistory";

export function TableHistoryView({
  table,
  sessions,
  now,
}: {
  table: PlaceTable;
  sessions: ServiceSession[];
  now: number;
}) {
  const rows = tableHistory(sessions, table.id);
  const open = rows.filter((session) => session.status === "open");
  const past = rows.filter((session) => session.status !== "open");
  const render = (session: ServiceSession) => (
    <li key={session.id}>
      <p>
        Atendimento {session.id} · {session.customerCount} pessoas
      </p>
      <p>Abertura: {session.openedAt.toLocaleString("pt-BR")}</p>
      <p>
        {session.closedAt
          ? `Encerramento: ${session.closedAt.toLocaleString("pt-BR")} · Duração: ${sessionDuration(session, now)}`
          : `Aberta há ${sessionDuration(session, now)}`}
      </p>
      <p>
        Aberto por: {session.openedBy} · Encerrado por:{" "}
        {session.closedBy ?? "—"}
      </p>
      {session.status === "cancelled" && <p>Cancelado</p>}
    </li>
  );
  return (
    <section>
      <h3>
        {table.name} · Nº {table.number}
      </h3>
      <h4>Agora</h4>
      {open.length ? (
        <ul>{open.map(render)}</ul>
      ) : (
        <p>{table.active ? "Disponível" : "Mesa desativada"}</p>
      )}
      {open.length > 1 && (
        <p role="alert">
          Existem ocupações antigas conflitantes. Finalize os atendimentos antes
          de abrir outro.
        </p>
      )}
      <h4>Histórico</h4>
      {past.length ? (
        <ul>{past.map(render)}</ul>
      ) : (
        <p>Nenhum atendimento finalizado.</p>
      )}
    </section>
  );
}
export function TableHistory({
  placeId,
  tables,
  user,
}: {
  placeId: string;
  tables: PlaceTable[];
  user: User;
}) {
  const modules = usePlaceModules(placeId);
  const enabled = modules.available("serviceSessions");
  const [sessions, setSessions] = useState<ServiceSession[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    return ServiceSessionsRepository.watch(
      placeId,
      user,
      (rows) => {
        setSessions(rows);
        setError("");
      },
      (cause) => {
        setSessions(null);
        setError(cause.message);
      },
    );
  }, [placeId, user, enabled]);
  if (modules.loading) return <p>Carregando ocupação…</p>;
  if (modules.error || error)
    return <p role="alert">{modules.error || error}</p>;
  if (!enabled)
    return (
      <p>Ative o módulo Atendimentos para consultar ocupação e histórico.</p>
    );
  if (!sessions) return <p>Carregando ocupação e histórico…</p>;
  return (
    <section>
      <h2>Ocupação e histórico</h2>
      {tables.map((table) => (
        <TableHistoryView
          key={table.id}
          table={table}
          sessions={sessions}
          now={now}
        />
      ))}
    </section>
  );
}
