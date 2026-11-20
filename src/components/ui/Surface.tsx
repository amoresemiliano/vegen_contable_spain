import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Info, X } from 'lucide-react';

export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}> = ({ children, className = '', padding = 'md' }) => {
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
      ? 'p-4'
      : padding === 'lg'
      ? 'p-6 sm:p-8'
      : 'p-5 sm:p-6';

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${padClass} ${className}`}
    >
      {children}
    </div>
  );
};

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl text-balance">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const MetricCard: React.FC<{
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';
  onClick?: () => void;
}> = ({ label, value, detail, tone = 'neutral', onClick }) => {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'danger'
      ? 'text-rose-700 dark:text-rose-400'
      : tone === 'accent'
      ? 'text-teal-700 dark:text-teal-400'
      : 'text-slate-900 dark:text-slate-50';

  const content = (
    <>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </div>
      {detail && (
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">{detail}</div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/70 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      {content}
    </div>
  );
};

export type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const StatusLabel: React.FC<{
  text: string;
  tone?: SemanticTone;
}> = ({ text, tone = 'neutral' }) => {
  const config = {
    success: {
      cls: 'text-emerald-700 dark:text-emerald-400',
      Icon: CheckCircle2,
    },
    warning: {
      cls: 'text-amber-700 dark:text-amber-400',
      Icon: Clock,
    },
    danger: {
      cls: 'text-rose-700 dark:text-rose-400',
      Icon: AlertTriangle,
    },
    info: {
      cls: 'text-sky-700 dark:text-sky-400',
      Icon: Info,
    },
    neutral: {
      cls: 'text-slate-600 dark:text-slate-400',
      Icon: FileWarning,
    },
  }[tone];

  const Icon = config.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${config.cls}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/40">
    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
    <p className="mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const LegalNoticeBanner: React.FC<{
  text: string;
  tone?: 'warning' | 'info';
}> = ({ text, tone = 'warning' }) => (
  <div
    role="note"
    className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
      tone === 'warning'
        ? 'border-amber-300/80 bg-amber-50/90 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-sky-200 bg-sky-50/80 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200'
    }`}
  >
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{text}</span>
  </div>
);

export const SlideDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ open, onClose, title, subtitle, children, wide = false }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px]">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 ${
          wide ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  );
};

export const ModalDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
