"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useBusy } from "@/lib/use-busy";
import { recipes } from "@/components/kit";

/**
 * A button that asks before doing something that cannot be undone. The dialog stays
 * open while the action runs and closes when it finishes; errors are left to `onConfirm`.
 */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = "ghost",
  className = "rounded-full",
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  variant?: "ghost" | "secondary" | "destructive";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, run] = useBusy();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogTrigger render={<Button type="button" variant={variant} className={className}>{label}</Button>} />
      <DialogContent className={recipes.dialog.confirm} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="leading-6">{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className={recipes.join(recipes.pill.md, "px-5")} disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            className={recipes.join(recipes.pill.md, "px-5")}
            disabled={busy}
            onClick={() => void run(async () => {
              await onConfirm();
              setOpen(false);
            })}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
