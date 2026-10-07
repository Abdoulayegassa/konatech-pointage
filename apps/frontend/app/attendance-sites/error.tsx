'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AttendanceSitesError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-xl rounded-[28px]">
        <CardHeader>
          <CardTitle>Impossible de charger les sites de présence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-medium text-slate-600">
          <p>Aucune modification n’a été appliquée. Vous pouvez réessayer.</p>
          <Button onClick={reset}>Réessayer</Button>
        </CardContent>
      </Card>
    </main>
  );
}
