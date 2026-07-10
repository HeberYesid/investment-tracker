"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useDateFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const setFilters = useCallback(
    (newFrom: string, newTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newFrom) params.set("from", newFrom);
      else params.delete("from");
      if (newTo) params.set("to", newTo);
      else params.delete("to");
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const queryString = useMemo(() => {
    const parts: string[] = [];
    if (from) parts.push(`from=${encodeURIComponent(from)}`);
    if (to) parts.push(`to=${encodeURIComponent(to)}`);
    return parts.length > 0 ? `&${parts.join("&")}` : "";
  }, [from, to]);

  return { from, to, setFilters, queryString };
}
