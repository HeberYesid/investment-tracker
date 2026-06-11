import Link from "next/link";

import { MainNavigation } from "@/components/layout/main-navigation";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
            Base USD · Costo operativo USD 0
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Tu portafolio consolidado
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Registra operaciones manuales, importa CSV de tus brokers y
                prepara el terreno para métricas de rentabilidad, drawdown y
                distribución por broker, sector y país.
              </p>
            </div>
            <div className="grid gap-3 rounded-3xl bg-slate-950 p-4 text-white">
              <span className="text-sm text-slate-300">Equity total</span>
              <strong className="text-3xl">USD 0.00</strong>
              <span className="text-sm text-emerald-300">
                Listo para conectar operaciones
              </span>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/trades">Registrar operación</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/import">Importar CSV</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            ["Brokers", "eToro · XTB · Trii · eTrading"],
            ["Moneda base", "USD con conversión COP→USD"],
            ["Privacidad", "RLS activo desde la primera migración"],
          ].map(([title, body]) => (
            <article
              className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              key={title}
            >
              <h2 className="font-semibold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
