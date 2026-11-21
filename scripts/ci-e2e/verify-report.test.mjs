import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyRequiredTests } from "./verify-report.mjs";

const passed = (file, title) => ({ file: `tests/e2e/${file}.spec.ts`, title, tests: [{ status: "expected", results: [{ status: "passed" }] }] });

function report() {
  return {
    stats: { expected: 5, skipped: 0 },
    suites: [
      { suites: [{ specs: [
        passed("home", "la portada es pública y muestra el portafolio demo"),
        passed("home", "la página privada solicita sesión"),
        passed("home", "la API privada responde 401 sin sesión"),
        passed("home", "el login ofrece el formulario de correo"),
      ] }] },
      { specs: [passed("csv-import", "confirma una compra por USD 20 y rechaza reconfirmar el mismo ID")] },
    ],
  };
}

test("acepta los cinco flujos obligatorios si todos pasan una vez", () => {
  assert.doesNotThrow(() => verifyRequiredTests(report()));
});

test("rechaza si desaparece el caso de CSV incluso con estadísticas verdes", () => {
  const incomplete = report();
  incomplete.suites.pop();
  assert.throws(() => verifyRequiredTests(incomplete), /resultados E2E obligatorios/);
});

test("rechaza una prueba omitida o fallida", () => {
  for (const status of ["skipped", "failed"]) {
    const invalid = report();
    invalid.suites[1].specs[0].tests[0].results[0].status = status;
    assert.throws(() => verifyRequiredTests(invalid), /prueba E2E obligatoria/);
  }
});

test("rechaza reemplazar un caso obligatorio por otro que también pasa", () => {
  const duplicate = report();
  const specs = duplicate.suites[0].suites[0].specs;
  specs[0] = specs[1];
  assert.throws(() => verifyRequiredTests(duplicate), /prueba E2E obligatoria/);
});
