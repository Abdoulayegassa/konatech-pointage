'use client';

export default function SitePageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main><section className="rounded-2xl border border-red-200 bg-red-50 p-5" role="alert"><h2 className="font-bold">Données du site indisponibles</h2><p className="mt-1 text-sm">Une erreur a empêché le chargement de cette page. Aucune donnée organisationnelle de remplacement n’a été affichée.</p><button className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-bold" onClick={reset} type="button">Réessayer</button></section></main>;
}
