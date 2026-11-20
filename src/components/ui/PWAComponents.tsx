import React, { useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <Download className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
        <span>{compact ? 'Instalar' : 'Instalar App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <Download className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>Instalar iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Instalar en iPhone / iPad
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                1. Pulsa el botón <strong>Compartir</strong> en la barra de Safari.
                <br />
                2. Desliza y selecciona <strong>Añadir a pantalla de inicio</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 md:bottom-4"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Modo sin conexión — Mostrando datos locales cacheados</span>
    </div>
  );
};
