import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import test from "node:test";
import { issueAuthorityChallenge, verifyAuthoritySignature } from "../lib/authority-signature.mjs";

const origin = "https://identity.example";
const intent = { requestId: randomUUID(), workspaceId: randomUUID(), targetId: randomUUID(), expectedVersion: 4 };
const principal = { userId: randomUUID(), sessionId: randomUUID() };

function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const { x, y } = publicKey.export({ format: "jwk" });
  // COSE EC2 public key (ES256, P-256) with 32-byte x and y coordinates.
  const cose = Buffer.concat([Buffer.from("a5010203262001215820", "hex"), Buffer.from(x, "base64url"),
    Buffer.from("225820", "hex"), Buffer.from(y, "base64url")]);
  const credential = {
    id: Buffer.from("authority-test-device").toString("base64url"),
    publicKey: cose,
    counter: 0,
    userId: principal.userId,
  };
  return { credential, assertion(challenge, { responseOrigin = origin, flags = 5, crossOrigin = false } = {}) {
    const client = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: responseOrigin, crossOrigin }));
    const data = Buffer.concat([createHash("sha256").update("identity.example").digest(), Buffer.from([flags, 0, 0, 0, 1])]);
    const message = Buffer.concat([data, createHash("sha256").update(client).digest()]);
    return {
      id: credential.id, rawId: credential.id, type: "public-key", clientExtensionResults: {},
      response: { authenticatorData: data.toString("base64url"), clientDataJSON: client.toString("base64url"),
        signature: sign("sha256", message, privateKey).toString("base64url") },
    };
  }};
}

test("accepts an ES256 assertion for the exact approval and returns verifiable evidence", async () => {
  const { credential, assertion } = authenticator();
  const challenge = issueAuthorityChallenge({ intent, principal, origin });
  const response = assertion(challenge.options.challenge);
  const proof = await verifyAuthoritySignature({ intent, principal, origin, pending: challenge.pending, credential, response });
  assert.equal(proof.requestId, intent.requestId);
  assert.equal(proof.newCounter, 1);
  assert.deepEqual(proof.pending, challenge.pending);
  assert.deepEqual(proof.assertion, response);
  assert.equal(challenge.options.userVerification, "required");
});

test("rejects changes to the action, session, workspace, expiry, signer or origin", async () => {
  const { credential, assertion } = authenticator();
  const challenge = issueAuthorityChallenge({ intent, principal, origin });
  const response = assertion(challenge.options.challenge);
  const input = { intent, principal, origin, credential, response, pending: challenge.pending };
  for (const overrides of [
    { intent: { ...intent, expectedVersion: 5 } },
    { intent: { ...intent, workspaceId: randomUUID() } },
    { intent: { ...intent, targetId: randomUUID() } },
    { principal: { ...principal, sessionId: randomUUID() } },
    { credential: { ...credential, userId: randomUUID() } },
    { now: challenge.pending.expiresAt },
    { response: assertion(challenge.options.challenge, { responseOrigin: "https://other.example" }) },
    { response: assertion(challenge.options.challenge, { flags: 1 }) },
    { response: assertion(challenge.options.challenge, { crossOrigin: true }) },
    { credential: { ...credential, counter: 1 } },
  ]) {
    await assert.rejects(verifyAuthoritySignature({ ...input, ...overrides }));
  }
});

test("an assertion from another challenge or another signing key cannot approve", async () => {
  const { credential, assertion } = authenticator();
  const first = issueAuthorityChallenge({ intent, principal, origin });
  const second = issueAuthorityChallenge({ intent, principal, origin });
  const input = { intent, principal, origin, credential, pending: second.pending };
  await assert.rejects(verifyAuthoritySignature({ ...input, response: assertion(first.options.challenge) }));
  const stranger = authenticator();
  await assert.rejects(verifyAuthoritySignature({ ...input, response: stranger.assertion(second.options.challenge) }));
});
