import { SiteAttendanceSettingsPanel } from '@/components/attendance-sites/site-attendance-settings-panel';
import { getSiteDetails } from '@/lib/api';
import { getSessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SiteSettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const token = await getSessionToken();
  if (!token) return <ErrorState />;
  try {
    const site = await getSiteDetails(token, siteId);
    return <main className="space-y-5"><header><h1 className="text-2xl font-black">Paramètres du site — {site.name}</h1><p className="text-sm text-slate-600">Informations et paramètres de pointage propres à ce site.</p></header>
      <section className="grid gap-3 sm:grid-cols-2"><Info label="État" value={site.isActive ? 'Actif' : 'Inactif'} /><Info label="Adresse / coordonnées GPS" value={`${site.latitude}, ${site.longitude}`} /><Info label="Rayon autorisé" value={`${site.allowedRadiusMeters} m`} /><Info label="Identifiant public de pointage" value={site.publicId} /></section>
      <SiteAttendanceSettingsPanel key={site.id} sites={[site]} initialSiteId={site.id} />
      <p className="text-xs text-slate-500">Le nom, les coordonnées, le rayon et l’état du site se gèrent dans le registre des sites. Les réglages d’organisation ne sont pas présentés comme des réglages de site.</p>
    </main>;
  } catch { return <ErrorState />; }
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 break-all font-semibold">{value}</p></div>; }
function ErrorState() { return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold">Paramètres indisponibles</h2><p className="mt-1 text-sm">Impossible de charger les paramètres de ce site. Vérifiez votre accès puis réessayez.</p></section>; }
