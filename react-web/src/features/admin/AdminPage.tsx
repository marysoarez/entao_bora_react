import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminService, type AdminPlace } from "../../core/adminService";
import {
  paidFeatures,
  type EntitlementStatus,
  type PaidFeature,
} from "../../shared/placeEntitlements";
import { placeModuleCatalog } from "../../shared/placeModules";
import type { User, UserRole } from "../../shared/models";
import { useSession } from "../session";
import { Message } from "../../shared/ui/Message";

type Section = "overview" | "places" | "users" | "plans";
const featureLabels: Record<PaidFeature, string> = {
  notifications: "Notificações",
  tables: "Mesas",
  orders: "Pedidos",
  inventory: "Estoque",
  purchases: "Compras",
  advancedAnalytics: "Analytics avançado",
};
const statuses: EntitlementStatus[] = [
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "expired",
];
const validEntitlement = (place: AdminPlace) =>
  place.entitlementExists &&
  ["active", "trialing"].includes(place.entitlements.status) &&
  (!place.entitlements.validUntil ||
    place.entitlements.validUntil > new Date());

export function AdminPage() {
  const { user } = useSession();
  const [section, setSection] = useState<Section>("overview");
  const [users, setUsers] = useState<User[]>([]);
  const [places, setPlaces] = useState<AdminPlace[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const [nextUsers, nextPlaces] = await Promise.all([
        AdminService.listUsers(),
        AdminService.listPlaces(),
      ]);
      setUsers(nextUsers);
      setPlaces(nextPlaces);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  // The initial request intentionally runs once; reloads are explicit after mutations.
  // oxlint-disable-next-line react-hooks/exhaustive-deps, react/react-compiler
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler
    void load();
  }, []);

  const selectedPlace = places.find((place) => place.id === selected) ?? null;
  const filteredPlaces = places.filter((place) =>
    place.name.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredUsers = users.filter((entry) =>
    `${entry.name} ${entry.email ?? ""} ${entry.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const memberships = useMemo(
    () =>
      new Map(
        users.map((entry) => [
          entry.id,
          places.flatMap((place) => {
            const explicit = place.members
              .filter((member) => member.uid === entry.id)
              .map((member) => ({ place, member }));
            return explicit.length || place.ownerId !== entry.id
              ? explicit
              : [
                  {
                    place,
                    member: {
                      uid: entry.id,
                      placeId: place.id,
                      role: "owner" as const,
                      active: true,
                      createdAt: null,
                    },
                  },
                ];
          }),
        ]),
      ),
    [users, places],
  );

  async function saveEntitlements(place: AdminPlace) {
    const summary =
      `${place.entitlements.planKey} · ${place.entitlements.status}\n` +
      paidFeatures
        .filter((f) => place.entitlements.features[f])
        .map((f) => featureLabels[f])
        .join(", ");
    if (
      !window.confirm(
        `Confirme a alteração comercial para ${place.name}:\n\n${summary || "Nenhuma funcionalidade"}`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await AdminService.updateEntitlements(place.id, {
        planKey: place.entitlements.planKey,
        status: place.entitlements.status,
        validUntil: place.entitlements.validUntil?.toISOString() ?? null,
        features: place.entitlements.features,
      });
      setMessage("Plano e funcionalidades atualizados com sucesso.");
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(entry: User, role: UserRole, active: boolean) {
    const changesAdmin = entry.role === "admin" || role === "admin";
    const phrase = changesAdmin
      ? window.prompt(
          `A alteração de administrador é sensível. Digite o UID para confirmar:\n${entry.id}`,
        )
      : window.confirm(
            `Confirmar ${active ? "ativação" : "desativação"} de ${entry.name || entry.id}?`,
          )
        ? entry.id
        : null;
    if (phrase !== entry.id) return;
    setBusy(true);
    setMessage("");
    try {
      await AdminService.updateUser(entry.id, active, role, phrase);
      setMessage("Usuário atualizado com sucesso.");
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Message>Carregando administração…</Message>;
  const metrics = [
    ["Estabelecimentos", places.length],
    ["Estabelecimentos ativos", places.filter((p) => p.active).length],
    ["Usuários", users.length],
    [
      "Parceiros / owners",
      new Set([
        ...users.filter((u) => u.role === "partner").map((u) => u.id),
        ...places.flatMap((p) => [
          p.ownerId,
          ...p.members
            .filter((m) => m.role === "owner" && m.active)
            .map((m) => m.uid),
        ]),
      ]).size,
    ],
    [
      "Plano ativo",
      places.filter(
        (p) => p.entitlements.status === "active" && validEntitlement(p),
      ).length,
    ],
    [
      "Em trial",
      places.filter(
        (p) => p.entitlements.status === "trialing" && validEntitlement(p),
      ).length,
    ],
    [
      "Sem entitlement ativo",
      places.filter((p) => !validEntitlement(p)).length,
    ],
  ] as const;
  return (
    <div className="admin-page">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={14} /> ADMINISTRAÇÃO GLOBAL
          </span>
          <h1>Painel administrativo</h1>
          <p>
            Usuários, estabelecimentos e concessões comerciais em um só lugar.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          Atualizar
        </Button>
      </header>
      {message && <Message>{message}</Message>}
      <nav className="admin-tabs" aria-label="Áreas administrativas">
        {(
          [
            ["overview", "Visão geral", LayoutDashboard],
            ["places", "Estabelecimentos", Building2],
            ["users", "Usuários", Users],
            ["plans", "Planos e módulos", ShieldCheck],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={section === id ? "selected" : ""}
            onClick={() => {
              setSection(id);
              setQuery("");
              setSelected(null);
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      {section === "overview" && (
        <>
          <div className="admin-metrics">
            {metrics.map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <div className="admin-shortcuts">
            <button onClick={() => setSection("users")}>
              <Users />
              Usuários
            </button>
            <button onClick={() => setSection("places")}>
              <Building2 />
              Estabelecimentos
            </button>
            <button onClick={() => setSection("plans")}>
              <ShieldCheck />
              Planos e módulos
            </button>
          </div>
        </>
      )}
      {(section === "places" || section === "plans") && (
        <section className="admin-section">
          <div className="admin-search">
            <Search size={17} />
            <Input
              aria-label="Pesquisar estabelecimento"
              placeholder="Pesquisar por nome"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {!selectedPlace ? (
            <div className="admin-list">
              {filteredPlaces.map((place) => (
                <button key={place.id} onClick={() => setSelected(place.id)}>
                  <span>
                    <strong>{place.name}</strong>
                    <small>
                      {place.id} · {place.active ? "Ativo" : "Inativo"}
                    </small>
                  </span>
                  <span>
                    {place.entitlements.planKey} · {place.entitlements.status}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <PlaceAdminDetail
              place={selectedPlace}
              users={users}
              busy={busy}
              update={setPlaces}
              save={saveEntitlements}
              close={() => setSelected(null)}
            />
          )}
        </section>
      )}
      {section === "users" && (
        <section className="admin-section">
          <div className="admin-search">
            <Search size={17} />
            <Input
              aria-label="Pesquisar usuário"
              placeholder="Nome, e-mail ou UID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="admin-user-list">
            {filteredUsers.map((entry) => (
              <UserRow
                key={entry.id}
                entry={entry}
                ownUid={user!.id}
                links={memberships.get(entry.id) ?? []}
                busy={busy}
                save={saveUser}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlaceAdminDetail({
  place,
  users,
  busy,
  update,
  save,
  close,
}: {
  place: AdminPlace;
  users: User[];
  busy: boolean;
  update: React.Dispatch<React.SetStateAction<AdminPlace[]>>;
  save: (p: AdminPlace) => void;
  close: () => void;
}) {
  const change = (next: AdminPlace) =>
    update((all) => all.map((item) => (item.id === next.id ? next : item)));
  const owners = new Set([
    place.ownerId,
    ...place.members
      .filter((m) => m.role === "owner" && m.active)
      .map((m) => m.uid),
  ]);
  const name = (uid: string) => users.find((u) => u.id === uid)?.name || uid;
  return (
    <div className="admin-detail">
      <Button variant="ghost" onClick={close}>
        ← Voltar
      </Button>
      <div className="section-title">
        <div>
          <h2>{place.name}</h2>
          <p>{place.id}</p>
        </div>
        <Link to={`/place/${place.slug || place.id}`}>Ver página pública</Link>
      </div>
      <div className="admin-detail-grid">
        <article>
          <h3>Owners</h3>
          {[...owners].map((uid) => (
            <p key={uid}>{name(uid)}</p>
          ))}
        </article>
        <article>
          <h3>Membros</h3>
          {place.members.map((m) => (
            <p key={m.uid}>
              {name(m.uid)} · {m.role} · {m.active ? "ativo" : "inativo"}
            </p>
          ))}
        </article>
      </div>
      <section className="admin-entitlements">
        <h2>Plano e funcionalidades</h2>
        <div className="form-grid">
          <label htmlFor="admin-plan-key">Plan key</label>
          <Input
            id="admin-plan-key"
            value={place.entitlements.planKey}
            onChange={(e) =>
              change({
                ...place,
                entitlements: {
                  ...place.entitlements,
                  planKey: e.target.value,
                },
              })
            }
          />
          <label htmlFor="admin-plan-status">Status</label>
          <select
            id="admin-plan-status"
            value={place.entitlements.status}
            onChange={(e) =>
              change({
                ...place,
                entitlements: {
                  ...place.entitlements,
                  status: e.target.value as EntitlementStatus,
                },
              })
            }
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label htmlFor="admin-plan-validity">Validade</label>
          <Input
            id="admin-plan-validity"
            type="date"
            value={
              place.entitlements.validUntil?.toISOString().slice(0, 10) ?? ""
            }
            onChange={(e) =>
              change({
                ...place,
                entitlements: {
                  ...place.entitlements,
                  validUntil: e.target.value
                    ? new Date(`${e.target.value}T23:59:59.999`)
                    : null,
                },
              })
            }
          />
        </div>
        <div className="admin-feature-grid">
          {paidFeatures.map((feature) => (
            <label key={feature} aria-label={featureLabels[feature]}>
              <input
                type="checkbox"
                checked={place.entitlements.features[feature]}
                onChange={(e) =>
                  change({
                    ...place,
                    entitlements: {
                      ...place.entitlements,
                      features: {
                        ...place.entitlements.features,
                        [feature]: e.target.checked,
                      },
                    },
                  })
                }
              />
              <span>
                <strong>{featureLabels[feature]}</strong>
                <small>Liberado pelo plano</small>
              </span>
            </label>
          ))}
        </div>
        <h3>Ativação operacional</h3>
        <p className="subtle">
          Somente leitura aqui. O estabelecimento ativa módulos separadamente na
          área do parceiro.
        </p>
        <div className="admin-feature-grid">
          {placeModuleCatalog.map((module) => (
            <label
              key={module.id}
              className="read-only"
              aria-label={module.label}
            >
              <input
                type="checkbox"
                checked={
                  module.alwaysEnabled || place.modules.enabled[module.id]
                }
                readOnly
              />
              <span>
                <strong>{module.label}</strong>
                <small>
                  {module.availability === "planned"
                    ? "Ainda não implementado"
                    : module.alwaysEnabled
                      ? "Sempre disponível"
                      : "Ativado pelo estabelecimento"}
                </small>
              </span>
            </label>
          ))}
        </div>
        <Button
          disabled={busy || !place.entitlements.planKey.trim()}
          onClick={() => save(place)}
        >
          {busy ? "Salvando…" : "Revisar e salvar alteração"}
        </Button>
      </section>
    </div>
  );
}

function UserRow({
  entry,
  ownUid,
  links,
  busy,
  save,
}: {
  entry: User;
  ownUid: string;
  links: { place: AdminPlace; member: AdminPlace["members"][number] }[];
  busy: boolean;
  save: (u: User, r: UserRole, a: boolean) => void;
}) {
  const [role, setRole] = useState(entry.role),
    [active, setActive] = useState(entry.active);
  return (
    <article>
      <div>
        <strong>{entry.name || "Sem nome"}</strong>
        <p>
          {entry.email || "Sem e-mail"} · {entry.id}
        </p>
        <small>
          {links.length
            ? links
                .map(
                  ({ place, member }) =>
                    `${place.name} (${member.role}${member.active ? "" : " inativo"})`,
                )
                .join(" · ")
            : "Sem membership explícita"}
        </small>
      </div>
      <div className="admin-user-actions">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="user">user</option>
          <option value="partner">partner</option>
          <option value="admin">admin</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{" "}
          Ativo
        </label>
        <Button
          variant="outline"
          disabled={
            busy ||
            (entry.id === ownUid && (!active || role !== "admin")) ||
            (role === entry.role && active === entry.active)
          }
          onClick={() => save(entry, role, active)}
        >
          Salvar
        </Button>
      </div>
    </article>
  );
}
