const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * @param {{baseURL: string, apiKey?: string}} settings
 * @param {Record<string, string> | undefined} configuredHeaders
 * @param {AbortSignal} signal
 * @returns {Promise<string[]>}
 */
export async function loadModelIDs(settings, configuredHeaders, signal) {
  let url;
  try {
    url = new URL(settings.baseURL);
  } catch {
    throw new Error("La baseURL de CLIProxyAPI no es válida.");
  }

  if (!LOOPBACK_HOSTS.has(url.hostname) || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("El descubrimiento solo admite una baseURL local HTTP(S) sin credenciales ni parámetros en la URL.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;

  const headers = new Headers(configuredHeaders);
  if (settings.apiKey && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${settings.apiKey}`);
  }
  headers.set("accept", "application/json");

  let response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    });
  } catch {
    throw new Error("No se pudo consultar el inventario local de CLIProxyAPI.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`CLIProxyAPI respondió HTTP ${response.status} al listar modelos.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("CLIProxyAPI devolvió una respuesta que no es JSON.");
  }
  if (!Array.isArray(payload?.data)) {
    throw new Error("El inventario de CLIProxyAPI no contiene una lista de modelos.");
  }

  const ids = new Set();
  for (const model of payload.data) {
    const id = model?.id;
    if (typeof id !== "string" || !id || /[#\s\p{Cc}]/u.test(id)) {
      throw new Error("El inventario de CLIProxyAPI contiene un ID de modelo no válido.");
    }
    ids.add(id);
  }
  return [...ids].sort();
}
