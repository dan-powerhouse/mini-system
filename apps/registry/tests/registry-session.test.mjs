import assert from "node:assert/strict";
import { setTimeout as nextTurn } from "node:timers/promises";
import test from "node:test";
import { checkRegistrySession, watchRegistrySession } from "../lib/registry-session.ts";

const user = { id: "member", email: "user@example.invalid" };

function backend({ getUser = async () => ({ data: { user }, error: null }), check = async () => ({ data: true, error: null }) } = {}) {
  let listener;
  let insideEvent = false;
  const client = {
    auth: {
      async getUser(token) {
        assert.equal(insideEvent, false, "don’t call the SDK from inside its auth listener");
        return getUser(token);
      },
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe: () => { listener = undefined; } } } };
      },
    },
    rpc(name) {
      assert.equal(name, "registry_direct_session");
      return {
        setHeader(header, value) {
          assert.equal(header, "Authorization");
          return check(value);
        },
      };
    },
  };
  return {
    client,
    emit(event, token, member = user) {
      insideEvent = true;
      try {
        listener?.(event, token ? { access_token: token, user: member } : null);
      } finally {
        insideEvent = false;
      }
    },
  };
}

test("Auth and Registry verify the same issued bearer before exposing the user", async () => {
  const calls = [];
  const { client } = backend({
    getUser: async token => {
      calls.push(token);
      return { data: { user }, error: null };
    },
    check: async header => {
      calls.push(header);
      return { data: true, error: null };
    },
  });
  assert.deepEqual(await checkRegistrySession(client, "direct"), { status: "signed-in", user });
  assert.deepEqual(calls, ["direct", "Bearer direct"]);
});

test("a verified Auth user with a delegated credential stays outside Registry", async () => {
  const { client } = backend({ check: async () => ({ data: false, error: null }) });
  assert.deepEqual(await checkRegistrySession(client, "oauth"), { status: "ineligible", user: null });
});

test("expired credentials and an unavailable boundary produce distinct states", async () => {
  const expired = backend({ getUser: async () => ({ data: { user: null }, error: { status: 401 } }) });
  const outage = backend({ check: async () => ({ data: null, error: { message: "internal detail" } }) });
  assert.deepEqual(await checkRegistrySession(expired.client, "expired"), { status: "signed-out", user: null });
  assert.deepEqual(await checkRegistrySession(outage.client, "direct"), { status: "unavailable", user: null });
});

test("logout invalidates an unfinished verification", async () => {
  let complete;
  const fixture = backend({ check: () => new Promise(resolve => { complete = resolve; }) });
  const states = [];
  const dispose = watchRegistrySession(fixture.client, state => states.push(state));
  try {
    fixture.emit("INITIAL_SESSION", "old-direct");
    await nextTurn(0);
    assert.equal(typeof complete, "function");
    fixture.emit("SIGNED_OUT", null);
    complete({ data: true, error: null });
    await nextTurn(0);
    assert.deepEqual(states.at(-1), { status: "signed-out", user: null });
    assert.ok(states.every(state => state.status !== "signed-in"));
  } finally {
    dispose();
  }
});

test("changing credentials closes the current workspace before checking the new session", async () => {
  const fixture = backend({
    check: async bearer => ({ data: bearer === "Bearer direct", error: null }),
  });
  const states = [];
  const dispose = watchRegistrySession(fixture.client, state => states.push(state));
  try {
    fixture.emit("INITIAL_SESSION", "direct");
    await nextTurn(0);
    assert.equal(states.at(-1).status, "signed-in");
    fixture.emit("SIGNED_IN", "oauth");
    assert.deepEqual(states.at(-1), { status: "checking", user: null });
    await nextTurn(0);
    assert.deepEqual(states.at(-1), { status: "ineligible", user: null });
  } finally {
    dispose();
  }
});

test("a verified user’s refresh keeps the workspace mounted while rechecking", async () => {
  const calls = [];
  const fixture = backend({
    check: async bearer => {
      calls.push(bearer);
      return { data: true, error: null };
    },
  });
  const states = [];
  const dispose = watchRegistrySession(fixture.client, state => states.push(state));
  try {
    fixture.emit("INITIAL_SESSION", "direct");
    await nextTurn(0);
    fixture.emit("TOKEN_REFRESHED", "renewed");
    assert.equal(states.at(-1).status, "signed-in");
    await nextTurn(0);
    assert.deepEqual(calls, ["Bearer direct", "Bearer renewed"]);
    assert.deepEqual(states.map(state => state.status), ["checking", "signed-in", "signed-in"]);
  } finally {
    dispose();
  }
});
