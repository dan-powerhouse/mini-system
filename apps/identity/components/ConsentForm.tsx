"use client";

import { useActionState } from "react";
import { Icon } from "./AuthCard";

export function ConsentForm({
  authorizationId,
  decideAction,
}: {
  authorizationId: string;
  decideAction: (state: null, form: FormData) => Promise<null>;
}) {
  const [, submit, pending] = useActionState(decideAction, null);

  return (
    <form className="controls" action={submit}>
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <div className="consent-actions">
        <button type="submit" name="decision" value="deny" className="button secondary" disabled={pending}>Deny</button>
        <button type="submit" name="decision" value="approve" className="button primary" disabled={pending}>
          Allow access <Icon name="arrow" />
        </button>
      </div>
      {pending && <p className="subtle" role="status">Saving your decision…</p>}
    </form>
  );
}
