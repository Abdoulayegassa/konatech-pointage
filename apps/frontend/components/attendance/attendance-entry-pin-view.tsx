'use client';

import { startTransition, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import type { AuthenticatedUser } from '@/lib/api';
import { cn } from '@/lib/utils';

const PIN_LENGTH = 4;
const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

type AttendanceEntrySessionUser = AuthenticatedUser & {
  jobTitle?: string | null;
  position?: string | null;
};

type EmployeeConfirmation = {
  name: string;
  detail: string;
};

type FeedbackState =
  | {
      tone: 'success';
      employee: EmployeeConfirmation;
    }
  | {
      tone: 'error';
      message: string;
    }
  | null;

function toPinDigits(pinCode: string) {
  return Array.from({ length: PIN_LENGTH }, (_, index) => pinCode[index] ?? '');
}

function resolvePinErrorMessage(message: string) {
  const normalizedMessage = message.trim();

  if (normalizedMessage === 'Identifiants invalides.') {
    return 'Code PIN invalide.';
  }

  if (
    normalizedMessage === 'Le code PIN doit contenir exactement 4 chiffres.'
  ) {
    return 'Le code PIN doit contenir exactement 4 chiffres.';
  }

  if (
    normalizedMessage === 'Trop de tentatives. Reessayez dans quelques minutes.'
  ) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  }

  return 'Impossible de vérifier ce code.';
}

function resolveEmployeeConfirmation(
  user?: AttendanceEntrySessionUser,
): EmployeeConfirmation {
  const firstName = user?.firstName.trim() ?? '';
  const lastName = user?.lastName.trim() ?? '';
  const name =
    [firstName, lastName].filter(Boolean).join(' ') ||
    user?.employeeIdentifier.trim() ||
    'Employé';
  const detail =
    user?.jobTitle?.trim() ||
    user?.position?.trim() ||
    user?.role.trim() ||
    user?.department?.trim() ||
    user?.employeeIdentifier.trim() ||
    'Employé';

  return {
    name,
    detail,
  };
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
        user?: AttendanceEntrySessionUser;
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
        employee: resolveEmployeeConfirmation(data.user),
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
        message: 'Impossible de vérifier ce code.',
      });
    } finally {
      if (!redirectTo) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-[#fff8f2] px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:min-h-screen sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_34%),linear-gradient(180deg,rgba(255,246,239,0.96),rgba(255,252,249,0.98)_44%,rgba(255,255,255,1))]" />

      <Card className="relative w-full max-w-[460px] overflow-hidden rounded-[32px] border border-[#f0d7c6] bg-white/96 shadow-[0_30px_70px_rgba(16,50,60,0.13)] sm:rounded-[36px]">
        <CardContent className="space-y-5 px-5 py-6 sm:space-y-6 sm:px-7 sm:py-8">
          <header className="space-y-5 text-center">
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
            <div className="space-y-1 leading-none">
              <p className="text-[1.7rem] font-black tracking-normal text-primary sm:text-[1.95rem]">
                KONATECH
              </p>
              <p className="text-[1.7rem] font-black tracking-normal text-accent sm:text-[1.95rem]">
                POINTAGE
              </p>
            </div>
            <p className="text-sm font-semibold leading-5 text-[#53656d] sm:text-base">
              Entrez votre code PIN à 4 chiffres
            </p>
          </header>

          <section className="space-y-5">
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
                  aria-invalid={feedback?.tone === 'error'}
                  aria-label={`Chiffre ${index + 1}`}
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-[20px] border text-2xl font-black text-primary transition-all duration-200 min-[380px]:h-[3.85rem] min-[380px]:w-[3.85rem] sm:h-[4.15rem] sm:w-[4.15rem] sm:rounded-[24px]',
                    digit
                      ? 'scale-[1.02] border-accent/40 bg-white shadow-[0_14px_30px_rgba(249,115,22,0.15)]'
                      : 'border-slate-200 bg-slate-50/80 shadow-[0_10px_24px_rgba(16,50,60,0.05)]',
                    feedback?.tone === 'error' &&
                      'border-red-300 bg-red-50 text-red-800',
                  )}
                >
                  {digit ? '•' : ''}
                </div>
              ))}
            </div>

            <p className="sr-only" id="pin-help">
              Entrez votre code PIN à 4 chiffres.
            </p>

            <div
              aria-label="Clavier numérique"
              className="mx-auto grid max-w-[340px] grid-cols-3 gap-2.5 min-[380px]:gap-3"
              role="group"
            >
              {KEYPAD_DIGITS.map((digit) => (
                <button
                  key={digit}
                  className="flex h-16 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-xl font-black text-primary shadow-[0_10px_24px_rgba(16,50,60,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-[4.35rem] sm:rounded-[24px] sm:text-2xl"
                  disabled={isSubmitting || pinCode.length >= PIN_LENGTH}
                  type="button"
                  onClick={() => handleKeypadDigit(digit)}
                >
                  {digit}
                </button>
              ))}

              <button
                aria-label="Supprimer le dernier chiffre"
                className="flex h-16 items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 text-sm font-black text-slate-600 shadow-[0_8px_20px_rgba(16,50,60,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:h-[4.35rem] sm:rounded-[24px]"
                disabled={isSubmitting || pinCode.length === 0}
                type="button"
                onClick={handleKeypadDelete}
              >
                Suppr.
              </button>

              <button
                className="flex h-16 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-xl font-black text-primary shadow-[0_10px_24px_rgba(16,50,60,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-[4.35rem] sm:rounded-[24px] sm:text-2xl"
                disabled={isSubmitting || pinCode.length >= PIN_LENGTH}
                type="button"
                onClick={() => handleKeypadDigit('0')}
              >
                0
              </button>

              <button
                aria-label="Valider le code PIN"
                className="flex h-16 items-center justify-center rounded-[22px] bg-primary text-base font-black text-white shadow-[0_18px_34px_rgba(16,50,60,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/95 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none sm:h-[4.35rem] sm:rounded-[24px]"
                disabled={!canSubmit || isSubmitting}
                type="button"
                onClick={handleSubmit}
              >
                {isSubmitting ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white"
                    />
                    <span className="sr-only">Vérification...</span>
                  </>
                ) : (
                  'OK'
                )}
              </button>
            </div>
          </section>

          {feedback ? (
            <div
              aria-live="polite"
              className={cn(
                'rounded-[20px] border px-4 py-3 text-center shadow-[0_10px_24px_rgba(16,50,60,0.05)]',
                feedback.tone === 'success' &&
                  'border-success/20 bg-success/10 text-primary',
                feedback.tone === 'error' &&
                  'border-red-100 bg-red-50 text-sm font-bold text-red-700',
              )}
            >
              {feedback.tone === 'success' ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success text-white shadow-[0_10px_20px_rgba(34,197,94,0.2)]">
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="break-words text-base font-black leading-5 text-primary">
                      {feedback.employee.name}
                    </p>
                    <p className="break-words text-sm font-bold leading-5 text-[#53656d]">
                      {feedback.employee.detail}
                    </p>
                  </div>
                </div>
              ) : (
                feedback.message
              )}
            </div>
          ) : null}

          <p className="text-center text-xs font-semibold leading-5 text-[#7b878d]">
            Accès réservé aux employés autorisés
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
