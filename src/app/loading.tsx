export default function Loading() {
  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <div className="h-14 w-full animate-pulse rounded-3xl bg-surface/80 ring-1 ring-border-subtle" />
        <div className="h-20 w-full animate-pulse rounded-[2rem] bg-surface ring-1 ring-border-subtle" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-border-subtle"
            />
          ))}
        </div>
        <div className="h-64 w-full animate-pulse rounded-2xl bg-surface ring-1 ring-border-subtle" />
      </div>
    </main>
  );
}
