"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { publicConfig } from "./config";
import { getBrowserClient, live } from "./live";
import { watchRegistrySession, type RegistrySessionState } from "./registry-session";
import type { Kind, PathStep, Role, SearchQuery, SessionUser, WorkspacePatch } from "./model";
import { PreviewRegistry } from "./preview";

type RegistryApi = ReturnType<typeof bindLive>;

type RegistryContextValue = {
  ready: boolean;
  sessionStatus: RegistrySessionState["status"];
  retrySession: () => void;
  mode: "live" | "preview";
  session: SessionUser | null;
  identityUrl: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string>;
  recover: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  api: RegistryApi;
};

function asAsyncApi(preview: PreviewRegistry): RegistryApi {
  return new Proxy(preview, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => value.apply(target, args);
    },
  }) as unknown as RegistryApi;
}

const RegistryContext = createContext<RegistryContextValue | null>(null);

function bindLive(client: ReturnType<typeof getBrowserClient>) {
  return {
    workspaces: () => live.workspaces(client),
    membership: (workspaceId: string, userId: string) => live.membership(client, workspaceId, userId),
    members: (workspaceId: string) => live.members(client, workspaceId),
    createWorkspace: (name: string, slug: string) => live.createWorkspace(client, name, slug),
    updateWorkspace: (workspaceId: string, patch: WorkspacePatch) => live.updateWorkspace(client, workspaceId, patch),
    invite: (workspaceId: string, email: string, role: Role) => live.invite(client, workspaceId, email, role),
    acceptInvitation: (token: string) => live.acceptInvitation(client, token),
    updateRole: (workspaceId: string, userId: string, role: Role) => live.updateRole(client, workspaceId, userId, role),
    removeMember: (workspaceId: string, userId: string) => live.removeMember(client, workspaceId, userId),
    transferOwner: (workspaceId: string, userId: string) => live.transferOwner(client, workspaceId, userId),
    search: (workspaceId: string, query: SearchQuery) => live.search(client, workspaceId, query),
    getEntity: (workspaceId: string, id: string) => live.getEntity(client, workspaceId, id),
    createEntity: (workspaceId: string, input: Record<string, unknown>) => live.createEntity(client, workspaceId, input),
    updateEntity: (workspaceId: string, id: string, version: number, patch: Record<string, unknown>) => live.updateEntity(client, workspaceId, id, version, patch),
    archiveEntity: (workspaceId: string, id: string, version: number) => live.archiveEntity(client, workspaceId, id, version),
    templates: (workspaceId: string) => live.templates(client, workspaceId),
    upsertTemplate: (workspaceId: string, kind: Kind, type: string, fields: unknown, expected?: number) => live.upsertTemplate(client, workspaceId, kind, type, fields, expected),
    predicates: (workspaceId: string) => live.predicates(client, workspaceId),
    upsertPredicate: (input: Parameters<PreviewRegistry["upsertPredicate"]>[0]) => live.upsertPredicate(client, input),
    deletePredicate: (workspaceId: string, name: string) => live.deletePredicate(client, workspaceId, name),
    createRelation: (workspaceId: string, fromId: string, toId: string, predicate: string, attributes?: Record<string, unknown>) => live.createRelation(client, workspaceId, fromId, toId, predicate, attributes),
    deleteRelation: (workspaceId: string, id: string) => live.deleteRelation(client, workspaceId, id),
    dashboard: (workspaceId: string) => live.dashboard(client, workspaceId),
    auditRecent: (workspaceId: string, query?: Record<string, unknown>) => live.auditRecent(client, workspaceId, query),
    savedViews: (workspaceId: string) => live.savedViews(client, workspaceId),
    createSavedView: (workspaceId: string, name: string, visibility: "personal" | "workspace", kind: Kind | null, query: Record<string, unknown>) => live.createSavedView(client, workspaceId, name, visibility, kind, query),
    deleteSavedView: (workspaceId: string, id: string) => live.deleteSavedView(client, workspaceId, id),
    traverse: (workspaceId: string, startId: string, depth: number, direction?: string, predicates?: string[]) => live.traverse(client, workspaceId, startId, depth, direction, predicates),
    pathReport: (workspaceId: string, startId: string, steps: PathStep[], maxResults?: number) => live.pathReport(client, workspaceId, startId, steps, maxResults),
    exportCreate: (workspaceId: string, kinds?: Kind[] | null, includeArchived?: boolean) => live.exportCreate(client, workspaceId, kinds, includeArchived),
    downloadExport: (exportId: string) => live.downloadExport(client, exportId),
    importZip: (workspaceId: string, file: File) => live.importZip(client, workspaceId, file),
    importPreview: (workspaceId: string, uploadId: string) => live.importPreview(client, workspaceId, uploadId),
    importCommit: (workspaceId: string, previewId: string) => live.importCommit(client, workspaceId, previewId),
    tokens: (workspaceId: string) => live.tokens(client, workspaceId),
    issueToken: (workspaceId: string, userId: string, label: string, scopes: string[]) => live.issueToken(client, workspaceId, userId, label, scopes),
    revokeToken: (workspaceId: string, tokenId: string) => live.revokeToken(client, workspaceId, tokenId),
    currentPerson: (workspaceId: string) => live.currentPerson(client, workspaceId),
    linkPerson: (workspaceId: string, userId: string, personId: string) => live.linkPerson(client, workspaceId, userId, personId),
  };
}

export function RegistryProvider({ children }: { children: React.ReactNode }) {
  const config = publicConfig();
  const preview = useMemo(() => new PreviewRegistry(), []);
  const [auth, setAuth] = useState<RegistrySessionState>(() => config.configured
    ? { status: "checking", user: null }
    : { status: "signed-in", user: preview.db.user });
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    if (config.configured) return watchRegistrySession(getBrowserClient(), setAuth);
  }, [config.configured, checkAttempt]);

  const api = useMemo(() => (config.configured ? bindLive(getBrowserClient()) : asAsyncApi(preview)), [config.configured, preview]);

  const value: RegistryContextValue = {
    ready: auth.status !== "checking",
    sessionStatus: auth.status,
    retrySession() {
      setAuth({ status: "checking", user: null });
      setCheckAttempt(attempt => attempt + 1);
    },
    mode: config.configured ? "live" : "preview",
    session: auth.user,
    identityUrl: config.identityUrl,
    api,
    async signIn(email, password) {
      if (!config.configured) {
        if (!email.includes("@") || password.length < 1) throw new Error("Enter an email and a password to open the preview.");
        setAuth({ status: "signed-in", user: { ...preview.db.user, email } });
        return;
      }
      const { error } = await getBrowserClient().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password) {
      if (!config.configured) {
        setAuth({ status: "signed-in", user: { ...preview.db.user, email } });
        return "Preview account is local to this browser tab.";
      }
      const { data, error } = await getBrowserClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw new Error(error.message);
      if (!data.session) return "Check your email to confirm the account, then come back and sign in.";
      return "Account created.";
    },
    async recover(email) {
      if (!config.configured) return;
      const { error } = await getBrowserClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      if (!config.configured) {
        setAuth({ status: "signed-out", user: null });
        return;
      }
      const { error } = await getBrowserClient().auth.signOut();
      if (error) throw new Error(error.message);
    },
  };

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useRegistry() {
  const value = useContext(RegistryContext);
  if (!value) throw new Error("RegistryProvider is missing");
  return value;
}
