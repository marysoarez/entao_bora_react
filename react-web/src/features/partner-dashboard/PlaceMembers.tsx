import { useEffect, useState, type SyntheticEvent } from "react";
import { PlaceMembershipService } from "../../core/placeMembershipService";
import type {
  PlaceMembership,
  PlaceMemberRole,
} from "../../shared/partnerPermissions";
import { useSession } from "../session";
import { usePartnerAccess } from "../partner-access/PartnerAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Message } from "../../shared/ui/Message";
import { Field } from "../../shared/ui/Field";

export function PlaceMembers({ placeId }: { placeId: string }) {
  const { user } = useSession();
  const access = usePartnerAccess();
  const allowed = access.can(placeId, "manageMembers");
  const [members, setMembers] = useState<PlaceMembership[]>([]);
  const [uid, setUid] = useState("");
  const [role, setRole] = useState<PlaceMemberRole>("employee");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    if (user && allowed)
      void PlaceMembershipService.list(placeId, user)
        .then((result) => {
          if (alive) {
            setMembers(result);
            setMessage("");
          }
        })
        .catch((error: Error) => {
          if (alive) setMessage(error.message);
        });
    return () => {
      alive = false;
    };
  }, [placeId, user, allowed, revision]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy || !allowed) return;
    setBusy(true);
    setMessage("");
    try {
      await PlaceMembershipService.save(
        placeId,
        uid.trim(),
        role,
        active,
        user,
      );
      setUid("");
      setRole("employee");
      setActive(true);
      setRevision((value) => value + 1);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <section className="partner-management-section">
      <h2>Membros do estabelecimento</h2>
      <p>
        Adicione usuários já cadastrados pelo ID. O papel vale somente para este
        estabelecimento.
      </p>
      {message && <Message>{message}</Message>}
      {members.map((member) => (
        <div className="management-row" key={member.uid}>
          <span>
            {member.uid} · {member.role} · {member.active ? "Ativo" : "Inativo"}
          </span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setUid(member.uid);
              setRole(member.role);
              setActive(member.active);
            }}
          >
            Editar vínculo
          </Button>
        </div>
      ))}
      {!members.length && (
        <p>
          Nenhum vínculo explícito cadastrado. Proprietários anteriores mantêm o
          acesso de compatibilidade.
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="event-form-fields">
          <Field label="ID do usuário">
            <Input
              required
              value={uid}
              onChange={(e) => setUid(e.target.value)}
            />
          </Field>
          <Field label="Papel">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PlaceMemberRole)}
            >
              <option value="owner">Owner — administração completa</option>
              <option value="manager">Manager — gestão operacional</option>
              <option value="employee">Employee — consulta operacional</option>
            </select>
          </Field>
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />{" "}
            Vínculo ativo
          </label>
          <Button type="submit">{busy ? "Salvando…" : "Salvar membro"}</Button>
        </fieldset>
      </form>
    </section>
  );
}
