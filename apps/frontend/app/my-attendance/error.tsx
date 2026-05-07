'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type MyAttendanceErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MyAttendanceErrorPage({
  error,
  reset,
}: MyAttendanceErrorPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />

      <div className="mx-auto flex min-h-screen max-w-4xl items-center">
        <Card className="admin-reveal w-full overflow-hidden rounded-[30px] border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))] shadow-soft">
          <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
          <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="warning">Erreur de rendu</Badge>
              <Badge variant="outline">My attendance</Badge>
            </div>
            <CardTitle className="text-2xl text-slate-950">
              Votre cockpit de pointage n&apos;a pas pu se charger correctement
            </CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Une erreur inattendue a interrompu le chargement de vos donnees
              personnelles de presence. Aucun pointage n&apos;a ete modifie.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-5 text-sm leading-6 text-slate-600">
            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 font-medium text-slate-950">
              {error.message}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={reset}>Reessayer</Button>
              <Button
                onClick={() => window.location.assign('/my-attendance')}
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
