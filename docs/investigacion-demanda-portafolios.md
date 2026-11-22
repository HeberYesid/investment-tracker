# Demanda de una app para seguir varios portafolios de acciones

**Fecha:** 22 de noviembre de 2026. **Alcance:** revisión exploratoria de fuentes públicas. No se hicieron encuestas, entrevistas ni pruebas de los productos competidores.

## Conclusión y decisión

Hay señales claras de adopción internacional de herramientas para consolidar inversiones de varios brókeres. Las fuentes consultadas no permiten estimar cuántas personas en Colombia necesitan varios portafolios en una misma app ni cuántas pagarían por una alternativa privada. Esto no indica que no haya demanda: indica que el nicho local todavía no está validado.

**Primero, hacer que Investment Tracker sirva para uso personal y privado.** La apertura al público queda como opción futura, no como compromiso. El modo local sin cuenta y con respaldo cifrado es la dirección elegida, no una funcionalidad disponible. La versión actual almacena operaciones y datos de la vista previa en Supabase; ejecutar la interfaz localmente no cambia el destino de esos datos si el backend es remoto.

## Evidencia consultada

| Fuente | Hallazgo | Límite de la señal |
| --- | --- | --- |
| [Sharesight: planes y precios de EE. UU.](https://sharesight.com/us/pricing) | La empresa reporta más de 200.000 inversionistas activos. Su plan gratuito incluye un portafolio; el plan Standard admite cuatro por USD 24 al mes con facturación mensual, o USD 18 al mes con facturación anual. | Es una cifra reportada por la empresa. Los planes no indican cuántos usuarios tienen varios portafolios, pagan o están en Colombia. |
| [getquin en Google Play](https://play.google.com/store/apps/details?hl=en_US&id=com.getquin.app) | La ficha muestra **100.000+ descargas** en Android. La app agrega brókeres, portafolios y cuentas en una vista. | Las descargas no equivalen a usuarios activos ni indican qué funciones usan. |
| [Portfolio Performance](https://www.portfolio-performance.info/en/) y [su foro](https://forum.portfolio-performance.info/t/how-to-import-from-xtb-in-2026/39948) | Es una alternativa de escritorio de código abierto que guarda los datos en un archivo. En su foro hay una solicitud concreta para importar un Excel de XTB sin conversiones ni ajustes manuales. | La solicitud identifica una dificultad puntual; no demuestra que el problema sea general ni que no exista una solución en otra app. |
| [Capitally: seguridad y privacidad](https://mycapitally.com/features/security-and-privacy) y [formatos por bróker](https://mycapitally.com/es/help/troubleshooting-brokers) | El proveedor anuncia cifrado de extremo a extremo en el dispositivo, importación de archivos y soporte para formatos de XTB. | La privacidad y la importación ya existen en la categoría. No se auditó su cifrado ni se comprobó la compatibilidad con extractos colombianos. |
| [AI Money: seguimiento de inversiones](https://ai-money.app/es/blog/control-de-inversiones) | El proveedor contempla plataformas como Trii y Valores Bancolombia. Documenta el registro manual de posiciones y consultas de símbolos a su servidor para obtener cotizaciones de acciones y ETF. | Reconocer un bróker no equivale a importar sus extractos. La descripción comercial tampoco mide la demanda. |
| [Ejemplo en r/ColombiaFinanciera](https://www.reddit.com/r/ColombiaFinanciera/comments/1tr2nmx/hito_de_100k_en_inversion_consejos_y_preguntas/) | Un participante dice que usa Yahoo Finance para visualizar inversiones repartidas entre varios brókeres. | Es un ejemplo anecdótico de cómo se resuelve el problema hoy, no una muestra representativa. |

## Qué validar antes de abrirla al público

1. **Uso personal:** priorizar los extractos de los brókeres que realmente se usen. Comprobar que al volver a importar no se duplican operaciones, que posiciones, comisiones y saldos se pueden conciliar y que el respaldo cifrado se restaura en un entorno limpio.
2. **Qué debe agruparse:** distinguir varias cuentas de bróker dentro de una estrategia (filtro por bróker y total consolidado) de varios portafolios realmente separados (por ejemplo, largo plazo y trading).
3. **Interés externo:** tras dos cierres mensuales, comprobar si la herramienta ahorra tiempo y si los resultados son confiables. Si vale la pena explorar la apertura, mostrarla con datos ficticios a cinco personas que ya usen al menos dos brókeres. Buscar interés en volver para el siguiente cierre, no solo una reacción positiva a la demo.

La hipótesis por validar es que **importar extractos de brókeres colombianos sin corregirlos a mano, revisar el rendimiento en COP y USD y mantener los movimientos en el dispositivo** ofrece una ventaja útil frente a las alternativas. El registro público y la sincronización entre dispositivos quedan fuera de esta primera etapa.
