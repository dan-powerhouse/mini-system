import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "mini system Identity", template: "%s · mini system Identity" },
  description: "Sign in with email or a passkey, and review application access.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0b12", viewportFit: "cover" };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
