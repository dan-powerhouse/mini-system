// Server-side transaction signatures. Keep the intent, principal, challenge record
// and credential in trusted storage. Only the assertion comes from the browser.
import { createHash, randomBytes } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

const operation = "entity.archive";
const lifetimeMs = 2 * 60 * 1000;

function relyingParty(origin) {
  const parsed = new URL(origin);
  const loopback = parsed.protocol === "http:" && parsed.hostname === "localhost";
  if (parsed.origin !== origin || (parsed.protocol !== "https:" && !loopback)) {
    throw new Error("Authority requires its configured HTTPS origin or localhost development origin.");
  }
  return parsed.hostname;
}

function challengeFor(intent, principal, origin, pending) {
  // The versioned tuple fixes field order and separates this purpose from sign-in.
  return createHash("sha256").update(JSON.stringify([
    "mini-system/authority/v1",
    origin,
    operation,
    intent.requestId,
    intent.workspaceId,
    intent.targetId,
    intent.expectedVersion,
    principal.userId,
    principal.sessionId,
    pending.nonce,
    pending.expiresAt,
  ])).digest("base64url");
}

/** @typedef {{ requestId: string, workspaceId: string, targetId: string, expectedVersion: number }} ArchiveIntent */
/** @typedef {{ userId: string, sessionId: string }} Principal */
/** @typedef {{ nonce: string, expiresAt: number }} Pending */
/** @typedef {import("@simplewebauthn/server").AuthenticationResponseJSON} Assertion */

/** @param {{ intent: ArchiveIntent, principal: Principal, origin: string, now?: number }} input */
export function issueAuthorityChallenge({ intent, principal, origin, now = Date.now() }) {
  const rpId = relyingParty(origin);
  const pending = { nonce: randomBytes(32).toString("base64url"), expiresAt: now + lifetimeMs };
  return {
    pending,
    options: {
      rpId,
      challenge: challengeFor(intent, principal, origin, pending),
      timeout: lifetimeMs,
      userVerification: /** @type {const} */ ("required"),
    },
  };
}

/**
 * Verify a signed action. The caller must consume the pending challenge and
 * recheck membership, credential state and target version atomically with execution.
 * @param {{ intent: ArchiveIntent, principal: Principal, origin: string, pending: Pending,
 * credential: import("@simplewebauthn/server").WebAuthnCredential & { userId: string },
 * response: Assertion, now?: number }} input
 */
export async function verifyAuthoritySignature({ intent, principal, origin, pending, credential, response, now = Date.now() }) {
  if (pending.expiresAt <= now) throw new Error("Authority challenge expired.");
  if (credential.userId !== principal.userId || credential.id !== response.id) {
    throw new Error("Authority credential does not belong to the signer.");
  }

  // Older browsers may report crossOrigin without topOrigin.
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"));
  if (clientData.crossOrigin === true || clientData.topOrigin !== undefined) {
    throw new Error("Authority approval requires a top-level page.");
  }

  const expectedChallenge = challengeFor(intent, principal, origin, pending);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: relyingParty(origin),
    requireUserVerification: true,
    credential,
  });
  if (!verification.verified) throw new Error("Authority signature is invalid.");

  return {
    requestId: intent.requestId,
    workspaceId: intent.workspaceId,
    targetId: intent.targetId,
    expectedVersion: intent.expectedVersion,
    operation,
    signerId: principal.userId,
    sessionId: principal.sessionId,
    origin,
    credentialId: credential.id,
    previousCounter: credential.counter,
    newCounter: verification.authenticationInfo.newCounter,
    pending: { nonce: pending.nonce, expiresAt: pending.expiresAt },
    challenge: expectedChallenge,
    assertion: response,
  };
}
