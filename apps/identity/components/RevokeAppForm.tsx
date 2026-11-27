"use client";

import { useActionState } from "react";

export function RevokeAppForm({
  name,
  revokeAction,
}: {
  name: string;
  revokeAction: (state: null, form: FormData) => Promise<null>;
}) {
  const [, submit, pending] = useActionState(revokeAction, null);
  return (
    <details className="revoke-app">
      <summary>Manage access for {name}</summary>
      <form className="controls" action={submit}>
        <p>To reconnect, this app will need your authorization again.</p>
        <button className="button secondary" type="submit" disabled={pending}>
          {pending ? "Revoking access…" : "Revoke access"}
        </button>
      </form>
    </details>
  );
}
