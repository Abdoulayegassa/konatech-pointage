import Image from 'next/image';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getCurrentUser } from '@/lib/auth';
import { resolvePostLoginRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'InOut — Connexion',
};

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
    redirect(
      resolvePostLoginRedirect(
        user.accessRole,
        redirectTo,
        user.membership?.role,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F6F8] p-0 text-[#303030] sm:p-5 lg:p-8">
      <div className="mx-auto grid min-h-screen max-w-[1440px] overflow-hidden bg-white sm:min-h-[calc(100vh-2.5rem)] sm:rounded-2xl sm:shadow-[0_18px_60px_rgba(23,25,29,0.08)] md:min-h-[calc(100vh-2.5rem)] md:grid-cols-[0.84fr_1.16fr] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[0.94fr_1.06fr]">
        <section
          aria-label="INOUT"
          className="relative flex min-h-[210px] flex-col justify-between overflow-hidden bg-[#17191D] px-6 py-6 text-white sm:min-h-[260px] sm:px-10 sm:py-8 md:min-h-0 md:px-8 md:py-10 lg:px-12 lg:py-12 xl:px-20"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-1/2 hidden h-[440px] w-[440px] -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.06] lg:flex">
            <div className="flex h-[320px] w-[320px] items-center justify-center rounded-full border border-white/[0.06]">
              <div className="flex h-[200px] w-[200px] items-start justify-center rounded-full border border-white/[0.07]">
                <span className="mt-[-2px] h-2 w-2 rounded-full bg-[#F35A24]" />
              </div>
            </div>
          </div>

          <a aria-label="INOUT, accueil" className="relative z-10 inline-flex w-fit items-center" href="/login">
            <span className="inline-flex items-center rounded-lg border border-white/15 bg-[#F5F6F8] p-2.5">
              <Image
                alt="INOUT"
                className="h-auto w-[132px] sm:w-[156px]"
                height={295}
                priority
                src="/brand/inout-logo.png"
                width={846}
              />
            </span>
          </a>

          <div className="relative z-10 mt-7 max-w-[490px] lg:mb-8 lg:mt-auto">
            <h2 className="max-w-[460px] text-[26px] font-semibold leading-[1.18] tracking-[-0.035em] sm:text-[32px] md:text-[28px] lg:text-[36px] xl:text-[42px]">
              Le temps de travail, sous contrôle.
            </h2>
            <p className="mt-3 max-w-[410px] text-sm leading-6 text-white/65 sm:text-[15px]">
              Gérez les présences, retards et absences de vos équipes, simplement.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10 md:px-6 lg:px-12 xl:px-16">
          <div className="w-full max-w-[400px]">
            <header className="mb-7 space-y-2">
              <p className="text-xs font-semibold tracking-[0.12em] text-[#F35A24]">VOTRE ESPACE</p>
              <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-[#202124]">Connexion</h1>
              <p className="text-sm leading-5 text-[#666B73]">Accédez à votre espace.</p>
            </header>

            <LoginForm redirectTo={redirectTo} />

            {showDemoAccounts ? (
              <details className="mt-8 border-t border-[#E8E9EC] pt-5 text-sm">
                <summary className="cursor-pointer list-none font-medium text-[#626770] outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#F35A24] focus-visible:ring-offset-4">
                  Accès de démonstration <span className="ml-1 text-xs text-[#858991]">· Développement uniquement</span>
                </summary>
                <div className="mt-4 space-y-3 rounded-lg bg-[#F7F7F8] p-4 text-xs text-[#545861]">
                  <p className="font-semibold text-[#303238]">Développement uniquement</p>
                  <div>
                    <p className="font-medium">Compte démo admin</p>
                    <p>awa.traore@konatech.local</p>
                    <p>KonatechAdmin123!</p>
                  </div>
                  <div>
                    <p className="font-medium">Compte démo employé</p>
                    <p>ibrahim.coulibaly@konatech.local</p>
                    <p>KonatechEmployee123!</p>
                  </div>
                </div>
              </details>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
