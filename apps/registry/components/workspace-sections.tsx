"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Frame } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { SecretReveal } from "@/components/secret-reveal";
import { useBusy } from "@/lib/use-busy";
import { AuditList } from "@/components/audit-list";
import { ImportReport } from "@/components/import-report";
import type { ImportPreview } from "@/lib/model";
import { AUDIT_GROUPS } from "@/lib/audit";
import Link from "next/link";
import { templateHref } from "@/lib/sections";
import { humanize } from "@/lib/schema";
import { messageOf, when } from "@/lib/format";
import { INVITABLE_ROLES, KINDS, canAdmin, canWrite, kindLabel, type Kind, type Member, type Predicate, type Role, type Template, type TokenSummary } from "@/lib/model";
import { useRegistry } from "@/lib/registry";
import { RowSkeletons, recipes } from "@/components/kit";

export function AuditSection({ workspaceId }: { workspaceId: string }) {
  const [group, setGroup] = useState("all");
  const prefix = AUDIT_GROUPS.find((item) => item.id === group)?.prefix;
  return (
    <Frame title="Audit" backHref={`/w/${workspaceId}`}>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter events">
        {AUDIT_GROUPS.map((item) => (
          <button key={item.id} type="button" aria-pressed={group === item.id} className={recipes.chip({ on: group === item.id, animated: true })} onClick={() => setGroup(item.id)}>{item.label}</button>
        ))}
      </div>
      <AuditList workspaceId={workspaceId} query={prefix ? { actionPrefix: prefix } : {}} empty={prefix ? "No events of this kind yet." : "No recent audit events."} />
    </Frame>
  );
}

export function OntologySection({ workspaceId }: { workspaceId: string }) {
  const { api, session } = useRegistry();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fromKinds, setFromKinds] = useState<Kind[]>(["person"]);
  const [toKinds, setToKinds] = useState<Kind[]>(["object"]);
  const [busy, run] = useBusy();

  async function load() {
    const [nextTemplates, nextPredicates, member] = await Promise.all([
      api.templates(workspaceId),
      api.predicates(workspaceId),
      session ? api.membership(workspaceId, session.id) : Promise.resolve(null),
    ]);
    setTemplates(nextTemplates);
    setPredicates(nextPredicates);
    setRole(member?.role ?? null);
  }
  useEffect(() => { void load().catch((error) => toast.error(messageOf(error))); }, [workspaceId, session?.id]);

  async function savePredicate(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      try {
        await api.upsertPredicate({ workspace_id: workspaceId, name: name.trim(), description, directed: true, from_kinds: fromKinds, to_kinds: toKinds });
        toast.success("Predicate saved");
        await load();
      } catch (error) {
        toast.error(messageOf(error));
      }
    });
  }

  return (
    <Frame title="Ontology" backHref={`/w/${workspaceId}`}>
      <p className={recipes.join("mb-4", recipes.text.intro)}>Types and predicates are workspace-configurable. Existing records are not rewritten when a template changes.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={recipes.panel.md}>
          <h2 className="font-medium">Templates</h2>
          <ul className="mt-3 grid gap-1">
            {templates.map((item) => (
              <li key={item.kind + item.type}>
                <Link href={templateHref(workspaceId, item.kind, item.type)} className={recipes.listLink}>
                  <span>{kindLabelSafe(item.kind)} · <span className="font-medium">{item.type}</span></span>
                  <span className="text-xs text-muted-foreground">{item.fields.length} field{item.fields.length === 1 ? "" : "s"} · v{item.version}</span>
                </Link>
              </li>
            ))}
            {templates.length === 0 && <li className="text-sm text-muted-foreground">No templates yet. A record needs a template for its kind and type.</li>}
          </ul>
          {canAdmin(role) && (
            <Link href={templateHref(workspaceId)} className={recipes.join("mt-4", recipes.pill.md, recipes.cta.inline)}>New template</Link>
          )}
        </section>
        <section className={recipes.panel.md}>
          <h2 className="font-medium">Predicates</h2>
          <ul className="mt-3 grid gap-2">
            {predicates.map((item) => (
              <li key={item.name} className="flex items-start justify-between gap-3 text-sm">
                <span><span className="font-medium">{item.name}</span> · {item.from_kinds.join(", ")} → {item.to_kinds.join(", ")}<br /><span className="text-muted-foreground">{item.description}</span></span>
                {canAdmin(role) && (
                  <ConfirmButton
                    label="Delete"
                    className="h-auto rounded-full px-2 py-0 text-muted-foreground"
                    title={`Delete the predicate ${item.name}?`}
                    description="This cannot be undone. A predicate that existing relations still use cannot be deleted."
                    confirmLabel="Delete predicate"
                    onConfirm={async () => {
                      try {
                        await api.deletePredicate(workspaceId, item.name);
                        toast.success("Predicate deleted");
                        await load();
                      } catch (error) {
                        toast.error(messageOf(error));
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {canAdmin(role) && (
            <form className="mt-4 grid gap-2" onSubmit={savePredicate}>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="name" required className={recipes.field.md} />
              <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="description" required className={recipes.field.md} />
              <KindPicks label="From" value={fromKinds} onChange={setFromKinds} />
              <KindPicks label="To" value={toKinds} onChange={setToKinds} />
              <Button type="submit" disabled={busy} className={recipes.pill.md}>Save predicate</Button>
            </form>
          )}
        </section>
      </div>
    </Frame>
  );
}

function KindPicks({ label, value, onChange }: { label: string; value: Kind[]; onChange: (next: Kind[]) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((item) => {
          const on = value.includes(item.id);
          return <button key={item.id} type="button" className={recipes.chip({ on, surface: "secondary", size: "sm" })} onClick={() => onChange(on ? value.filter((kind) => kind !== item.id) : [...value, item.id])}>{item.singular}</button>;
        })}
      </div>
    </div>
  );
}

function kindLabelSafe(kind: string) {
  return kindLabel(kind);
}

export function MembersSection({ workspaceId }: { workspaceId: string }) {
  const { api, session } = useRegistry();
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [token, setToken] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [personId, setPersonId] = useState("");
  const [busy, run] = useBusy();

  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [rows, mine] = await Promise.all([
      api.members(workspaceId),
      session ? api.membership(workspaceId, session.id) : Promise.resolve(null),
    ]);
    setMembers(rows);
    setRole(mine?.role ?? null);
    setLoaded(true);
  }
  useEffect(() => { void load().catch((error) => toast.error(messageOf(error))); }, [workspaceId, session?.id]);

  return (
    <Frame title="Members" backHref={`/w/${workspaceId}`}>
      <p className={recipes.join("mb-4", recipes.text.intro)}>Editors see only their own membership. Owners and admins see the workspace.</p>
      {!loaded && <RowSkeletons count={2} shape="item" label="Loading members" />}
      <ul className="grid gap-2">
        {members.map((member) => {
          const self = member.user_id === session?.id;
          // The database does not expose other members' emails; fall back to a short id.
          const who = self ? session?.email ?? "You" : member.email ?? `Member ${member.user_id.slice(0, 8)}`;
          const manageable = canAdmin(role) && member.role !== "owner" && !self;
          return (
          <li key={member.user_id} className={recipes.join(recipes.row.split, "flex-wrap gap-3")}>
            {/* At least 12rem for who and role; the actions wrap below on narrow screens. */}
            <div className="min-w-48 flex-1">
              <p className="truncate font-medium">{who}{self ? <span className="font-normal text-muted-foreground"> · you</span> : null}</p>
              {manageable ? (
                <select
                  aria-label={`Role for ${who}`}
                  className={recipes.join(recipes.select.sm, "mt-1 capitalize")}
                  value={member.role}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value as Role;
                    void run(async () => {
                      try {
                        await api.updateRole(workspaceId, member.user_id, next);
                        toast.success(`${who} is now ${next === "admin" ? "an" : "a"} ${next}`);
                        await load();
                      } catch (error) {
                        toast.error(messageOf(error));
                      }
                    });
                  }}
                >
                  {INVITABLE_ROLES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </select>
              ) : (
                <p className="text-sm capitalize text-muted-foreground">{member.role}</p>
              )}
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
            {role === "owner" && !self && (
              <ConfirmButton
                label="Make owner"
                title={`Make ${who} the owner?`}
                description="They get full control of this workspace, including settings and every member. You become an admin, and only the new owner can make you owner again."
                confirmLabel="Transfer ownership"
                onConfirm={async () => {
                  try {
                    await api.transferOwner(workspaceId, member.user_id);
                    toast.success(`${who} is now the owner`);
                    await load();
                  } catch (error) {
                    toast.error(messageOf(error));
                  }
                }}
              />
            )}
            {manageable && (
              <ConfirmButton
                label="Remove"
                title={`Remove ${who}?`}
                description="They lose access to this workspace right away, including any access tokens they issued here. To return they need a new invitation."
                confirmLabel="Remove member"
                onConfirm={async () => {
                  try {
                    await api.removeMember(workspaceId, member.user_id);
                    toast.success("Member removed");
                    await load();
                  } catch (error) {
                    toast.error(messageOf(error));
                  }
                }}
              />
            )}
            </div>
          </li>
          );
        })}
      </ul>
      {canAdmin(role) && (
        <form className="mt-6 grid max-w-lg gap-2" onSubmit={async (event) => {
          event.preventDefault();
          await run(async () => {
            try {
              const result = await api.invite(workspaceId, email, inviteRole);
              setIssued(result.token);
              setEmail("");
              toast.success("Invitation created");
            } catch (error) {
              toast.error(messageOf(error));
            }
          });
        }}>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="Email" className={recipes.field.md} />
          <select className={recipes.select.md} value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
            {INVITABLE_ROLES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </select>
          <Button type="submit" disabled={busy} className={recipes.pill.md}>Invite</Button>
          {issued && <SecretReveal secret={issued} what="invitation token" onDone={() => setIssued(null)} />}
        </form>
      )}
      <form className="mt-8 grid max-w-lg gap-2" onSubmit={async (event) => {
        event.preventDefault();
        await run(async () => {
          try {
            await api.acceptInvitation(token.trim());
            setToken("");
            toast.success("Invitation accepted");
            await load();
          } catch (error) {
            toast.error(messageOf(error));
          }
        });
      }}>
        <p className="text-sm font-medium">Accept an invitation</p>
        <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="egi_…" className={recipes.field.md} />
        <Button type="submit" variant="secondary" disabled={busy} className={recipes.pill.md}>Accept</Button>
      </form>
      {canAdmin(role) && session && (
        <form className="mt-8 grid max-w-lg gap-2" onSubmit={async (event) => {
          event.preventDefault();
          await run(async () => {
            try {
              await api.linkPerson(workspaceId, session.id, personId.trim());
              toast.success("Linked to a person record");
            } catch (error) {
              toast.error(messageOf(error));
            }
          });
        }}>
          <p className="text-sm font-medium">Link your login to a person</p>
          <Input value={personId} onChange={(event) => setPersonId(event.target.value)} placeholder="Person record id" className={recipes.field.md} />
          <Button type="submit" variant="secondary" disabled={busy} className={recipes.pill.md}>Link</Button>
        </form>
      )}
    </Frame>
  );
}

export function ExchangeSection({ workspaceId }: { workspaceId: string }) {
  const { api, mode, session } = useRegistry();
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    if (!session) return;
    api.membership(workspaceId, session.id).then((member) => setRole(member?.role ?? null)).catch(() => setRole(null));
  }, [api, workspaceId, session]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [exportInfo, setExportInfo] = useState<{ exportId: string; expiresAt: string } | null>(null);
  const [previewId, setPreviewId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, run] = useBusy();

  return (
    <Frame title="Exchange" backHref={`/w/${workspaceId}`}>
      <p className={recipes.join("mb-4", recipes.text.intro)}>
        `export_create` stores a snapshot. The export edge function, disabled by default, serves the ZIP to the same signed-in user. Import uploads a ZIP, then `import_preview` and `import_commit` run in Postgres.
      </p>
      <section className={recipes.panel.md}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Include archived</label>
        <Button className={recipes.join("mt-3", recipes.pill.md)} disabled={busy} onClick={() => void run(async () => {
          try {
            const created = await api.exportCreate(workspaceId, null, includeArchived);
            setExportInfo(created);
            toast.success("Export created");
          } catch (error) {
            toast.error(messageOf(error));
          }
        })}>Create export</Button>
        {exportInfo && (
          <div className="mt-3 text-sm">
            <p className="font-mono text-xs break-all">{exportInfo.exportId}</p>
            <p className="text-muted-foreground">Expires {when(exportInfo.expiresAt)}</p>
            {mode === "live" && <Button variant="secondary" className={recipes.join("mt-2", recipes.pill.bare)} disabled={busy} onClick={() => void run(async () => {
              try {
                const blob = await api.downloadExport(exportInfo.exportId);
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "entitygraph-export.zip";
                anchor.click();
                URL.revokeObjectURL(url);
              } catch (error) {
                toast.error(messageOf(error));
              }
            })}>Download ZIP</Button>}
          </div>
        )}
      </section>
      {mode === "live" && role && !canWrite(role) ? (
        <p className="mt-4 text-sm text-muted-foreground">Importing adds records, so it needs an editor role or above. You can still create exports.</p>
      ) : mode === "live" ? (
        <form className={recipes.join("mt-4", recipes.panel.md)} onSubmit={async (event) => {
          event.preventDefault();
          const file = (event.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
          if (!file) return;
          await run(async () => { try {
            setPreviewId("");
            setPreview(null);
            const staged = await api.importZip(workspaceId, file);
            const uploadId = staged.uploadId ?? staged.id ?? "";
            const report = await api.importPreview(workspaceId, uploadId);
            setPreview(report);
            // import_commit takes the preview id that import_preview returned, not the upload id.
            setPreviewId(report.errors?.length ? "" : report.previewId);
          } catch (error) {
            toast.error(messageOf(error));
          } });
        }}>
          <input name="file" type="file" accept=".zip,application/zip" className="text-sm" required />
          <Button type="submit" disabled={busy} className={recipes.join("mt-3", recipes.pill.md)}>{busy ? "Working…" : "Upload and preview"}</Button>
          {preview && <ImportReport report={preview} />}
          {previewId && <Button type="button" variant="secondary" className={recipes.join("mt-3", recipes.pill.bare)} disabled={busy} onClick={() => void run(async () => {
            try {
              const committed = await api.importCommit(workspaceId, previewId);
              setPreviewId("");
              setPreview(null);
              toast.success(`Imported ${committed.entitiesCreated} entities and ${committed.relationsCreated} relations`);
            } catch (error) {
              toast.error(messageOf(error));
            }
          })}>Commit preview</Button>}
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">ZIP upload calls the import edge function, which is off in preview and disabled in the local Supabase config until you turn it on.</p>
      )}
    </Frame>
  );
}

export function TokensSection({ workspaceId }: { workspaceId: string }) {
  const { api, session } = useRegistry();
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [label, setLabel] = useState("");
  const [write, setWrite] = useState(false);
  const [manage, setManage] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      setTokens(await api.tokens(workspaceId));
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { void load(); }, [workspaceId]);

  return (
    <Frame title="Access tokens" backHref={`/w/${workspaceId}`}>
      <p className={recipes.join("mb-4", recipes.text.intro)}>Tokens are for the MCP edge function. The secret is shown once. Listing requires an owner or admin.</p>
      {error && <p className={recipes.join("mb-3", recipes.text.error)}>{error}</p>}
      {!loaded && <RowSkeletons count={2} shape="item" label="Loading tokens" />}
      <ul className="grid gap-2">
        {tokens.map((token) => (
          <li key={token.id} className={recipes.row.split}>
            <div>
              <p className="font-medium">{token.label}</p>
              <p className="text-sm text-muted-foreground">{token.prefix}… · {token.scopes.join(", ")}{token.revoked_at ? " · revoked" : ""}</p>
            </div>
            {!token.revoked_at && (
              <ConfirmButton
                label="Revoke"
                title={`Revoke ${token.label}?`}
                description="Anything using this token stops working immediately. A revoked token cannot be restored; issue a new one instead."
                confirmLabel="Revoke token"
                onConfirm={async () => {
                  try {
                    await api.revokeToken(workspaceId, token.id);
                    toast.success("Token revoked");
                    await load();
                  } catch (err) {
                    toast.error(messageOf(err));
                  }
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <form className="mt-6 grid max-w-lg gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (!session) return;
        const scopes = ["read", ...(write ? ["write"] : []), ...(manage ? ["manage"] : [])];
        await run(async () => {
          try {
            const issued = await api.issueToken(workspaceId, session.id, label, scopes);
            setSecret(issued.token);
            setLabel("");
            await load();
          } catch (err) {
            toast.error(messageOf(err));
          }
        });
      }}>
        <Input value={label} onChange={(event) => setLabel(event.target.value)} required placeholder="Label" className={recipes.field.md} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={write} onChange={(event) => setWrite(event.target.checked)} /> Write</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manage} onChange={(event) => { setManage(event.target.checked); if (event.target.checked) setWrite(true); }} /> Manage ontology</label>
        <Button type="submit" disabled={busy} className={recipes.pill.md}>Issue token</Button>
        {secret && <SecretReveal secret={secret} what="access token" onDone={() => setSecret(null)} />}
      </form>
    </Frame>
  );
}
