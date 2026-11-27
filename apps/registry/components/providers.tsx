"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { RegistryProvider } from "@/lib/registry";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <RegistryProvider>
        {children}
        <Toaster position="top-center" />
      </RegistryProvider>
    </ThemeProvider>
  );
}
