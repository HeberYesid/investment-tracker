import { afterEach, describe, expect, it, vi } from "vitest";

import { loadModelIDs } from "../.opencode/cliproxy-models/inventory.mjs";

const settings = { baseURL: "http://127.0.0.1:8317/v1/", apiKey: "clave-de-prueba" };
const signal = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("inventario de CLIProxyAPI", () => {
  it("consulta el catálogo local, conserva los alias y elimina duplicados", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      data: [{ id: "gpt-demo" }, { id: "alias/otro" }, { id: "gpt-demo" }],
    }));
    vi.stubGlobal("fetch", request);

    await expect(loadModelIDs(settings, undefined, signal)).resolves.toEqual(["alias/otro", "gpt-demo"]);
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8317/v1/models");
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer clave-de-prueba");
    expect(options?.redirect).toBe("error");
  });

  it("no envía la credencial a una dirección remota", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(loadModelIDs({ ...settings, baseURL: "https://example.com/v1" }, undefined, signal))
      .rejects.toThrow("baseURL local");
    expect(request).not.toHaveBeenCalled();
  });

  it("rechaza una respuesta parcial o malformada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "válido" }, {}] })));

    await expect(loadModelIDs(settings, undefined, signal)).rejects.toThrow("ID de modelo no válido");
  });

  it("informa el código HTTP sin incluir el cuerpo de error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("contenido privado", { status: 401 })));

    await expect(loadModelIDs(settings, undefined, signal))
      .rejects.toThrow(/^CLIProxyAPI respondió HTTP 401 al listar modelos\.$/);
  });
});
