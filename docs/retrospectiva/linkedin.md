# Borradores para LinkedIn

Cada sección es una publicación independiente. Usar solo datos sintéticos en cualquier captura y revisar el estado de los pendientes al publicarla. No se ha publicado nada.

## 1. El dashboard decía USD 20 y la cuenta daba USD 18

Compré por USD 100, vendí por USD 120 y registré una comisión posterior de USD 2. Era un caso de prueba para mi app de inversiones.

La comisión estaba guardada. El dashboard seguía mostrando USD 20 de ganancia realizada y la posición cerrada ya no aparecía en la tabla.

El problema se veía al juntar dos partes que por separado parecían razonables: el importador guardaba el cargo y el dashboard aplicaba una regla pensada para posiciones abiertas. Corregir solo la tarjeta habría dejado la tabla y la distribución con otro resultado.

Pasé los tres cálculos actuales a un mismo libro y repetí la prueba en el navegador, primero con el formulario manual y después con un archivo sintético de XTB. En los dos casos pude ver la posición cerrada y los USD 18 realizados.

Ahora tengo ese recorrido como prueba. Si algún cambio vuelve a mostrar USD 20 después de guardar la comisión, quiero enterarme ahí.

## 2. Entraba desde el correo y la app seguía viéndome como visitante

Abría el enlace de acceso de Investment Tracker, aterrizaba en la portada y volvía a ver «Iniciar sesión».

La portada carga una demo para cualquiera. Verla después de abrir el correo no demostraba que el login hubiera funcionado. El código se canjeaba en el servidor, pero todavía tenía que conseguir que las cookies llegaran al navegador con la redirección.

Puse las cookies en esa misma respuesta y añadí pruebas para comprobarla. Conservé la demo: la prueba ahora distingue entre un visitante que puede verla y alguien que intenta abrir una página privada sin sesión.

El cambio que más me sirvió fue hacer que la prueba mirara lo mismo que yo necesitaba saber: si después del correo podía entrar a una página que requiere sesión.

## 3. Probé que mi CI podía fallar por un dólar

Para probar el build de producción de Investment Tracker arranqué una base temporal y un buzón local. Entré desde el correo, importé un CSV sintético de Trii y comprobé que hubiera una compra por USD 20. Al reconfirmar el mismo borrador, el número de operaciones y el importe quedaron iguales.

Después cambié solo la expectativa de la prueba: USD 21. Falló justo ahí. Restauré el valor y la suite volvió a pasar completa.

Ese experimento me dio más confianza que ver cinco marcas verdes: sé que el runner detecta al menos esa diferencia entre lo esperado y lo que realmente devuelve la app. Lo comprobé en local. Queda demostrar el bloqueo en un PR y ensayar la recuperación en un entorno aislado.

## 4. Si falta un precio nuevo, quiero saber de cuándo es el anterior

Decidí que el dashboard de Investment Tracker leyera cotizaciones guardadas. Así puedo abrirlo aunque el proveedor de precios esté fallando. El costo es que una cifra puede seguir apareciendo después de perder vigencia.

En una prueba controlada hice que Yahoo respondiera con un límite de solicitudes. Para el instrumento de prueba, el worker pasó a Stooq y guardó la fuente junto al precio. También probé el doble fallo: la caché anterior quedó intacta.

Pude comprobar el flujo con el runtime y el navegador locales, usando respuestas simuladas. Cuando lo contrasté con el proveedor real, recibí HTML en vez del CSV esperado. Todavía no puedo confirmar qué símbolo corresponde al instrumento ni en qué moneda devuelve la cotización, así que no doy el respaldo por listo.

## 5. Primero quiero que me sirva para cerrar mi propio mes

Estoy construyendo Investment Tracker para reunir operaciones de distintos brókeres y revisar mis inversiones en pesos y dólares. Cuando miré qué herramientas existen, encontré varias que ya resuelven parte del problema. No encontré evidencia suficiente para afirmar que haya demanda en Colombia para mi alternativa.

Por ahora voy a priorizar mi uso: importar los extractos que realmente recibo, conciliar posiciones y comisiones por bróker y poder revisar el total consolidado.

Quiero llegar a un modo sin cuenta que guarde los movimientos en el dispositivo y permita restaurar un respaldo cifrado. Esa es la dirección. Hoy la app sigue guardando operaciones e importaciones en Supabase.

Mi próximo criterio es pasar dos cierres propios y poder restaurar los datos en una instalación limpia. Si después tiene sentido mostrarlo, usaré datos ficticios y me interesará saber si alguien volvería para el siguiente cierre.

## 6. Lo que un `200 OK` no me decía sobre dos carteras

Mientras trabajaba en varias carteras para Investment Tracker, una revisión me señaló que varias pruebas comprobaban que la API respondiera `200`. Eso no demostraba que el contenido perteneciera a la cartera seleccionada.

Usé dos carteras sintéticas con instrumentos e importes distintos. Después de cambiar el selector, comprobé los números del dashboard y qué cartera recibía las operaciones importadas. También probé el caso de dejar un formulario abierto y cambiar de cartera antes de enviarlo: prefiero que la app pida revisar el contexto antes de escribir en otra.

Desde entonces, al revisar una prueba de aislamiento me hago una pregunta: si la app devolviera los datos de la otra cartera, ¿esta prueba fallaría?
