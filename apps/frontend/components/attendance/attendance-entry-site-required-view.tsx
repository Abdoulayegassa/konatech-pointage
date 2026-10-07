import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';

export function AttendanceEntrySiteRequiredView() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fff8f2] px-4 py-6 sm:min-h-screen sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_34%),linear-gradient(180deg,rgba(255,246,239,0.96),rgba(255,252,249,0.98)_44%,rgba(255,255,255,1))]" />

      <Card className="relative w-full max-w-[460px] overflow-hidden rounded-[32px] border border-[#f0d7c6] bg-white/96 shadow-[0_30px_70px_rgba(16,50,60,0.13)] sm:rounded-[36px]">
        <CardContent className="space-y-6 px-6 py-8 text-center sm:px-8 sm:py-10">
          <div className="flex justify-center">
            <Image
              alt="Konatech"
              className="h-auto w-28 object-contain sm:w-32"
              height={120}
              priority
              src="/brand/inout-logo.png"
              width={240}
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">
              Pointage sécurisé
            </p>
            <h1 className="text-2xl font-black text-primary sm:text-3xl">
              Site de pointage requis
            </h1>
            <p className="text-sm font-semibold leading-6 text-slate-600 sm:text-base">
              Scannez le QR code affiché sur votre site pour ouvrir le clavier
              PIN et commencer votre pointage.
            </p>
          </div>

          <div className="rounded-[22px] border border-accent/15 bg-accent/5 px-4 py-4 text-sm font-medium leading-6 text-slate-700">
            Aucun site n&apos;a été sélectionné. Pour votre sécurité, aucun site
            ni aucune organisation ne sera choisi automatiquement.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
