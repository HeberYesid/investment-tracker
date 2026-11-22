## 1. Evidencia y contrato

- [ ] 1.1 Obtener del titular los archivos diarios originales de AAPL y SPY descargados de Stooq por el flujo normal; contrastar identidad, moneda, fecha y último cierre con las páginas oficiales. Registrar evidencia mínima sin publicar los archivos. Cubre: R1.
- [ ] 1.2 Confirmar que no existe otra feature activa, que este spec fue aprobado y que el panel elegido no altera los contratos ni los totales del servidor. Cubre: R3, R4.

## 2. Importación local

- [ ] 2.1 Probar y construir el lector con fixtures sintéticas del formato confirmado, límites de tamaño y filas, validación estricta de fecha, identidad, moneda y cierre; demostrar que se rechaza HTML y que una fecha anterior no sobrescribe una posterior. Cubre: R2, R4.
- [ ] 2.2 Construir la vista previa y el guardado por confirmación; verificar persistencia tras recarga, cancelación y borrado selectivo en el dispositivo. Cubre: R2, R3.
- [ ] 2.3 Probar la selección por sesión y mostrar fecha y proveedor sin hora inventada. Probar ausencia de cotización, cierre más nuevo, misma sesión y cotización Yahoo más nueva. Cubre: R4.

## 3. Verificación

- [ ] 3.1 Ejecutar la importación en Chromium con muestras locales; comprobar vista previa, cancelación, confirmación, etiqueta y ausencia de peticiones con datos del archivo. Cubre: R1–R4.
- [ ] 3.2 Ejecutar las comprobaciones del repositorio y realizar revisión independiente antes de marcar la feature terminada. Cubre: R1–R4.
