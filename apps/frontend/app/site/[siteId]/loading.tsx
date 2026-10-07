export default function SitePageLoading() {
  return <section aria-label="Chargement des données du site" aria-live="polite" className="animate-pulse space-y-4">
    <div className="h-8 w-64 rounded-xl bg-slate-200" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="h-28 rounded-2xl bg-slate-100" /><div className="h-28 rounded-2xl bg-slate-100" /><div className="h-28 rounded-2xl bg-slate-100" /><div className="h-28 rounded-2xl bg-slate-100" /></div>
    <div className="h-64 rounded-2xl bg-slate-100" />
    <span className="sr-only">Chargement…</span>
  </section>;
}
