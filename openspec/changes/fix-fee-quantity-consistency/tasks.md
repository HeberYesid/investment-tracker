## 1. Contrato y base existente

- [x] 1.1 Crear `cantidad_por_tipo_no_infiere_cero` en las pruebas de validación: matriz de los seis tipos, cero explícito, negativos, nulos, ausentes, strings, no finitos y fracciones al borde de la escala. Aplicar el esquema compartido en las entradas completas y conservar contratos monetarios y FX. Cubre: R1, R2.
- [x] 1.2 Añadir `bd_admite_fee_cero_sin_reescribir_legado` en el esquema local migrado (PGlite o PostgreSQL descartable): comprobar `FEE` con cero, fracción positiva mínima y supervivencia e identificabilidad de un `FEE` histórico de cantidad 1; comprobar que eliminar lógicamente un legado sigue disponible sin cambiar su cantidad. No crear migración. Cubre: R1, R2, R9.

## 2. Alta y edición manual

- [x] 2.1 Escribir `post_fee_valida_cantidad_antes_de_catalogo_y_escrituras`: `201` y persistencia de cantidad 0 y comisión USD 2; `422` en `quantity` sin resolución de catálogo, inserción, auditoría ni invalidación de caché para los pares incorrectos. Conservar autorización y portafolio activo. Cubre: R1, R2, R4.
- [x] 2.2 Escribir `patch_valida_el_par_efectivo_y_la_version_leida`: probar toda la matriz D2, incluido cambio de tipo y cantidad juntos en ambos sentidos, `404` fuera de contexto, corrección explícita del legado con auditoría y edición intercalada que devuelve `409` sin escribir sobre la versión cambiada. Implementar validación y escritura condicional. Cubre: R1, R2, R5, R9.
- [x] 2.3 Escribir `formulario_fee_exige_cero_sin_resetear_cantidad`: alta/edición con mensajes de i18n, campo vacío, cero, cambio de tipo, cantidad histórica visible sin mutación al abrir, y envío con número y no string. Probar que el resto de tipos mantiene la regla positiva y que siguen intactas selección de referencia y captura de FX. Cubre: R1, R2, R3, R9.

## 3. Importación

- [x] 3.1 Escribir `xtb_no_oculta_cargos_reconocidos` con un libro XLSX sintético de `Cash Operations` de estructura existente: débito válido de cada tipo, símbolo ausente, monto ambiguo/ilegible/cero/submínimo y fecha inválida. Probar parser y preview con lote mixto y archivo con solo cargos inválidos: motivo visible, conteos, persistencia `INVALID` sin candidata, sin referencia ni confirmación. Mantener los formatos vigentes. Cubre: R1, R2, R6, R7.
- [x] 3.2 Escribir `otros_parsers_preservan_comisiones_asociadas`: fixtures del formato admitido de cada bróker, comisión asociada donde corresponda, tipos sin mapeo independiente que no generan `FEE` y caso de XTB con tipos fuera de alcance que conservan omisión. Cubre: R11.
- [x] 3.3 Escribir `commit_revalida_candidatas_antes_del_catalogo`: comprobar lotes válidos con `FEE` de cero y mezcla con candidatos de preview antiguo/desactualizado, pases válidos de otros tipos, decisiones para IDs descartados, rechazo por número de fila y ningún efecto de catálogo por descartadas. Probar lote sin inserciones, sin filas `VALID`, repetición `409`, parcialidad, conteo y conservación del JSON previo; no cambiar la normalización monetaria ni el contrato de lote. Cubre: R1, R2, R8, R9.

## 4. P/L y verificación de implementación

- [x] 4.1 Escribir `cierre_con_fee_persistido_muestra_18_por_dos_entradas`: probar con datos locales sintéticos el recorrido de alta y el recorrido de preview/commit XTB hasta la proyección real de resumen y tabla, con cierre previo de USD 20 y comisión de USD 2 en otro día. Afirmar saldos en cero y USD 18, `INVALID_TRADE` en legado de cantidad 1, capitalización con posición abierta y `AMBIGUOUS_DAY_ORDER` con baja del mismo día. No modificar el libro para pasar la prueba. Cubre: R6, R8, R9, R10.
- [x] 4.2 Verificar el flujo crítico en navegador local aislado con datos sintéticos (`pnpm test:e2e` y fixture autenticada focalizada): alta, mensajes, edición, preview con cargo válido e incidencia; registrar evidencia y cierre de recursos. Cubre: R3–R8, R10.
- [x] 4.3 Ejecutar `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test:run`, `pnpm build`, `openspec validate fix-fee-quantity-consistency --strict` y `node init.mjs`. Revisar el diff y documentar pruebas por requisito en `progress/impl_fix-fee-quantity-consistency.md` para revisión independiente. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11.
