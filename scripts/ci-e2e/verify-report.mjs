const required = new Map([
  ["home.spec.ts", new Set([
    "la portada es pública y muestra el portafolio demo",
    "la página privada solicita sesión",
    "la API privada responde 401 sin sesión",
    "el login ofrece el formulario de correo",
  ])],
  ["csv-import.spec.ts", new Set([
    "confirma una compra por USD 20 y rechaza reconfirmar el mismo ID",
  ])],
]);

export function verifyRequiredTests(report) {
  const seen = new Set();
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      const file = spec.file.split(/[\\/]/).at(-1);
      const key = `${file}:${spec.title}`;
      const [test] = spec.tests;
      if (!required.get(file)?.has(spec.title) || seen.has(key) || spec.tests.length !== 1 ||
          test?.status !== "expected" || test.results.length !== 1 || test.results[0].status !== "passed") {
        throw new Error("Una prueba E2E obligatoria falta, no aprobó o se ejecutó más de una vez.");
      }
      seen.add(key);
    }
    for (const nested of suite.suites ?? []) visit(nested);
  }
  for (const suite of report.suites ?? []) visit(suite);
  const expected = [...required.values()].reduce((total, tests) => total + tests.size, 0);
  if (seen.size !== expected || report.stats?.expected !== expected || report.stats?.skipped !== 0) {
    throw new Error("El reporte no contiene todos los resultados E2E obligatorios sin omisiones.");
  }
}
