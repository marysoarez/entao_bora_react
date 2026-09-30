import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSession } from "../../session";
import { usePartnerAccess } from "../../partner-access/PartnerAccess";
import { usePlaceModules } from "../../place-modules/usePlaceModules";
import { TablesRepository } from "../../tables/data/tablesRepository";
import type { PlaceTable } from "../../tables/model/table";
import type { User } from "../../../shared/models";
import { ServiceSessionsRepository } from "../data/serviceSessionsRepository";
import { OrdersRepository } from "../../orders/data/ordersRepository";
import { orderLocation } from "../../orders/model/order";
import { SessionAccount, type AccountState } from "../SessionAccount";
import { HistorySummary } from "../HistorySummary";
import { sessionDuration } from "../model/tableHistory";
import { sessionAccount } from "../model/sessionAccount";
import {
  serviceTypes,
  validateServiceSessionInput,
  type ServiceType,
  type ServiceSession,
  type OpenServiceSessionInput,
} from "../model/serviceSession";

const labels = {
  table: "Mesa",
  counter: "Balcão",
  lounge: "Salão",
  takeaway: "Retirada",
};
const statuses = {
  open: "Aberto",
  closed: "Encerrado",
  cancelled: "Cancelado",
};
export function SessionForm({
  tables,
  busy,
  onOpen,
}: {
  tables: PlaceTable[];
  busy: boolean;
  onOpen: (input: OpenServiceSessionInput) => Promise<void>;
}) {
  const [serviceType, setType] = useState<ServiceType>("counter");
  const [tableId, setTableId] = useState("");
  const [count, setCount] = useState("1");
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onOpen(
        validateServiceSessionInput({
          serviceType,
          tableId: serviceType === "table" ? tableId : null,
          customerCount: Number(count),
        }),
      );
      setTableId("");
      setCount("1");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir o atendimento.",
      );
    }
  }
  return (
    <form className="table-form" onSubmit={submit}>
      <h2>Abrir atendimento</h2>
      <p>
        Atendimento anônimo ou de grupo. Não é necessário identificar os
        clientes.
      </p>
      <fieldset disabled={busy}>
        <label>
          Tipo
          <select
            value={serviceType}
            onChange={(e) => {
              setType(e.target.value as ServiceType);
              setTableId("");
            }}
          >
            {serviceTypes.map((type) => (
              <option key={type} value={type}>
                {labels[type]}
              </option>
            ))}
          </select>
        </label>
        {serviceType === "table" && (
          <label>
            Mesa
            <select
              required
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
            >
              <option value="">Selecione uma mesa ativa</option>
              {tables
                .filter((table) => table.active)
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} · Nº {table.number}
                  </option>
                ))}
            </select>
          </label>
        )}
        {serviceType === "table" && !tables.some((table) => table.active) && (
          <p>
            Cadastre uma mesa ativa e habilite o módulo Mesas para este tipo de
            atendimento.
          </p>
        )}
        <label>
          Quantidade de pessoas
          <input
            type="number"
            required
            min="1"
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <button type="submit">{busy ? "Aguarde…" : "Abrir atendimento"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function SessionList({
  sessions,
  editable,
  busy,
  onFinish,
  accountState = { status: "disabled" },
  tables = [],
}: {
  sessions: ServiceSession[];
  editable: boolean;
  busy: boolean;
  onFinish: (id: string, status: "closed" | "cancelled") => void;
  accountState?: AccountState;
  tables?: PlaceTable[];
}) {
  if (!sessions.length) return <p>Nenhum atendimento encontrado.</p>;
  return (
    <ul className="table-list">
      {sessions.map((session) => {
        let accountInvalid =
          accountState.status === "loading" || accountState.status === "error";
        if (accountState.status === "ready") {
          try {
            sessionAccount(session, accountState.orders);
          } catch {
            accountInvalid = true;
          }
        }
        return (
          <li key={session.id}>
            <div>
              <h2>
                {orderLocation(session, tables)} · {statuses[session.status]}
              </h2>
              <p>Atendimento {session.id}</p>
              <p>
                {session.customerCount} pessoa(s)
                {session.tableId && ` · Mesa: ${session.tableId}`}
              </p>
              <p>Abertura: {session.openedAt.toLocaleString("pt-BR")}</p>
              <p>Origem: {session.source}</p>
              {session.closedAt && (
                <p>
                  Finalização: {session.closedAt.toLocaleString("pt-BR")} ·
                  Duração: {sessionDuration(session, +session.closedAt)}
                </p>
              )}
              <SessionAccount session={session} state={accountState} />
            </div>
            {editable && session.status === "open" && (
              <div>
                <button
                  disabled={busy || accountInvalid}
                  onClick={() => onFinish(session.id, "closed")}
                >
                  Encerrar atendimento {session.id}
                </button>
                <button
                  disabled={busy || accountInvalid}
                  onClick={() => onFinish(session.id, "cancelled")}
                >
                  Cancelar atendimento {session.id}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function Workspace({
  placeId,
  user,
  editable,
  tablesEnabled,
  ordersEnabled,
}: {
  placeId: string;
  user: User;
  editable: boolean;
  tablesEnabled: boolean;
  ordersEnabled: boolean;
}) {
  const [sessions, setSessions] = useState<ServiceSession[]>([]);
  const [tables, setTables] = useState<PlaceTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tableError, setTableError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("open");
  const [accountState, setAccountState] = useState<AccountState>({
    status: "loading",
  });
  useEffect(() => {
    if (!ordersEnabled) return;
    return OrdersRepository.watch(
      placeId,
      user,
      (orders, metadata) =>
        setAccountState(
          metadata.fromCache
            ? { status: "loading" }
            : { status: "ready", orders },
        ),
      (cause) => setAccountState({ status: "error", message: cause.message }),
    );
  }, [placeId, user, ordersEnabled]);
  useEffect(
    () =>
      ServiceSessionsRepository.watch(
        placeId,
        user,
        (rows) => {
          setSessions(rows);
          setLoading(false);
          setError("");
        },
        (cause) => {
          setSessions([]);
          setLoading(false);
          setError(cause.message);
        },
      ),
    [placeId, user],
  );
  useEffect(() => {
    if (!tablesEnabled) return;
    return TablesRepository.watch(
      placeId,
      user,
      (rows) => {
        setTables(rows);
        setTableError("");
      },
      (cause) => {
        setTables([]);
        setTableError(cause.message);
      },
    );
  }, [placeId, user, tablesEnabled]);
  async function open(input: OpenServiceSessionInput) {
    setBusy(true);
    try {
      await ServiceSessionsRepository.open(placeId, input, user);
      setFilter("open");
    } finally {
      setBusy(false);
    }
  }
  async function finish(id: string, status: "closed" | "cancelled") {
    setBusy(true);
    setError("");
    try {
      await ServiceSessionsRepository.finish(placeId, id, status, user);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível finalizar o atendimento.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {editable ? (
        <SessionForm
          tables={tablesEnabled ? tables : []}
          busy={busy || loading}
          onOpen={open}
        />
      ) : (
        <p>Seu acesso permite consultar os atendimentos.</p>
      )}
      {tablesEnabled && tableError && <p role="alert">Mesas: {tableError}</p>}
      {!loading && !error && (
        <HistorySummary
          placeId={placeId}
          sessions={sessions}
          orders={ordersEnabled ? accountState : { status: "disabled" }}
          tables={tablesEnabled ? tables : []}
        />
      )}
      <label>
        Status
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos</option>
          {Object.entries(statuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Carregando atendimentos…</p>
      ) : (
        <SessionList
          sessions={sessions.filter(
            (session) => filter === "all" || session.status === filter,
          )}
          editable={editable}
          busy={busy}
          accountState={ordersEnabled ? accountState : { status: "disabled" }}
          tables={tablesEnabled ? tables : []}
          onFinish={(id, status) => {
            void finish(id, status);
          }}
        />
      )}
    </>
  );
}
export function ServiceSessionsPage() {
  const { user } = useSession();
  const access = usePartnerAccess();
  const [params, setParams] = useSearchParams();
  const requested = params.get("placeId");
  const selected = requested
    ? access.places.find((entry) => entry.place.id === requested)
    : access.places[0];
  const placeId = selected?.place.id;
  const modules = usePlaceModules(placeId);
  if (access.loading) return <p>Carregando estabelecimentos…</p>;
  if (access.error) return <p role="alert">{access.error}</p>;
  if (!user || !placeId)
    return (
      <p role="alert">
        Estabelecimento indisponível ou sem permissão de acesso.
      </p>
    );
  return (
    <main className="tables-management">
      <Link to={`/partner-dashboard?placeId=${encodeURIComponent(placeId)}`}>
        Voltar ao painel
      </Link>
      <h1>Atendimentos</h1>
      <p>
        Uma jornada de consumo pode atender uma pessoa ou um grupo, com ou sem
        mesa.
      </p>
      <label>
        Estabelecimento
        <select
          value={placeId}
          onChange={(e) => setParams({ placeId: e.target.value })}
        >
          {access.places.map((entry) => (
            <option key={entry.place.id} value={entry.place.id}>
              {entry.place.name}
            </option>
          ))}
        </select>
      </label>
      {modules.loading ? (
        <p>Carregando módulo…</p>
      ) : modules.error ? (
        <p role="alert">{modules.error}</p>
      ) : !modules.available("serviceSessions") ? (
        <p>
          O módulo Atendimentos está desativado. O proprietário ou administrador
          pode ativá-lo nas configurações de módulos do painel.
        </p>
      ) : (
        <Workspace
          key={`${placeId}:${user.id}:${modules.available("orders")}`}
          placeId={placeId}
          user={user}
          editable={access.can(placeId, "manageServiceSessions")}
          tablesEnabled={modules.available("tables")}
          ordersEnabled={modules.available("orders")}
        />
      )}
    </main>
  );
}
