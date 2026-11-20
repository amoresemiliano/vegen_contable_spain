/**
 * Spanish Locale Formatters (EUR currency, Spanish dates, percentages, and UI labels).
 */

const eurFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(amount: number): string {
  return eurFormatter.format(Number.isFinite(amount) ? amount : 0);
}

export function formatNumberEs(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')} %`;
}

export function formatDateEs(isoDate: string): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00` : isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatShortDateEs(isoDate: string): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00` : isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function formatDateTimeEs(isoDate: string): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  UPLOADED: 'Subido',
  PROCESSING: 'Procesando',
  EXTRACTED: 'Extraído (IA)',
  NEEDS_REVIEW: 'Requiere revisión',
  APPROVED: 'Aprobado',
  ACCOUNTED: 'Contabilizado',
  REJECTED: 'Rechazado',
  ARCHIVED: 'Archivado',
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SUPPLIER_INVOICE: 'Factura de proveedor',
  CUSTOMER_INVOICE: 'Factura emitida',
  CREDIT_NOTE: 'Factura rectificativa',
  EXPENSE_RECEIPT: 'Ticket / Gasto',
  BANK_STATEMENT: 'Extracto bancario',
  CONTRACT: 'Contrato',
  PAYROLL: 'Nómina',
  TAX_DOCUMENT: 'Documento fiscal',
  OTHER: 'Otro documento',
};

export const JOURNAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PROPOSED: 'Propuesto',
  UNDER_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  POSTED: 'Contabilizado',
  REVERSED: 'Anulado (Contraasiento)',
};

export const TAX_STATUS_LABELS: Record<string, string> = {
  PENDING_DATA: 'Faltan datos',
  READY_TO_PREPARE: 'Listo para preparar',
  DRAFT: 'Borrador',
  NEEDS_REVIEW: 'Pendiente revisión',
  APPROVED: 'Aprobado',
  READY_FOR_EXTERNAL_FILING: 'Listo presentación externa',
  FILED_EXTERNALLY: 'Presentado externamente',
  OVERDUE: 'Fuera de plazo',
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  SL: 'Sociedad Limitada (SL)',
  OTHER_COMPANY: 'Otra sociedad',
  AUTONOMO: 'Autónomo / Profesional',
  INDIVIDUAL: 'Particular',
  BUSINESS_OWNER_PERSONAL: 'Empresario + Personal',
};
