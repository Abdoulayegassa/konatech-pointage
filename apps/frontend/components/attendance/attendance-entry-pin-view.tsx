'use client';

import { startTransition, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const PIN_LENGTH = 4;
const SUCCESS_MESSAGE = 'Code valide. Redirection en cours...';
const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

function toPinDigits(pinCode: string) {
  return Array.from({ length: PIN_LENGTH }, (_, index) => pinCode[index] ?? '');
}

function resolvePinErrorMessage(message: string) {
  const normalizedMessage = message.trim();

  if (normalizedMessage === 'Identifiants invalides.') {
    return 'Identifiants invalides.';
  }

  if (
    normalizedMessage === 'Le code PIN doit contenir exactement 4 chiffres.'
  ) {
    return 'Le code PIN doit contenir exactement 4 chiffres';
  }

  if (
    normalizedMessage === 'Trop de tentatives. Reessayez dans quelques minutes.'
  ) {
    return 'Trop de tentatives. Reessayez dans quelques minutes.';
  }

  return 'Impossible de verifier ce code';
}

export function AttendanceEntryPinView({
  clearStaleSessionOnMount = false,
}: {
  clearStaleSessionOnMount?: boolean;
}) {
  const router = useRouter();
  const [pinDigits, setPinDigits] = useState<string[]>(
    Array.from({ length: PIN_LENGTH }, () => ''),
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pinCode = pinDigits.join('');
  const canSubmit = pinCode.trim().length === PIN_LENGTH;

  useEffect(() => {
    if (!clearStaleSessionOnMount) {
      return;
    }

    let isMounted = true;

    void fetch('/api/auth/attendance-entry-session', {
      method: 'DELETE',
    }).finally(() => {
      if (isMounted) {
        router.refresh();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [clearStaleSessionOnMount, router]);

  function updateDigits(nextDigits: string[]) {
    setPinDigits(nextDigits.slice(0, PIN_LENGTH));
    setFeedback(null);
  }

  function handleKeypadDigit(digit: string) {
    if (isSubmitting || pinCode.length >= PIN_LENGTH) {
      return;
    }

    updateDigits(toPinDigits(`${pinCode}${digit}`));
  }

  function handleKeypadDelete() {
    if (isSubmitting || pinCode.length === 0) {
      return;
    }

    updateDigits(toPinDigits(pinCode.slice(0, -1)));
  }

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) {
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    let redirectTo: string | null = null;

    try {
      const response = await fetch('/api/auth/attendance-entry-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pinCode: pinCode.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: resolvePinErrorMessage(data.error ?? ''),
        });
        return;
      }

      redirectTo = data.redirectTo ?? '/attendance-entry';
      setFeedback({
        tone: 'success',
        message: SUCCESS_MESSAGE,
      });

      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });

      const redirectPath = redirectTo;

      startTransition(() => {
        router.replace(redirectPath);
        router.refresh();
      });
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Impossible de verifier ce code',
      });
    } finally {
      if (!redirectTo) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fff8f2] px-4 py-5 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,246,239,0.96),rgba(255,252,249,0.98)_44%,rgba(255,255,255,1))]" />

      <div className="relative w-full max-w-[380px]">
        <Card className="overflow-hidden rounded-[32px] border border-[#f0d7c6] bg-white/96 shadow-[0_30px_70px_rgba(16,50,60,0.12)]">
          <CardContent className="space-y-5 px-5 py-6 sm:px-6 sm:py-7">
            <div className="flex justify-center">
              <Image
                alt="Konatech"
                className="h-auto w-28 object-contain sm:w-32"
                height={120}
                priority
                src="/konatech-logo.png"
                width={240}
              />
            </div>

            <div className="space-y-1 text-center leading-none">
              <p className="text-[1.52rem] font-black tracking-normal text-[#10323c]">
                KONATECH
              </p>
              <p className="text-[1.52rem] font-black tracking-normal text-accent">
                POINTAGE
              </p>
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold leading-5 text-[#53656d]">
                Entrez votre code PIN à 4 chiffres
              </p>
            </div>

            <div className="space-y-5 pt-1">
              <div className="space-y-4">
                <span className="sr-only" id="pin-label">
                  Code PIN
                </span>

                <div
                  aria-describedby="pin-help"
                  aria-labelledby="pin-label"
                  className="flex items-center justify-center gap-2.5 min-[380px]:gap-3 sm:gap-4"
                  role="group"
                >
                  {pinDigits.map((digit, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-[20px] border text-2xl font-bold text-[#102f3a] transition-all duration-200 min-[380px]:h-[3.85rem] min-[380px]:w-[3.85rem]',
                        digit
                          ? 'border-orange-300 bg-white shadow-[0_12px_26px_rgba(249,115,22,0.14)]'
                          : 'border-slate-200 bg-slate-50/70 shadow-[0_10px_24px_rgba(16,50,60,0.05)]',
                        feedback?.tone === 'error' &&
                          'border-red-300 bg-red-50/80 text-red-800',
                      )}
                      aria-invalid={feedback?.tone === 'error'}
                      aria-label={`Chiffre ${index + 1}`}
                    >
                      {digit ? '•' : ''}
                    </div>
                  ))}
                </div>

                <p className="sr-only" id="pin-help">
                  Entrez votre code PIN à 4 chiffres.
                </p>
              </div>

              <div
                aria-label="Clavier numérique"
                className="mx-auto grid max-w-[320px] grid-cols-3 gap-2.5 min-[380px]:gap-3"
                role="group"
              >
                {KEYPAD_DIGITS.map((digit) => (
                  <button
                    key={digit}
                    className="flex h-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-xl font-bold text-[#102f3a] shadow-[0_8px_20px_rgba(16,50,60,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 min-[380px]:h-16"
                    disabled={isSubmitting || pinCode.length >= PIN_LENGTH}
                    type="button"
                    onClick={() => handleKeypadDigit(digit)}
                  >
                    {digit}
                  </button>
                ))}

                <button
                  aria-label="Supprimer le dernier chiffre"
                  className="flex h-14 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 text-base font-bold text-slate-600 shadow-[0_8px_20px_rgba(16,50,60,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 min-[380px]:h-16"
                  disabled={isSubmitting || pinCode.length === 0}
                  type="button"
                  onClick={handleKeypadDelete}
                >
                  Suppr.
                </button>

                <button
                  className="flex h-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-xl font-bold text-[#102f3a] shadow-[0_8px_20px_rgba(16,50,60,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 min-[380px]:h-16"
                  disabled={isSubmitting || pinCode.length >= PIN_LENGTH}
                  type="button"
                  onClick={() => handleKeypadDigit('0')}
                >
                  0
                </button>

                <button
                  aria-label="Valider le code PIN"
                  className="flex h-14 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#ff8a1f,#f97316_48%,#df5f0b)] text-base font-extrabold text-white shadow-[0_16px_30px_rgba(249,115,22,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_rgba(249,115,22,0.34)] active:scale-[0.98] disabled:bg-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none min-[380px]:h-16"
                  disabled={!canSubmit || isSubmitting}
                  type="button"
                  onClick={handleSubmit}
                >
                  {isSubmitting ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                    />
                  ) : (
                    'OK'
                  )}
                </button>
              </div>
            </div>

            {feedback ? (
              <div
                aria-live="polite"
                className={cn(
                  'rounded-2xl border px-4 py-3 text-center text-sm font-medium shadow-[0_10px_24px_rgba(16,50,60,0.05)]',
                  feedback.tone === 'success' &&
                    'border-emerald-200 bg-emerald-50 text-emerald-700',
                  feedback.tone === 'error' &&
                    'border-red-100 bg-red-50 text-red-700',
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            <p className="text-center text-xs leading-5 text-[#7b878d]">
              Accès réservé aux employés autorisés
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
