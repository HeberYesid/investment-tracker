import { Model, Plugin, Provider } from "@opencode/plugin";

import { loadModelIDs } from "./inventory.mjs";

const PROVIDER_ID = Provider.ID.make("cliproxy");
const REFRESH_MS = 60_000;

export default Plugin.define({
  id: "cliproxy.models",
  async setup(ctx) {
    let modelIDs = [];
    let stopped = false;
    let timer;
    let lastError;
    let provider;
    let registration;
    const controller = new AbortController();

    function applyInventory(editor) {
      const source = editor.get(PROVIDER_ID);
      provider = source?.provider;
      if (!source || source.provider.activation === "disabled") return;

      const added = modelIDs.filter((id) => !source.models.has(id)).map((id) => {
        const model = Model.Info.default(PROVIDER_ID, Model.ID.make(id));
        return { ...model, capabilities: { ...model.capabilities, tools: false, input: ["text"] } };
      });
      if (added.length) editor.models.set(PROVIDER_ID, [...source.models.values(), ...added]);
    }

    async function refresh() {
      try {
        registration ??= await ctx.provider.transform(applyInventory);
        if (stopped) {
          await registration.dispose();
          return;
        }
        if (stopped || !provider?.settings?.baseURL || provider.activation === "disabled") return;

        const next = await loadModelIDs(provider.settings, provider.headers, controller.signal);
        if (stopped) return;
        if (next.length !== modelIDs.length || next.some((id, index) => id !== modelIDs[index])) {
          const previous = modelIDs;
          modelIDs = next;
          try {
            await ctx.provider.reload();
          } catch (error) {
            modelIDs = previous;
            throw error;
          }
        }
        lastError = undefined;
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : "Error desconocido";
        if (message !== lastError) console.warn(`[cliproxy.models] ${message}`);
        lastError = message;
      } finally {
        if (!stopped) timer = setTimeout(() => void refresh(), REFRESH_MS);
      }
    }

    // Registra después de la carga inicial para que el proveedor de la configuración ya exista.
    timer = setTimeout(() => void refresh(), 500);
    return async () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      await registration?.dispose();
    };
  },
});
