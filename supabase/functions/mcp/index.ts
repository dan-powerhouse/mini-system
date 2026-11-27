// Supabase Edge Function; official v2 stateless Fetch transport, no custom JSON-RPC dispatcher.
// Gateway JWT validation is disabled: requests carry either an opaque egt_ credential
// (mcp_begin authenticates every request) or a native Supabase OAuth 2.1 access token,
// which PostgREST verifies and mcp_oauth_dispatch checks against an explicit grant.
import { createMcpHandler, McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { kind, tools, type ToolName } from './schemas.ts';
import { toolUX, toolError } from './tool-ux.ts';
import { registerGoldenTools } from './golden-tools.ts';
import { registerReadTools } from './candidate/register-read-tools.ts';

import { supabaseEnv } from '../_shared/supabase-env.ts';
const { url, secretKey, publishableKey } = supabaseEnv();
const clientAuth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const db = createClient(url, secretKey, { auth: clientAuth });
const verifier = createClient(url, publishableKey, { auth: clientAuth });
// RFC 9728 protected-resource metadata; the native Supabase Auth OAuth 2.1 server is the issuer.
const resourceUrl = `${url.replace(/\/$/, '')}/functions/v1/mcp`;
const resourceMetadataUrl = `${resourceUrl}/.well-known/oauth-protected-resource`;
const challenge = `Bearer resource_metadata="${resourceMetadataUrl}"`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Dispatch = (operation: string, args: unknown) => Promise<{ ok: false; code: string } | { ok: true; data: unknown }>;
const maxBytes = 1024 * 1024;
const projectHost = new URL(url).host.toLowerCase();
const configuredHosts = [projectHost, ...(Deno.env.get('MCP_ALLOWED_HOSTS') ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)];
const configuredOrigins = (Deno.env.get('MCP_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim()).filter(Boolean);
// Convert only row-level DTO keys; never transform arbitrary user attributes or notes.
function row(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'search_vector') continue;
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}
function dto(op: string, result: any): unknown {
  switch (op) {
    case 'get_entity': return { entity: row(result.entity), relations: { incoming: result.relations.incoming.map(row), outgoing: result.relations.outgoing.map(row) } };
    case 'search_entities': return { items: result.items.map(row), nextCursor: result.nextCursor };
    case 'create_entity': case 'update_entity': case 'archive_entity': return { entity: row(result.entity) };
    case 'create_relation': case 'update_relation': return { relation: row(result.relation) };
    case 'traverse': return { start: row(result.start), nodes: result.nodes.map((n: any) => ({ entity: row(n.entity), depth: n.depth })), relations: result.relations.map(row), truncated: result.truncated };
    case 'resource_predicates': return result.map(row);
    case 'resource_template': return row(result);
    default: return result;
  }
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error('DATABASE_REQUEST_FAILED');
  return data;
}
function response(status: number, code: string, headers: Record<string, string> = {}) {
  return Response.json({ error: code }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
async function limitedBody(req: Request): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!reader) return new Uint8Array();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new Error('PAYLOAD_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let pos = 0; for (const c of chunks) { bytes.set(c, pos); pos += c.length; }
  return bytes;
}
export async function serve(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  // Reject unconfigured external hosts/origins. Local defaults are explicit.
  const host = req.headers.get('host')?.toLowerCase() ?? new URL(req.url).host.toLowerCase();
  const local = ['localhost:54321', '127.0.0.1:54321', 'kong:8000', 'supabase_edge_runtime_entitygraph-local:8081'];
  // Hosted Supabase rewrites Host to its runtime gateway; bind it to this project's URL.
  const hostedGateway = host === 'edge-runtime.supabase.com' && new URL(req.url).host.toLowerCase() === projectHost;
  if (!hostedGateway && ![...configuredHosts, ...local].includes(host)) return response(403, 'HOST_NOT_ALLOWED');
  const origin = req.headers.get('origin');
  if (origin && !configuredOrigins.includes(origin)) return response(403, 'ORIGIN_NOT_ALLOWED');
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return Response.json({
      resource: resourceUrl,
      authorization_servers: [`${url.replace(/\/$/, '')}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'mini system Registry MCP',
    }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  const authorization = req.headers.get('authorization') ?? '';
  const token = /^Bearer (egt_[0-9a-f]{64})$/.exec(authorization)?.[1];
  const jwt = token ? undefined : /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization)?.[1];
  const method = req.headers.get('mcp-method') ?? 'other';
  let ok = false;
  let result: Response;
  let dispatch: Dispatch;
  let finish: (() => Promise<void>) | undefined;
  if (jwt) {
    // Native OAuth access token: verify signature/expiry here for an early answer;
    // PostgREST verifies it again and the database derives identity only from it.
    const { data: verified, error: verifyError } = await verifier.auth.getClaims(jwt).catch(() => ({ data: null, error: true }));
    const claims = verified?.claims as Record<string, unknown> | undefined;
    if (verifyError || !claims || claims.role !== 'authenticated' || typeof claims.client_id !== 'string' || typeof claims.session_id !== 'string') {
      return response(401, 'UNAUTHENTICATED', { 'WWW-Authenticate': challenge });
    }
    const userDb = createClient(url, publishableKey, { auth: clientAuth, global: { headers: { Authorization: `Bearer ${jwt}` } } });
    let session: { ok: boolean; workspaces?: unknown[] };
    try {
      const { data, error } = await userDb.rpc('mcp_oauth_session');
      if (error) throw error;
      session = data;
    } catch { return response(503, 'AUTHORIZATION_UNAVAILABLE'); }
    if (!session.ok) return response(401, 'UNAUTHENTICATED', { 'WWW-Authenticate': challenge });
    if (!session.workspaces?.length) return response(403, 'NO_REGISTRY_GRANT');
    const workspaceHeader = req.headers.get('mcp-workspace');
    if (workspaceHeader !== null && !uuidPattern.test(workspaceHeader)) return response(400, 'INVALID_WORKSPACE');
    dispatch = async (operation, args) => {
      const { data: value, error } = await userDb.rpc('mcp_oauth_dispatch', { p_request_id: crypto.randomUUID(), p_operation: operation, p_args: args, p_workspace_id: workspaceHeader });
      if (error) throw new Error('DATABASE_REQUEST_FAILED');
      if (!value.ok) return { ok: false, code: value.code as string } as const;
      return { ok: true, data: dto(operation, value.result) } as const;
    };
  } else {
    const digest = token ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('') : null;
    let opened: { ok: boolean; tokenId?: string; code?: string };
    try { opened = await rpc('mcp_begin', { p_digest: digest, p_request_id: requestId }); }
    catch { return response(503, 'AUTHORIZATION_UNAVAILABLE'); }
    if (!opened.ok) return opened.code === 'RATE_LIMITED' ? response(429, 'RATE_LIMITED', { 'Retry-After': '60' }) : response(401, 'UNAUTHENTICATED', { 'WWW-Authenticate': challenge });
    const tokenId = opened.tokenId!;
    dispatch = async (operation, args) => {
      const value = await rpc('mcp_dispatch', { p_token_id: tokenId, p_request_id: requestId, p_operation: operation, p_args: args });
      if (!value.ok) return { ok: false, code: value.code as string } as const;
      return { ok: true, data: dto(operation, value.result) } as const;
    };
    finish = () => rpc('mcp_finish', { p_token_id: tokenId, p_request_id: requestId, p_method: method, p_ok: ok });
  }
  try {
    if (req.method !== 'POST') { result = response(405, 'METHOD_NOT_ALLOWED', { Allow: 'POST' }); }
    else {
      const bytes = await limitedBody(req);
      const forwarded = new Request(req.url, { method: 'POST', headers: req.headers, body: new Uint8Array(bytes), signal: req.signal });
      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'EntityGraph', title: 'mini system', version: '1.2.0' }, { cacheHints: { 'tools/list': { ttlMs: 30000, cacheScope: 'private' } } });
        for (const name of Object.keys(tools) as ToolName[]) {
          server.registerTool(name, { ...toolUX[name], inputSchema: tools[name] }, async (args: unknown) => {
            const r = await dispatch(name, args);
            if (!r.ok) return toolError(r.code);
            return { content: [{ type: 'text' as const, text: JSON.stringify(r.data) }], structuredContent: r.data as Record<string, unknown> };
          });
        }
        registerReadTools(server, dispatch);
        registerGoldenTools(server, dispatch);
        const read = async (uri: URL, operation: string, args: unknown) => {
          const r = await dispatch(operation, args);
          if (!r.ok) throw new Error(r.code);
          return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(r.data) }] };
        };
        server.registerResource('entity', new ResourceTemplate('entitygraph://entities/{id}', { list: undefined }), { mimeType: 'application/json' }, (uri, vars) => read(uri, 'get_entity', { id: z.uuid().parse(vars.id) }));
        server.registerResource('predicates', 'entitygraph://predicates', { mimeType: 'application/json' }, uri => read(uri, 'resource_predicates', {}));
        server.registerResource('template', new ResourceTemplate('entitygraph://templates/{kind}/{type}', { list: undefined }), { mimeType: 'application/json' }, (uri, vars) => read(uri, 'resource_template', { kind: kind.parse(vars.kind), type: z.string().min(1).max(100).parse(vars.type) }));
        return server;
      }, { legacy: 'reject', responseMode: 'json' });
      try {
        result = await handler.fetch(forwarded);
        // The modern SDK defaults to a JSON response when no streaming is needed.
        // Inspect only the response envelope to audit protocol-level failures; SDK owns dispatch.
        if (result.headers.get('content-type')?.includes('application/json')) {
          const envelope = await result.clone().json();
          ok = result.ok && !envelope.error && !envelope.result?.isError;
        } else { ok = false; }
      } finally { await handler.close(); }
    }
  } catch (e) { result = response(e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500, e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_FAILED'); }
  if (finish) {
    try { await finish(); }
    catch { return response(503, 'AUDIT_UNAVAILABLE'); }
  }
  return result;
}
Deno.serve(serve);
