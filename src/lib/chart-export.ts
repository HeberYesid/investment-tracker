import { useCallback, useRef, useState } from "react";

export function useChartExport(filename: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportAsPng = useCallback(async () => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;

    setExporting(true);
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const { width, height } = svg.getBoundingClientRect();

      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));

      const svgData = new XMLSerializer().serializeToString(clone);
      const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));

      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load SVG"));
        img.src = `data:image/svg+xml;base64,${svgBase64}`;
      });

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } finally {
      setExporting(false);
    }
  }, [filename]);

  const exportAsSvg = useCallback(() => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filename]);

  return { containerRef, exporting, exportAsPng, exportAsSvg };
}
