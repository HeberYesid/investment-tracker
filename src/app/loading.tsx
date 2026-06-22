export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="h-14 w-full animate-pulse rounded-3xl bg-white/80 ring-1 ring-slate-200" />
        <div className="h-20 w-full animate-pulse rounded-[2rem] bg-white ring-1 ring-slate-200" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"
            />
          ))}
        </div>
        <div className="h-64 w-full animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
      </div>
    </main>
  );
}
