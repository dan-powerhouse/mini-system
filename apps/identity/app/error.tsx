"use client";

import { AuthCard } from "../components/AuthCard";

export default function AuthError({ reset }: { reset: () => void }) {
  return (
    <AuthCard icon="alert" title="Authentication unavailable" description="The request couldn’t be completed. Try again.">
      <div className="controls">
        <button className="button primary" type="button" onClick={reset}>Try again</button>
        <a className="button secondary" href="/login">Back to sign in</a>
      </div>
    </AuthCard>
  );
}
