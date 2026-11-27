"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Guards an async action against double submission. While it runs, further calls
 * are ignored and `busy` is true so the trigger can be disabled.
 */
export function useBusy() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}
