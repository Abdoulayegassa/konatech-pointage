import { AcceptInvitationForm } from '@/components/team/accept-invitation-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageShell } from '@/components/layout/page-shell';

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <PageShell maxWidthClassName="max-w-xl">
      <Card className="mt-10 overflow-hidden rounded-[30px] bg-white/95 shadow-soft">
        <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(16,50,60,0.92))]" />
        <CardHeader className="space-y-3 border-b">
          <Badge className="w-fit" variant="warning">
            Invitation sécurisée
          </Badge>
          <CardTitle className="text-2xl">Rejoindre une organisation</CardTitle>
          <p className="text-sm leading-6 text-slate-600">
            Validez votre identité pour activer votre compte membre Konatech.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <AcceptInvitationForm token={token} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
