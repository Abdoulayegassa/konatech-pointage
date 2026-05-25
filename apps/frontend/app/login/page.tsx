import Image from 'next/image';
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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(11,87,98,0.12),transparent_28%),linear-gradient(180deg,#fff8f3_0%,#eef3f6_100%)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),transparent)]" />
      <div className="pointer-events-none absolute left-[-8rem] top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute right-[-7rem] top-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center">
        <div className="grid w-full gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
          <Card className="hidden overflow-hidden rounded-[30px] border-white/10 bg-[linear-gradient(180deg,rgba(10,51,62,0.98),rgba(7,34,43,0.98))] text-white shadow-[0_24px_64px_rgba(7,34,43,0.26)] lg:order-1 lg:block">
            <CardHeader className="relative space-y-5 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 lg:space-y-7 lg:px-8 lg:pb-6 lg:pt-8">
              <div className="absolute inset-x-6 top-0 h-1 rounded-full bg-[linear-gradient(90deg,#f97316_0%,#fb923c_42%,rgba(255,255,255,0.55)_100%)]" />
              <div className="flex items-center justify-between gap-4">
                <Image
                  alt="Konatech"
                  className="h-auto w-[98px] object-contain sm:w-[118px] lg:w-[124px]"
                  height={120}
                  priority
                  src="/konatech-logo.png"
                  width={240}
                />
                <Badge
                  className="hidden w-fit border-white/15 bg-white/10 text-white/85 sm:inline-flex"
                  variant="outline"
                >
                  Admin
                </Badge>
              </div>
              <div className="space-y-3 lg:space-y-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-100/80">
                  KONATECH POINTAGE
                </p>
                <CardTitle className="hidden max-w-xl text-3xl font-black leading-tight text-white sm:text-4xl lg:block lg:text-[2.7rem]">
                  Gérez les présences,
                  <br />
                  retards et absences
                  <br />
                  de votre équipe
                  <br className="hidden sm:block" />
                  avec simplicité.
                </CardTitle>
                <CardTitle className="text-2xl font-black leading-tight text-white lg:hidden">
                  Plateforme moderne de suivi RH.
                </CardTitle>
                <p className="max-w-md text-sm leading-6 text-slate-200/82 sm:text-base">
                  Plateforme moderne de suivi et de pilotage RH.
                </p>
              </div>
            </CardHeader>

            <CardContent className="hidden space-y-5 px-5 pb-5 sm:px-6 sm:pb-6 lg:block lg:px-8 lg:pb-8">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  'Suivi des présences',
                  'Pointage sécurisé',
                  'Rapports mensuels',
                ].map((item) => (
                  <div
                    key={item}
                    className="group rounded-[22px] border border-white/10 bg-white/[0.07] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.09]"
                  >
                    <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-200/10 bg-accent/18 text-sm font-bold text-orange-100 shadow-[0_10px_24px_rgba(249,115,22,0.18)]">
                      +
                    </span>
                    <p className="text-sm font-bold leading-5 text-white">
                      {item}
                    </p>
                  </div>
                ))}
              </div>

              {showDemoAccounts ? (
                <div className="hidden rounded-[24px] border border-white/10 bg-white/[0.06] p-5 text-sm text-slate-200/85 lg:block">
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

          <Card className="order-1 overflow-hidden rounded-[30px] border-white/75 bg-white/96 shadow-[0_22px_56px_rgba(15,45,58,0.12)] backdrop-blur lg:order-2">
            <CardHeader className="space-y-5 border-b border-slate-200/70 px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
                  KONATECH POINTAGE
                </p>
                <CardTitle className="text-3xl font-black leading-tight text-slate-950">
                  Connexion administrateur
                </CardTitle>
                <p className="text-sm leading-6 text-slate-600 sm:text-base">
                  Accédez à votre espace de gestion.
                </p>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
              <LoginForm redirectTo={redirectTo} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
