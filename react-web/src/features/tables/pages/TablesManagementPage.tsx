import { useEffect, useState, type SubmitEvent } from "react";
import { TableHistory } from "../../service-sessions/pages/TableHistory";
import { Link, useSearchParams } from "react-router-dom";
import { useSession } from "../../session";
import { usePartnerAccess } from "../../partner-access/PartnerAccess";
import { usePlaceModules } from "../../place-modules/usePlaceModules";
import type { User } from "../../../shared/models";
import { TablesRepository } from "../data/tablesRepository";
import { QrManagementPanel } from "../../qr/QrManagementPanel";
import {
  validateTable,
  type PlaceTable,
  type TableInput,
} from "../model/table";

export function TableForm({
  table,
  busy,
  onSave,
  onCancel,
}: {
  table?: PlaceTable;
  busy: boolean;
  onSave: (input: TableInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [number, setNumber] = useState(String(table?.number ?? 1));
  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [active, setActive] = useState(table?.active ?? true);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onSave(
        validateTable({
          number: Number(number),
          name,
          capacity: Number(capacity),
          active,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a mesa.",
      );
    }
  }
  return (
    <form onSubmit={submit} className="table-form">
      <h2>{table ? "Editar mesa" : "Criar mesa"}</h2>
      <fieldset disabled={busy}>
        <label>
          Número
          <input
            required
            type="number"
            min="1"
            step="1"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        <label>
          Nome (opcional)
          <input
            maxLength={100}
            value={name}
            placeholder="Mesa 05"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Capacidade (pessoas)
          <input
            required
            type="number"
            min="1"
            step="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{" "}
          Mesa ativa
        </label>
        <button type="submit">{busy ? "Salvando…" : "Salvar mesa"}</button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function TableList({
  tables,
  editable,
  busy,
  onEdit,
  onToggle,
}: {
  tables: PlaceTable[];
  editable: boolean;
  busy: boolean;
  onEdit: (table: PlaceTable) => void;
  onToggle: (table: PlaceTable) => void;
}) {
  if (!tables.length)
    return <p>Nenhuma mesa cadastrada neste estabelecimento.</p>;
  return (
    <ul className="table-list">
      {tables.map((table) => (
        <li key={table.id}>
          <div>
            <h2>{table.name}</h2>
            <p>
              Número {table.number} · Capacidade: {table.capacity} pessoas
            </p>
            <span>{table.active ? "Ativa" : "Desativada"}</span>
          </div>
          {editable && (
            <div>
              <button disabled={busy} onClick={() => onEdit(table)}>
                Editar {table.name}
              </button>
              <button disabled={busy} onClick={() => onToggle(table)}>
                {table.active ? "Desativar" : "Ativar"} {table.name}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function TablesWorkspace({
  placeId,
  user,
  editable,
  placeSlug,
  qrEnabled,
}: {
  placeId: string;
  user: User;
  editable: boolean;
  placeSlug: string;
  qrEnabled: boolean;
}) {
  const [tables, setTables] = useState<PlaceTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlaceTable | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      TablesRepository.watch(
        placeId,
        user,
        (rows) => {
          setTables(rows);
          setLoading(false);
          setError("");
        },
        (cause) => {
          setTables([]);
          setError(cause.message);
          setLoading(false);
        },
      ),
    [placeId, user],
  );
  async function save(input: TableInput) {
    setBusy(true);
    try {
      await TablesRepository.save(
        placeId,
        input,
        user,
        editing && editing !== "new" ? editing.id : undefined,
      );
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(table: PlaceTable) {
    setBusy(true);
    setError("");
    try {
      await TablesRepository.setActive(placeId, table.id, !table.active, user);
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar a mesa.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {editable ? (
        <button disabled={busy || loading} onClick={() => setEditing("new")}>
          Nova mesa
        </button>
      ) : (
        <p>Seu acesso permite consultar as mesas.</p>
      )}
      {editable && editing && (
        <TableForm
          key={editing === "new" ? "new" : editing.id}
          table={editing === "new" ? undefined : editing}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Carregando mesas…</p>
      ) : (
        <TableList
          tables={tables}
          editable={editable}
          busy={busy}
          onEdit={setEditing}
          onToggle={(table) => {
            void toggle(table);
          }}
        />
      )}
      {!loading && !error && <TableHistory placeId={placeId} tables={tables} user={user} />}
      {!loading && !error && (qrEnabled ?
        <QrManagementPanel slug={placeSlug} tables={tables} general={false} /> :
        <p>Habilite Atendimentos, Cardápio e Pedidos para disponibilizar os QR Codes das mesas.</p>)}
    </>
  );
}

export function TablesManagementPage() {
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
      <h1>Mesas</h1>
      <p>
        Cadastre os recursos físicos do estabelecimento. Ativar uma mesa
        disponibiliza seu cadastro; não indica ocupação.
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
      ) : !modules.available("tables") ? (
        <p>
          O módulo Mesas está desativado. O proprietário ou administrador pode
          ativá-lo nas configurações de módulos do painel.
        </p>
      ) : (
        <TablesWorkspace
          key={`${placeId}:${user.id}`}
          placeId={placeId}
          user={user}
          editable={access.can(placeId, "manageTables")}
          placeSlug={selected.place.slug}
          qrEnabled={modules.available("serviceSessions") && modules.available("menu") && modules.available("orders")}
        />
      )}
    </main>
  );
}
