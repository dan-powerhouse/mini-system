import { buildCallbackUrl } from "./auth-flow.mjs";


const messages = {
  cancelled: "The passkey request was cancelled.",
  interrupted: "The passkey request didn’t complete. Try again.",
  unavailable: "Passkeys are unavailable on this device.",
  expired: "The request expired. Try again.",
  failure: "Identity could not be verified.",
};

function isRateLimited(error) {
  return error?.status === 429 || error?.code === "over_request_rate_limit";
}

function magicLinkResult(error, requestFailed = false) {
  if (isRateLimited(error)) {
    return { ok: false, kind: "rate-limited", message: "Please try again shortly." };
  }
  if (
    requestFailed ||
    error?.name === "AuthRetryableFetchError" ||
    error?.status === 0 ||
    error?.status >= 500
  ) {
    return {
      ok: false,
      kind: "unavailable",
      message: "Sign-in links are temporarily unavailable. Try again shortly.",
    };
  }
  // Keep account-specific failures indistinguishable from an accepted request.
  return { ok: true, kind: "link-sent" };
}

function passkeyFailure(error) {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  const name = String(error?.name ?? "").toLowerCase();
  const cause = String(error?.originalError?.name ?? error?.cause?.name ?? "").toLowerCase();

  let kind = "failure";
  if (name === "aborterror" || cause === "aborterror" || code.includes("cancel") || code.includes("abort")) {
    kind = "cancelled";
  } else if (
    code === "passkey_disabled" ||
    code.includes("not_supported") ||
    message.includes("does not support webauthn") ||
    message.includes("experimental and disabled")
  ) {
    kind = "unavailable";
  } else if (code.includes("expired") || message.includes("challenge expired")) {
    kind = "expired";
  } else if (name === "notallowederror" || cause === "notallowederror") {
    kind = "interrupted";
  }

  return /** @type {const} */ ({ ok: false, kind, message: messages[kind] });
}

/**
 * @param {{
 *   client: any;
 *   callbackUrl: string;
 *   authorizationId?: string;
 *   passkeyAvailable?: boolean;
 * }} options
 */
export function createIdentityAdapter({
  client,
  callbackUrl,
  authorizationId,
  passkeyAvailable = false,
}) {
  async function inspectSession() {
    const { data, error } = await client.auth.getUser();
    const user = error ? null : data?.user;
    if (!user) {
      return { authenticated: false, confirmed: false, anonymous: false, hasPasskey: false };
    }

    const anonymous = user.is_anonymous === true;
    const confirmed = !anonymous && Boolean(user.email_confirmed_at || user.phone_confirmed_at);
    if (!confirmed) {
      return { authenticated: true, confirmed: false, anonymous, hasPasskey: false };
    }

    const listed = await client.auth.passkey.list();
    return {
      authenticated: true,
      confirmed: true,
      anonymous: false,
      hasPasskey: !listed.error && Array.isArray(listed.data) && listed.data.length > 0,
    };
  }

  return {
    passkeyAvailable,

    async requestMagicLink(email, intent) {
      try {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: buildCallbackUrl(callbackUrl, authorizationId),
            shouldCreateUser: intent === "sign-up",
          },
        });
        return magicLinkResult(error);
      } catch (error) {
        return magicLinkResult(error, true);
      }
    },

    inspectSession,

    async signInWithPasskey() {
      if (!passkeyAvailable) return passkeyFailure({ code: "passkey_disabled" });
      try {
        const { error } = await client.auth.signInWithPasskey();
        if (error) return passkeyFailure(error);
        return /** @type {const} */ ({ ok: true, kind: "authenticated", hasPasskey: true });
      } catch (error) {
        return passkeyFailure(error);
      }
    },

    async registerPasskey() {
      if (!passkeyAvailable) return passkeyFailure({ code: "passkey_disabled" });
      try {
        const session = await inspectSession();
        if (!session.authenticated || !session.confirmed || session.anonymous) {
          return /** @type {const} */ ({ ok: false, kind: "failure", message: messages.failure });
        }
        const { error } = await client.auth.registerPasskey();
        if (error) return passkeyFailure(error);
        return /** @type {const} */ ({ ok: true, kind: "passkey-registered", hasPasskey: true });
      } catch (error) {
        return passkeyFailure(error);
      }
    },
  };
}
