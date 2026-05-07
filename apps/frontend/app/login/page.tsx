import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth';
import { resolvePostLoginRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams?: Promise<{
    redirectTo?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectTo = resolvedSearchParams?.redirectTo;
  const showDemoAccounts = process.env.NODE_ENV !== 'production';

  if (user) {
    redirect(resolvePostLoginRedirect(user.accessRole, redirectTo));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(11,87,98,0.12),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef3f6_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),transparent)]" />
      <div className="pointer-events-none absolute left-[-8rem] top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute right-[-7rem] top-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center">
        <div className="grid w-full gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <Card className="order-2 overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(10,51,62,0.98),rgba(7,34,43,0.98))] text-white shadow-[0_26px_70px_rgba(7,34,43,0.28)] lg:order-1">
            <CardHeader className="relative space-y-6 pb-5">
              <div className="absolute inset-x-6 top-0 h-1 rounded-full bg-[linear-gradient(90deg,#f97316_0%,#fb923c_42%,rgba(255,255,255,0.55)_100%)]" />
              <Badge className="w-fit border-white/15 bg-white/10 text-white" variant="outline">
                KONATECH POINTAGE
              </Badge>
              <div className="space-y-4">
                <CardTitle className="max-w-xl text-3xl leading-tight text-white sm:text-4xl">
                  Gérez les présences, les retards et les absences de votre équipe depuis une interface simple et sécurisée.
                </CardTitle>
                <p className="max-w-lg text-base leading-7 text-slate-200/88">
                  Une expérience de connexion pensée pour un produit RH moderne,
                  avec un accès rapide aux outils de suivi et de pilotage.
                </p>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  'Suivi des présences',
                  'Pointage sécurisé',
                  'Rapports mensuels',
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  >
                    <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/18 text-sm font-semibold text-orange-100">
                      +
                    </span>
                    <p className="text-sm font-semibold text-white">{item}</p>
                  </div>
                ))}
              </div>

              {showDemoAccounts ? (
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 text-sm text-slate-200/85">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                      Comptes démo
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-100">
                      Développement uniquement
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                        Compte démo admin
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        awa.traore@konatech.local
                      </p>
                      <p className="mt-1 text-white/72">KonatechAdmin123!</p>
                    </div>

                    <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                        Compte démo employé
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        ibrahim.coulibaly@konatech.local
                      </p>
                      <p className="mt-1 text-white/72">KonatechEmployee123!</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="order-1 border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,45,58,0.12)] backdrop-blur lg:order-2">
            <CardHeader className="space-y-5 border-b border-slate-200/80 pb-6">
              <Badge
                className="w-fit border-accent/20 bg-accent/10 text-accent"
                variant="outline"
              >
                KONATECH POINTAGE
              </Badge>
              <div className="space-y-2">
                <CardTitle className="text-3xl text-slate-950">
                  Connexion
                </CardTitle>
                <p className="text-sm leading-6 text-slate-600 sm:text-base">
                  Accédez à votre espace de suivi.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <LoginForm redirectTo={redirectTo} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
