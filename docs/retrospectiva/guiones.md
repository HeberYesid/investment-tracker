# Investment Tracker contado en primera persona

Guiones para leer en voz alta. Las referencias al final de cada sección son para preparar la grabación, no para leerlas. Los ejemplos de dinero son sintéticos.

## Relato general · 3–4 minutos

Empecé Investment Tracker para llevar mis inversiones en un solo lugar. Arranqué con la captura manual y una decisión que me limitó desde el inicio: quería construirlo con un presupuesto de cero dólares al mes. Dejé el dólar como moneda base, pero guardé también el importe original. Lo aprendí con un detalle pequeño: en una lista estaba mostrando el precio original como si ya estuviera en dólares. Y al editar una operación en pesos, tenía que comprobar de nuevo la moneda y la dirección de la tasa.

Después llegaron los archivos de los brókeres. Separé el importador por origen porque un archivo de XTB no cuenta la historia de la misma manera que uno de Trii. La vista previa me dejaba explicar qué había entendido por fila antes de guardar. Cambió también el contrato del plan inicial: si una fila falla, otras sí pueden quedar importadas. Y rechazar el segundo intento de confirmar el mismo borrador no prueba qué pasa con dos confirmaciones simultáneas.

El ejemplo que mejor explica por qué tuve que revisar todo el recorrido es una comisión de dos dólares. En una prueba compré por cien y vendí por ciento veinte. Después registré el cargo. La operación quedó guardada, pero el resumen seguía en veinte y la tabla dejaba de mostrar la posición. Terminé usando un mismo libro para las tres vistas que dependían del cálculo actual. Pude ver dieciocho dólares tanto al cargar la comisión a mano como al importarla desde XTB. Si los datos antiguos no me permiten reconstruir el cálculo, muestro que no está disponible. Es distinto de haber comprobado que vale cero.

También me pasó que, al abrir un enlace de acceso, volvía a la portada y seguía viendo «Iniciar sesión». Tuve que poner las cookies en la misma respuesta que devuelve al navegador a la app. Y con varias carteras aprendí que el selector solo recuerda lo que quiero ver. El servidor tiene que comprobar a cuál pertenezco y evitar que un formulario viejo escriba en la equivocada. Para probar que no podía perderse el último propietario usé dos conexiones reales de base de datos; la prueba de navegador no me daba esa evidencia.

Con los precios tomé otra decisión: el dashboard lee lo que ya está guardado. En una prueba simulé que Yahoo limitaba las solicitudes y usé Stooq como respaldo. Si no consigo una cotización nueva, puedo mostrar la anterior con su antigüedad. El recorrido local pasó, pero cuando hice la comprobación pública recibí HTML en lugar del CSV que necesitaba. El respaldo todavía no está validado. En el piloto de integración vi que el build pasaba y que la prueba fallaba al esperar veintiún dólares en vez de veinte. Aún me falta demostrar el bloqueo en un PR y ensayar la vuelta a una versión anterior.

Hoy mi prioridad es más concreta: quiero que me sirva a mí para importar los extractos que uso, cuadrar cada bróker y revisar el total en pesos y dólares. Elegí ir hacia un modo sin cuenta, que guarde los movimientos en el dispositivo y permita restaurar un respaldo cifrado. Todavía guardo las operaciones y los datos de importación en Supabase. Antes de pensar en abrir la app, quiero pasar dos cierres propios y poder recuperar ese respaldo en una instalación limpia.

Para preparar la grabación: [ADRs](../adr/README.md) e [inventario de incidentes](incidentes.md).

## Cápsula 1 · «La comisión que sí se guardó» · 60–90 segundos

En una prueba compré por cien dólares, vendí por ciento veinte y registré una comisión posterior de dos. Esperaba dieciocho de ganancia realizada. El dashboard seguía diciendo veinte. La comisión estaba en la base y aun así la tabla ni siquiera mostraba la posición cerrada.

Primero tuve que corregir la entrada: para registrar ese cargo, la cantidad tiene que ser cero. Después seguí el dato hasta el cálculo. El resumen, la tabla y la distribución necesitaban salir del mismo libro; corregir una tarjeta habría dejado las otras dos con otra explicación. Al integrarlo encontré que la distribución esperaba números y no podía representar un resultado no disponible. Ajusté el contrato actual sin cambiar el histórico ni rellenar datos antiguos por mi cuenta.

Volví a correr el camino completo en un navegador con datos ficticios. Registré la comisión a mano y después repetí el escenario con un archivo de XTB. En ambos casos aparecieron dieciocho dólares y pude ver la posición cerrada.

Referencia: [ADR 009](../adr/009-libro.md).

## Cápsula 2 · «Entré con el enlace y seguía fuera» · 45–60 segundos

Abrí el enlace del correo. La app me devolvió a la portada y el menú seguía diciendo «Iniciar sesión». Como la portada también tiene una demo, parecía que todo había cargado bien. Solo que yo seguía entrando como visitante.

El callback tenía que devolver la sesión al navegador en la misma redirección. Até las cookies a esa respuesta y probé que salieran de ahí. Conservé la demo pública. Si entro sin sesión, una página privada todavía debe llevarme al login; si ya entré pero no tengo una cartera, necesito ver otro estado. La portada por sí sola no me dice cuál de esos casos estoy viendo.

Referencia: [ADR 006](../adr/006-sesion.md) e [I10–I12](incidentes.md#lecturas-sesión-y-permisos).

## Cápsula 3 · «Un ticker no identifica el instrumento» · 60 segundos

Cuando tenía un ticker en un extracto, parecía práctico usar la primera coincidencia. Pero el mismo símbolo puede existir en más de un mercado. Ahora separo la moneda en la que hice la operación de la moneda en que cotiza el instrumento y pido confirmación si la referencia no está clara.

En la revisión apareció un caso que no había probado. Ya había confirmado un grupo de filas. Empecé a cambiar una de ellas y dejé la elección a mitad. El asistente la volvía a tratar como si yo nunca la hubiera tocado. Cambié ese estado: una elección pendiente queda pendiente y la fila se informa por separado. Puedo confirmar las demás sin decidir por accidente qué instrumento va en esa fila.

Referencia: [ADR 008](../adr/008-catalogo.md).

## Cápsula 4 · «Lo que puedo afirmar de mis pruebas» · 60 segundos

En el piloto arranqué una base y un buzón temporales y probé el build de producción con un navegador. Ahí pude entrar desde el correo e importar una compra que debía quedar en veinte dólares. Confirmé el mismo borrador otra vez y comprobé que no apareciera una segunda operación.

Luego cambié solo la expectativa a veintiún dólares. El runner marcó exactamente esa prueba como fallida. Restauré la expectativa y volví a ver las cinco pruebas verdes. Quería comprobar que la prueba podía detectar una diferencia real en el resultado. Lo que tengo hasta ahora es evidencia local; todavía no he demostrado el bloqueo de una fusión en GitHub ni he ensayado una recuperación remota.

Referencia: [ADR 012](../adr/012-ci.md).

## Cápsula 5 · «Lo quiero útil para mí primero» · 45–60 segundos

Encontré otras herramientas que juntan inversiones de varios brókeres. Con eso no sé cuántas personas en Colombia necesitan lo mismo ni si usarían mi alternativa. Sé qué puedo probar con mis propios extractos: si consigo importar sin corregir el archivo a mano, conciliar cada cuenta y revisar el total en pesos y dólares.

Por eso elegí priorizar el uso personal. Quiero llegar a guardar los movimientos en el dispositivo, sin cuenta, con un respaldo cifrado que pueda restaurar. Hoy los datos todavía van a Supabase. Mi siguiente criterio de éxito no es sumar registros: es pasar dos cierres propios y poder reconstruir los datos desde un respaldo.

Referencia: [ADR 013](../adr/013-uso-personal.md).

## Cápsula 6 · «El gráfico solo se movía cuando yo compraba» · 45–60 segundos

En una versión del dashboard, la línea seguía casi quieta hasta que registraba otra operación. El cálculo usaba el último precio al que yo había comprado o vendido. Podía ver cuánto había puesto, pero no qué había hecho el mercado entre esas fechas.

Para corregirlo usé el precio de mercado conocido al cierre de cada período y lo combiné con la cantidad que tenía entonces. Cuando me falta histórico, todavía puedo estimar con el último precio de compra o venta, y lo indico en el gráfico. Una comisión o un dividendo ya no se convierten en ese precio de referencia.

Referencia: [ADR 005](../adr/005-evolucion.md).
