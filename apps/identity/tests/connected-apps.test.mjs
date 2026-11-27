import assert from "node:assert/strict";
import test from "node:test";
import { readConnectedApps, revokeConnectedApp } from "../lib/connected-apps.ts";

function fixture(user, { disconnected = false, listError = null } = {}) {
  const calls = [];
  const grant = { client: { id: "approved", name: "Registry client" }, scopes: ["email"] };
  const client = { auth: {
    getUser: async () => ({ data: { user }, error: null }),
    oauth: {
      listGrants: async () => {
        calls.push("list");
        return { data: disconnected ? [] : [grant], error: listError };
      },
      revokeGrant: async ({ clientId }) => {
        calls.push(clientId);
        return { error: null };
      },
    },
  } };
  return { client, calls, grant };
}

const verified = { email_confirmed_at: "2026-11-27T00:00:00Z", is_anonymous: false };

test("only verified accounts can read or revoke consents", async () => {
  for (const user of [null, {}, { ...verified, is_anonymous: true }]) {
    const { client, calls } = fixture(user);
    assert.equal((await readConnectedApps(client)).status, "sign-in");
    assert.equal(await revokeConnectedApp(client, "approved"), "sign-in");
    assert.deepEqual(calls, []);
  }
});

test("native consents are listed and only a current consent can be revoked", async () => {
  const { client, calls, grant } = fixture(verified);
  assert.deepEqual(await readConnectedApps(client), { status: "ready", grants: [grant] });
  assert.equal(await revokeConnectedApp(client, "other"), "missing");
  assert.equal(await revokeConnectedApp(client, "approved"), "revoked");
  assert.deepEqual(calls, ["list", "list", "list", "approved"]);
});

test("stale grants and failed lookups cannot dispatch revocation", async () => {
  const stale = fixture(verified, { disconnected: true });
  assert.equal(await revokeConnectedApp(stale.client, "approved"), "missing");
  const failed = fixture(verified, { listError: { message: "upstream error" } });
  assert.equal(await revokeConnectedApp(failed.client, "approved"), "unavailable");
  assert.deepEqual(stale.calls, ["list"]);
  assert.deepEqual(failed.calls, ["list"]);
});
