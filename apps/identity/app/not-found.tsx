import Link from "next/link";
import { AuthCard } from "../components/AuthCard";

export default function NotFound() {
  return (
    <AuthCard icon="alert" title="Page not found" description="This authentication page is unavailable.">
      <Link className="button primary" href="/login">Back to sign in</Link>
    </AuthCard>
  );
}
