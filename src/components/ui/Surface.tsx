import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileWarning,
  Info,
  TrendingUp,
  X,
} from 'lucide-react';

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
  priority?: 'primary' | 'secondary';
  statusHint?: string;
  onClick?: () => void;
}> = ({
  label,
  value,
  detail,
  tone = 'neutral',
  priority = 'primary',
  statusHint,
  onClick,
}) => {
  const toneValueClass =
    tone === 'positive'
      ? 'text-[#228B22] dark:text-[#4ADE80]'
      : tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'danger'
      ? 'text-rose-700 dark:text-rose-400'
      : tone === 'accent'
      ? 'text-[#1E293B] dark:text-[#28C76F]'
      : 'text-slate-900 dark:text-slate-50';

  const surfaceToneClass =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20'
      : tone === 'warning' && priority === 'primary'
      ? 'border-amber-200/90 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/15'
      : priority === 'secondary'
      ? 'border-slate-200/80 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-900/60'
      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';

  const valueSizeClass =
    priority === 'primary' ? 'text-2xl sm:text-[26px] font-bold' : 'text-lg sm:text-xl font-semibold';

  const StateIcon =
    tone === 'positive'
      ? TrendingUp
      : tone === 'warning'
      ? Clock
      : tone === 'danger'
      ? AlertTriangle
      : null;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        {StateIcon && (
          <StateIcon className={`h-3.5 w-3.5 shrink-0 ${toneValueClass}`} aria-hidden="true" />
        )}
      </div>
      <div
        className={`mt-2 font-mono tracking-tight tabular-nums ${valueSizeClass} ${toneValueClass}`}
      >
        {value}
      </div>
      {(detail || statusHint) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="truncate">{detail}</span>
          {statusHint && (
            <span className="inline-flex items-center gap-0.5 font-medium text-[#228B22] dark:text-[#28C76F] whitespace-nowrap shrink-0">
              {statusHint}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-xl border p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/90 focus-visible:outline-2 focus-visible:outline-[#228B22] dark:hover:border-slate-700 dark:hover:bg-slate-800/60 ${surfaceToneClass}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-xl border p-4 ${surfaceToneClass}`}>{content}</div>;
};

export interface AnalyticsSummaryStripProps {
  situation: { label: string; value: string; tone?: 'neutral' | 'positive' | 'accent' };
  change: { label: string; value: string; tone?: 'neutral' | 'positive' | 'warning' };
  attention: { label: string; value: string; tone?: 'positive' | 'warning' | 'danger' };
  nextAction: { label: string; actionText: string; onClick: () => void };
}

export const AnalyticsSummaryStrip: React.FC<AnalyticsSummaryStripProps> = ({
  situation,
  change,
  attention,
  nextAction,
}) => {
  const attentionToneCls =
    attention.tone === 'danger'
      ? 'text-rose-700 dark:text-rose-400'
      : attention.tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-[#228B22] dark:text-[#4ADE80]';

  return (
    <div
      aria-label="Resumen analítico rápido"
      className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
    >
      <div className="p-3.5 sm:p-4">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Situación actual
        </div>
        <div className="mt-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          {situation.value}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{situation.label}</div>
      </div>

      <div className="p-3.5 sm:p-4">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Cambios relevantes
        </div>
        <div className="mt-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          {change.value}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{change.label}</div>
      </div>

      <div className="p-3.5 sm:p-4">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Requiere atención
        </div>
        <div className={`mt-1 flex items-center gap-1.5 font-display text-sm font-semibold ${attentionToneCls}`}>
          {attention.tone === 'danger' || attention.tone === 'warning' ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{attention.value}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{attention.label}</div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-slate-50/70 p-3.5 dark:bg-slate-950/40 sm:p-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Próxima acción
          </div>
          <div className="mt-0.5 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
            {nextAction.label}
          </div>
        </div>
        <button
          type="button"
          onClick={nextAction.onClick}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#228B22] dark:bg-[#228B22] dark:hover:bg-[#28C76F] whitespace-nowrap shrink-0"
        >
          <span>{nextAction.actionText}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
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
      cls: 'text-[#228B22] dark:text-[#4ADE80]',
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
