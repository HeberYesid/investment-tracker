"use client";

import { useEffect, useRef } from "react";

interface StalePriceSyncTriggerProps {
  shouldSync: boolean;
  canSync: boolean;
}

export function StalePriceSyncTrigger({
  shouldSync,
  canSync,
}: StalePriceSyncTriggerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!shouldSync || !canSync) return;

    firedRef.current = true;

    fetch("/api/v1/admin/sync/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "PRICES" }),
      keepalive: true,
    }).catch(() => {
      // Background sync is best-effort; silently ignore failures.
    });
  }, [shouldSync, canSync]);

  return null;
}
