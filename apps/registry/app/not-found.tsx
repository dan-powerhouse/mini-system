import Link from "next/link";
import { DisplayTitle, FloatingCard, recipes } from "@/components/kit";

export default function NotFound() {
  return (
    <FloatingCard centered>
      <DisplayTitle>Page not found</DisplayTitle>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">This address does not exist in the registry. The link may be old or mistyped.</p>
      <Link href="/" className={recipes.join("mt-8", recipes.cta.primary)}>
        Back to workspaces
      </Link>
    </FloatingCard>
  );
}
