# Catálogo automático de CLIProxyAPI

OpenCode V2 carga automáticamente la copia instalada en `~/.config/opencode/plugins/cliproxy-models/`. Reutiliza el proveedor `providers.cliproxy` existente, incluida su `settings.baseURL` y la autenticación de `settings.apiKey` o del encabezado `Authorization`. No escribas la clave en el plugin.

- Consulta `GET /v1/models` en la URL local configurada al cargar y luego cada minuto. Los modelos aparecen en `/models` como `cliproxy/<id>`.
- No modifica `opencode.json(c)`. Las entradas explícitas de `providers.cliproxy.models` conservan sus ajustes y no se eliminan aunque el proxy deje de anunciarlas. Si falla una consulta, se conserva la última lista obtenida durante esa ejecución.
- El descubrimiento no confirma capacidades ni límites. Para los modelos nuevos registra entrada de texto, desactiva el uso de herramientas y deja los límites predeterminados de OpenCode. Conserva una entrada explícita para cada modelo que necesite ajustes de herramientas, imágenes, contexto, variantes o protocolo.
- Solo consulta direcciones de loopback y no sigue redirecciones. Si no aparece en una sesión ya abierta, ejecuta `/reload` y vuelve a abrir `/models`.

Para instalarlo en otra máquina, copia esta carpeta a `~/.config/opencode/plugins/`. La fuente del repositorio está fuera de `.opencode/plugins/` para evitar cargarla dos veces.
