'use client';

import {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const PIN_LENGTH = 4;
const SUCCESS_MESSAGE = 'Code valide. Redirection en cours...';
const SECURE_ACCESS_TITLE = 'Acces securise';
const OTP_ALLOWED_CONTROL_KEYS = new Set(['Tab', 'Delete', 'Home', 'End']);

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

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
    normalizedMessage ===
    'Trop de tentatives. Reessayez dans quelques minutes.'
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
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [pinDigits, setPinDigits] = useState<string[]>(
    Array.from({ length: PIN_LENGTH }, () => ''),
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pinCode = pinDigits.join('');

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

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

  function focusInput(index: number) {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  }

  function updateDigits(nextDigits: string[]) {
    setPinDigits(nextDigits.slice(0, PIN_LENGTH));
    setFeedback(null);
  }

  function handleDigitChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '');

    if (!digits) {
      const nextDigits = [...pinDigits];
      nextDigits[index] = '';
      updateDigits(nextDigits);
      return;
    }

    const nextDigits = [...pinDigits];

    digits
      .slice(0, PIN_LENGTH - index)
      .split('')
      .forEach((digit, offset) => {
        nextDigits[index + offset] = digit;
      });

    updateDigits(nextDigits);

    const nextIndex = Math.min(index + digits.length, PIN_LENGTH - 1);

    if (nextDigits.every(Boolean)) {
      focusInput(PIN_LENGTH - 1);
      return;
    }

    focusInput(nextIndex);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();

      if (pinDigits[index]) {
        const nextDigits = [...pinDigits];
        nextDigits[index] = '';
        updateDigits(nextDigits);
        return;
      }

      if (index > 0) {
        const previousIndex = index - 1;
        const nextDigits = [...pinDigits];
        nextDigits[previousIndex] = '';
        updateDigits(nextDigits);
        focusInput(previousIndex);
      }

      return;
    }

    if (
      event.key.length === 1 &&
      !/\d/.test(event.key) &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
      event.preventDefault();
      focusInput(index + 1);
      return;
    }

    if (OTP_ALLOWED_CONTROL_KEYS.has(event.key)) {
      return;
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();

    const digits = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, PIN_LENGTH - index);

    if (!digits) {
      return;
    }

    const nextDigits = [...pinDigits];

    digits.split('').forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });

    updateDigits(nextDigits);

    if (nextDigits.every(Boolean)) {
      focusInput(PIN_LENGTH - 1);
      return;
    }

    focusInput(Math.min(index + digits.length, PIN_LENGTH - 1));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,253,251,0.96),rgba(255,255,255,0.98)),radial-gradient(circle_at_top_left,rgba(244,110,40,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.12),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(244,110,40,0.16),transparent_60%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-44 w-44 rounded-full bg-[#f46e28]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-48 w-48 rounded-full bg-[#10323c]/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md items-center">
        <Card className="admin-reveal w-full overflow-hidden rounded-[34px] border border-[#f2d8c6] bg-white/96 shadow-[0_30px_80px_rgba(16,50,60,0.12)]">
          <CardHeader className="gap-6 border-b border-[#f3e3d7] px-5 pb-7 pt-6 sm:px-6 sm:pt-7">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f6ddc8] bg-[linear-gradient(135deg,rgba(255,241,231,0.88),rgba(255,255,255,0.96))] shadow-[0_16px_36px_rgba(16,50,60,0.06)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f46e28,#db5d16)] text-white shadow-[0_16px_32px_rgba(244,110,40,0.22)]">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 3l7 3v5c0 4.4-2.7 8.4-7 10-4.3-1.6-7-5.6-7-10V6l7-3z"
                    fill="currentColor"
                    fillOpacity="0.18"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M9.7 11.4V10a2.3 2.3 0 114.6 0v1.4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                  />
                  <rect
                    height="4.8"
                    rx="1.2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    width="5.8"
                    x="9.1"
                    y="11.4"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-3 text-center">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.34em] text-[#d6814f] sm:text-[0.72rem]">
                KONATECH POINTAGE
              </p>
              <CardTitle className="text-balance text-[2.15rem] font-semibold leading-[1.02] text-[#10323c] sm:text-[2.35rem]">
                {SECURE_ACCESS_TITLE}
              </CardTitle>
              <p className="mx-auto max-w-sm text-sm leading-5 text-[#53656d] sm:text-[0.95rem]">
                Entrez le PIN.
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 px-5 pb-5 pt-6 sm:px-6 sm:pb-6">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    className="text-sm font-semibold text-[#10323c]"
                    htmlFor="employee-pin-0"
                    id="pin-label"
                  >
                    Code PIN
                  </label>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#7d8b91]">
                    4 chiffres
                  </p>
                </div>

                <div
                  aria-describedby="pin-help"
                  aria-labelledby="pin-label"
                  className="flex items-center justify-center gap-3 sm:gap-4"
                  role="group"
                >
                  {pinDigits.map((digit, index) => (
                    <input
                      key={index}
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      autoCorrect="off"
                      className={cn(
                        'h-14 w-14 rounded-[20px] border text-center text-2xl font-semibold text-[#10323c] outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 sm:h-[4.5rem] sm:w-[4.5rem]',
                        digit
                          ? 'border-[#f7a467] bg-white shadow-[0_14px_26px_rgba(244,110,40,0.14)]'
                          : 'border-[#d9e1e5] bg-[#fbfcfd] shadow-[0_10px_24px_rgba(16,50,60,0.05)]',
                        feedback?.tone === 'error' &&
                          'border-rose-300 bg-rose-50/70',
                        'focus:border-[#f46e28] focus:bg-white focus:ring-4 focus:ring-[#f46e28]/12 focus:shadow-[0_18px_30px_rgba(244,110,40,0.16)]',
                      )}
                      disabled={isSubmitting}
                      id={`employee-pin-${index}`}
                      inputMode="numeric"
                      maxLength={1}
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      onChange={(event) => handleDigitChange(index, event)}
                      onFocus={(event) => event.currentTarget.select()}
                      onKeyDown={(event) => handleKeyDown(index, event)}
                      onPaste={(event) => handlePaste(index, event)}
                      pattern="\d*"
                      type="text"
                      value={digit}
                    />
                  ))}
                </div>

                <p
                  className="text-center text-sm leading-5 text-[#66767e]"
                  id="pin-help"
                >
                  4 chiffres.
                </p>
              </div>

              <Button
                className="h-14 w-full rounded-[22px] bg-[#f97316] text-base font-semibold text-white shadow-[0_18px_36px_rgba(249,115,22,0.28)] hover:bg-[#ea6a10] hover:shadow-[0_22px_42px_rgba(249,115,22,0.34)]"
                disabled={isSubmitting || pinCode.trim().length !== PIN_LENGTH}
                type="submit"
              >
                <span className="flex items-center justify-center gap-2">
                  {isSubmitting ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                      />
                      Verification...
                    </>
                  ) : (
                    'Continuer'
                  )}
                </span>
              </Button>
            </form>

            {feedback ? (
              <div
                aria-live="polite"
                className={cn(
                  'admin-reveal rounded-[22px] border px-4 py-3 text-sm font-medium shadow-[0_10px_24px_rgba(16,50,60,0.06)]',
                  feedback.tone === 'success' &&
                    'border-emerald-200 bg-emerald-50 text-emerald-700',
                  feedback.tone === 'error' &&
                    'border-rose-100 bg-rose-50/80 text-rose-700',
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            <div className="rounded-[24px] border border-[#edf1f3] bg-[#fbfcfd] px-4 py-3 text-center text-xs leading-5 text-[#6c7a81]">
              Session securisee.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
