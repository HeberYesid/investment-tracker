"use client";

import { Button } from "@/components/ui/button";
import type { MouseEvent } from "react";

export function ChartExportButton({
  exporting,
  onExport,
}: {
  exporting: boolean;
  onExport: () => void;
}) {
  const handleDownload = (e: MouseEvent) => {
    e.preventDefault();
    onExport();
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={handleDownload}
      disabled={exporting}
      aria-label={exporting ? "Exportando..." : "Descargar grafico"}
      className="text-xs"
    >
      {exporting ? "..." : "PNG"}
    </Button>
  );
}
