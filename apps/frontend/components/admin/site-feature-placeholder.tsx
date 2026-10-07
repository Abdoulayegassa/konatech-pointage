export function SiteFeaturePlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6" aria-label={title}>
    <p className="text-xs font-black uppercase tracking-widest text-amber-800">Vue site en préparation</p>
    <h2 className="mt-2 text-2xl font-black text-slate-950">{title}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">{description}</p>
  </section>;
}
