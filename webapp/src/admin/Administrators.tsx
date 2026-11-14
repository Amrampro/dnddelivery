import { useState, type FormEvent } from "react";
import { api } from "../auth/client";
import {
  Badge,
  Button,
  Card,
  Choice,
  EmptyState,
  Field,
  Select,
  Pagination,
  Skeleton,
  ErrorState,
} from "../design/ui";
import { UserLookup, type SelectedUser } from "./UserLookup";
import { ConfirmAction, type AdminAction } from "./ConfirmAction";
import { dateLabel, invitationState, type CompanyDetail } from "./types";
import type { Page, Invitation } from "./types";
import { useResource } from "./useResource";
export function Administrators({
  detail,
  reload,
  notify,
  invitationsOnly = false,
}: {
  detail: CompanyDetail;
  reload: () => void;
  notify: (m: string) => void;
  invitationsOnly?: boolean;
}) {
  const c = detail.company,
    [mode, setMode] = useState("invite"),
    [user, setUser] = useState<SelectedUser | null>(null),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [primary, setPrimary] = useState(false),
    [action, setAction] = useState<AdminAction | null>(null),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    invitations = useResource<Page<Invitation>>(
      `/admin/invitations?companyId=${c.id}&page=${page}&pageSize=15`,
    );
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "existing" && !user) {
      setError("Sélectionnez un compte existant.");
      return;
    }
    setAction({
      title:
        mode === "invite"
          ? "Inviter cet administrateur ?"
          : "Associer cet administrateur ?",
      description: `${mode === "invite" ? email : user!.email} recevra les droits d’administration de ${c.name}${primary ? " et deviendra son responsable principal" : ""}.`,
      submit: () =>
        api(
          `/admin/companies/${c.id}/admins${mode === "invite" ? "/invite" : ""}`,
          {
            method: "POST",
            body: JSON.stringify(
              mode === "invite"
                ? {
                    version: c.version,
                    email: email.trim(),
                    fullName: name,
                    primary,
                  }
                : { version: c.version, userId: user!.id, primary },
            ),
          },
        ),
    });
  }
  function inviteAction(
    id: string,
    version: number,
    kind: "resend" | "revoke",
  ) {
    setAction({
      title:
        kind === "resend"
          ? "Renvoyer cette invitation ?"
          : "Révoquer cette invitation ?",
      description:
        kind === "resend"
          ? "Un nouveau lien sera généré. Le lien précédent ne fonctionnera plus."
          : "Le lien d’activation ne pourra plus être utilisé.",
      submit: () =>
        api(`/admin/invitations/${id}/${kind}`, {
          method: "POST",
          body: JSON.stringify({ version }),
        }),
    });
  }
  return (
    <>
      {!invitationsOnly && (
        <Card title="Administrateurs associés">
          {detail.admins.length ? (
            detail.admins.map((a) => (
              <div className="admin-person" key={a.userId}>
                <div>
                  <strong>{a.user.fullName}</strong>
                  <p>{a.user.email}</p>
                  <small>Associé le {dateLabel(a.createdAt)}</small>
                  <div className="ds-actions">
                    {a.userId === c.primaryAdminUserId && (
                      <Badge tone="success">Administrateur principal</Badge>
                    )}
                    {a.user.status !== "ACTIVE" && (
                      <Badge tone="danger">Compte inactif</Badge>
                    )}
                  </div>
                </div>
                <div className="ds-actions">
                  {a.userId !== c.primaryAdminUserId && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setAction({
                          title: "Changer le responsable principal ?",
                          description: `${a.user.fullName} deviendra le responsable principal de ${c.name}.`,
                          submit: () =>
                            api(`/admin/companies/${c.id}/admins/${a.userId}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                version: c.version,
                                primary: true,
                              }),
                            }),
                        })
                      }
                    >
                      Désigner principal
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() =>
                      setAction({
                        title: "Retirer cette affiliation ?",
                        description: `${a.user.fullName} perdra ses droits d’administration sur cette entreprise. Son compte et ses autres affiliations seront conservés.`,
                        submit: () =>
                          api(`/admin/companies/${c.id}/admins/${a.userId}`, {
                            method: "DELETE",
                            body: JSON.stringify({ version: c.version }),
                          }),
                      })
                    }
                  >
                    Retirer l’accès
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Activation du responsable en attente."
              description="L’administrateur apparaîtra ici après acceptation de son invitation."
            />
          )}
        </Card>
      )}
      <Card title="Ajouter un administrateur">
        <form onSubmit={submit} className="admin-form">
          <Select
            label="Mode d’association"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="invite">Inviter un nouvel utilisateur</option>
            <option value="existing">Associer un utilisateur existant</option>
          </Select>
          {mode === "existing" ? (
            <UserLookup selected={user} onSelect={setUser} />
          ) : (
            <div className="ds-form-grid">
              <Field
                label="Nom complet"
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Field
                label="Adresse e-mail"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
          <Choice
            label="Désigner comme administrateur principal"
            checked={primary}
            onChange={(e) => setPrimary(e.target.checked)}
          />
          {error && (
            <p role="alert" className="ds-error-text">
              {error}
            </p>
          )}
          <Button type="submit">
            {mode === "invite"
              ? "Préparer l’invitation"
              : "Préparer l’association"}
          </Button>
        </form>
      </Card>
      <Card title="Invitations de cette entreprise">
        {invitations.error ? (
          <ErrorState message={invitations.error} retry={invitations.reload} />
        ) : !invitations.data ? (
          <Skeleton />
        ) : invitations.data.items.length ? (
          invitations.data.items.map((i) => (
            <div className="admin-person" key={i.id}>
              <div>
                <strong>{i.fullName}</strong>
                <p>{i.email}</p>
                <div className="ds-actions">
                  <Badge>{invitationState(i)}</Badge>
                  <Badge
                    tone={
                      i.deliveryStatus === "FAILED"
                        ? "danger"
                        : i.deliveryStatus === "SENT"
                          ? "success"
                          : "warning"
                    }
                  >
                    {i.deliveryStatus === "SENT"
                      ? "E-mail envoyé"
                      : i.deliveryStatus === "FAILED"
                        ? "Envoi échoué"
                        : "Envoi en attente"}
                  </Badge>
                  {i.isPrimary && <Badge>Principal prévu</Badge>}
                </div>
                <small>Expiration : {dateLabel(i.expiresAt)}</small>
              </div>
              {!i.acceptedAt && !i.revokedAt && (
                <div className="ds-actions">
                  <Button
                    variant="secondary"
                    onClick={() => inviteAction(i.id, i.version, "resend")}
                  >
                    Renvoyer
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => inviteAction(i.id, i.version, "revoke")}
                  >
                    Révoquer
                  </Button>
                </div>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            title="Aucune invitation."
            description="Invitez un administrateur ou associez un compte existant."
          />
        )}
        {invitations.data && (
          <Pagination
            page={page}
            pages={Math.ceil(invitations.data.total / 15)}
            onChange={setPage}
          />
        )}
      </Card>
      {action && (
        <ConfirmAction
          action={action}
          close={() => setAction(null)}
          done={(m) => {
            notify(m);
            reload();
          }}
        />
      )}
    </>
  );
}
