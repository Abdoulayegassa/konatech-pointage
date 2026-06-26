'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AttendanceSelfieCaptureProps = {
  disabled?: boolean;
  onCapture: (photoDataUrl: string) => void;
};

export function AttendanceSelfieCapture({
  disabled = false,
  onCapture,
}: AttendanceSelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("La caméra n'est pas disponible sur cet appareil.");
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: {
            ideal: 720,
          },
          height: {
            ideal: 720,
          },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
    } catch {
      setError('Autorisez la caméra pour valider le pointage.');
    } finally {
      setIsStarting(false);
    }
  }

  function captureSelfie() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("La caméra n'est pas encore prête.");
      return;
    }

    const size = Math.min(video.videoWidth, video.videoHeight);
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    const canvas = document.createElement('canvas');

    canvas.width = 720;
    canvas.height = 720;

    const context = canvas.getContext('2d');

    if (!context) {
      setError('Impossible de capturer la photo.');
      return;
    }

    context.drawImage(video, offsetX, offsetY, size, size, 0, 0, 720, 720);
    onCapture(canvas.toDataURL('image/jpeg', 0.78));
    stopCamera();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-between gap-4">
      <div className="relative flex w-full justify-center">
        <div className="absolute inset-x-8 top-4 h-24 rounded-full bg-success/10 blur-3xl" />
        <button
          aria-label="Ouvrir la caméra"
          className="relative aspect-square w-full max-w-[min(68dvh,320px)] rounded-full border border-slate-200/90 bg-white p-2 text-left shadow-[0_24px_60px_rgba(15,45,58,0.14)] disabled:pointer-events-none"
          disabled={disabled || isStarting || isCameraActive}
          onClick={startCamera}
          type="button"
        >
          <div className="relative h-full w-full overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(248,250,252,1),rgba(240,253,244,0.72))] ring-8 ring-slate-50">
            <video
              ref={videoRef}
              className={cn(
                'h-full w-full scale-x-[-1] object-cover',
                isCameraActive ? 'opacity-100' : 'opacity-0',
              )}
              muted
              playsInline
            />
            {!isCameraActive ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-4xl leading-none">📷</span>
                <span className="max-w-40 text-sm font-black leading-5 text-slate-700">
                  Touchez pour ouvrir la caméra
                </span>
              </div>
            ) : null}
          </div>
          <span className="pointer-events-none absolute left-3 top-3 h-14 w-14 rounded-tl-[28px] border-l-2 border-t-2 border-slate-300/90" />
          <span className="pointer-events-none absolute right-3 top-3 h-14 w-14 rounded-tr-[28px] border-r-2 border-t-2 border-slate-300/90" />
          <span className="pointer-events-none absolute bottom-3 left-3 h-14 w-14 rounded-bl-[28px] border-b-2 border-l-2 border-slate-300/90" />
          <span className="pointer-events-none absolute bottom-3 right-3 h-14 w-14 rounded-br-[28px] border-b-2 border-r-2 border-slate-300/90" />
          {isCameraActive ? (
            <span className="absolute right-8 top-8 h-3 w-3 rounded-full bg-success shadow-[0_0_0_6px_rgba(25,135,84,0.12)]" />
          ) : null}
        </button>
      </div>

      <p className="text-center text-[1.35rem] font-black leading-tight text-slate-950">
        Cadrez votre visage
      </p>

      <div className="w-full rounded-[24px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[0_14px_34px_rgba(15,45,58,0.07)]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/10 text-xl text-success">
            ◉
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">Conseil</p>
            <p className="text-sm font-semibold leading-5 text-slate-500">
              Regardez la caméra et restez dans un endroit bien éclairé.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="w-full rounded-[20px] border border-accent/15 bg-accent/10 px-4 py-3 text-sm font-bold text-accent">
          {error}
        </div>
      ) : null}

      <div className="sticky bottom-0 w-full bg-white/95 pb-[env(safe-area-inset-bottom)] pt-1">
        {!isCameraActive ? (
          <Button
            className="h-[60px] w-full rounded-[22px] bg-primary text-base font-black shadow-[0_18px_36px_rgba(16,50,60,0.18)]"
            disabled={disabled || isStarting}
            onClick={startCamera}
            type="button"
          >
            {isStarting ? 'Ouverture...' : 'Ouvrir la caméra'}
          </Button>
        ) : (
          <div className="grid grid-cols-[0.86fr_1.14fr] gap-3">
            <Button
              className="h-14 rounded-[22px] text-sm font-black"
              disabled={disabled || isStarting}
              onClick={stopCamera}
              type="button"
              variant="secondary"
            >
              Fermer
            </Button>
            <Button
              className="h-[60px] rounded-[22px] bg-success text-base font-black shadow-[0_18px_36px_rgba(25,135,84,0.22)] hover:bg-success/95"
              disabled={disabled}
              onClick={captureSelfie}
              type="button"
            >
              Capturer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
