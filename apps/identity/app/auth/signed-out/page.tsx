import Link from "next/link";
import { AuthCard, Icon } from "../../../components/AuthCard";

export const metadata = { title: "Signed out" };

export default function Page() {
  return (
    <AuthCard title="You’re signed out" description="Your Identity session in this browser has ended." icon="check">
      <Link href="/login" className="button primary">Back to sign in <Icon name="arrow" /></Link>
    </AuthCard>
  );
}
