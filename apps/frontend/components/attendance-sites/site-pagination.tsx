import Link from 'next/link';

export function SitePagination({ basePath, page, totalPages, query = '' }: { basePath: string; page: number; totalPages: number; query?: string }) {
  if (totalPages <= 1) return null;
  const href = (nextPage: number) => `${basePath}?${query ? `${query}&` : ''}page=${nextPage}`;
  return <nav aria-label="Pagination du site" className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm">
    {page > 1 ? <Link className="font-semibold underline" href={href(page - 1)}>Précédent</Link> : <span className="text-slate-400">Précédent</span>}
    <span aria-current="page">Page {page} sur {totalPages}</span>
    {page < totalPages ? <Link className="font-semibold underline" href={href(page + 1)}>Suivant</Link> : <span className="text-slate-400">Suivant</span>}
  </nav>;
}
