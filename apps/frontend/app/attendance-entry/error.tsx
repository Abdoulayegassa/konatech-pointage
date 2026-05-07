'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AttendanceEntryErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AttendanceEntryErrorPage({
  error,
  reset,
}: AttendanceEntryErrorPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />

      <div className="mx-auto flex min-h-screen max-w-2xl items-center">
        <Card className="admin-reveal w-full overflow-hidden rounded-[28px] border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))] shadow-soft">
          <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
          <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="warning">Erreur de rendu</Badge>
              <Badge variant="outline">Pointage QR</Badge>
            </div>
            <CardTitle className="text-2xl text-slate-950">
              La page de pointage QR n&apos;a pas pu se charger correctement
            </CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Une erreur inattendue a interrompu le chargement de votre entree
              de presence. Aucun pointage n&apos;a ete modifie.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-5 text-sm leading-6 text-slate-600">
            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 font-medium text-slate-950">
              {error.message}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={reset}>Reessayer</Button>
              <Button
                onClick={() => window.location.assign('/attendance-entry')}
                variant="secondary"
              >
                Recharger la page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
