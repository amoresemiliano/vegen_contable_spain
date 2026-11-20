import {
  BankAccount,
  BankTransaction,
  Invoice,
  JournalEntry,
  ChartAccount,
} from '../types/domain';
import { round2 } from './formatters';
import { computeProfitAndLoss } from './accounting';

export interface TreasuryMetrics {
  accountingProfit: number; // From PyG (accrual)
  cashBalance: number; // Total bank balances
  restrictedCash: number; // Earmarked reserves / tax escrows
  availableLiquidity: number; // Cash balance - restricted cash
  expectedCashInflows: number; // Open customer receivables
  upcomingPayables: number; // Open supplier payables
  netCashFlowPeriod: number; // Net cash inflows - outflows in recent transactions
  forecast30dNet: number;
}

/**
 * Computes strictly separated financial & treasury metrics so Profit,
 * Cash Balance, Available Liquidity, Expected Cash, and Restricted Cash
 * are never conflated.
 */
export function computeTreasuryMetrics(
  clientId: string,
  accounts: BankAccount[],
  transactions: BankTransaction[],
  invoices: Invoice[],
  entries: JournalEntry[],
  chart: ChartAccount[]
): TreasuryMetrics {
  const clientAccounts = accounts.filter((a) => a.clientId === clientId);
  const cashBalance = round2(clientAccounts.reduce((s, a) => s + a.currentBalance, 0));
  const restrictedCash = round2(clientAccounts.reduce((s, a) => s + a.restrictedAmount, 0));
  const availableLiquidity = round2(cashBalance - restrictedCash);

  const clientInvoices = invoices.filter((i) => i.clientId === clientId && i.kind !== 'QUOTE');
  const expectedCashInflows = round2(
    clientInvoices
      .filter((i) => i.direction === 'ISSUED' && i.status !== 'PAID')
      .reduce((s, i) => s + Math.max(0, i.totalAmount - i.paidAmount), 0)
  );
  const upcomingPayables = round2(
    clientInvoices
      .filter((i) => i.direction === 'RECEIVED' && i.status !== 'PAID')
      .reduce((s, i) => s + Math.max(0, i.totalAmount - i.paidAmount), 0)
  );

  const clientTx = transactions.filter((t) => t.clientId === clientId);
  const netCashFlowPeriod = round2(clientTx.reduce((s, t) => s + t.amount, 0));

  const clientEntries = entries.filter((e) => e.clientId === clientId);
  const pnl = computeProfitAndLoss(clientEntries, chart);

  const forecast30dNet = round2(availableLiquidity + expectedCashInflows * 0.75 - upcomingPayables * 0.85);

  return {
    accountingProfit: pnl.operatingResult,
    cashBalance,
    restrictedCash,
    availableLiquidity,
    expectedCashInflows,
    upcomingPayables,
    netCashFlowPeriod,
    forecast30dNet,
  };
}

export interface ForecastHorizonPoint {
  horizonLabel: string;
  days: number;
  projectedInflows: number;
  projectedOutflows: number;
  projectedEndingLiquidity: number;
}

export function computeCashFlowForecast(
  metrics: TreasuryMetrics,
  monthlyBaselineIncome: number,
  monthlyBaselineExpense: number
): ForecastHorizonPoint[] {
  const horizons = [
    { label: '30 días', days: 30, months: 1 },
    { label: '60 días', days: 60, months: 2 },
    { label: '90 días', days: 90, months: 3 },
    { label: '12 meses', days: 365, months: 12 },
  ];

  return horizons.map((h) => {
    const projectedInflows = round2(metrics.expectedCashInflows + monthlyBaselineIncome * (h.months - 0.3));
    const projectedOutflows = round2(metrics.upcomingPayables + monthlyBaselineExpense * (h.months - 0.3));
    const projectedEndingLiquidity = round2(
      metrics.availableLiquidity + projectedInflows - projectedOutflows
    );
    return {
      horizonLabel: h.label,
      days: h.days,
      projectedInflows: Math.max(0, projectedInflows),
      projectedOutflows: Math.max(0, projectedOutflows),
      projectedEndingLiquidity,
    };
  });
}

export interface CsvParseRow {
  rowIndex: number;
  rawDate: string;
  normalizedDate: string;
  description: string;
  counterparty: string;
  reference: string;
  amount: number;
  fingerprint: string;
  isDuplicate: boolean;
  error?: string;
}

export function normalizeSpanishDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slashMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  }
  return null;
}

export function makeBankTxFingerprint(
  normalizedDate: string,
  amount: number,
  reference: string,
  description: string
): string {
  return `${normalizedDate}|${round2(amount || 0).toFixed(2)}|${reference.trim().toUpperCase()}|${description.trim().slice(0, 24).toUpperCase()}`;
}

export function parseBankCsvText(
  csvText: string,
  existingFingerprints: Set<string>,
  delimiter = ';'
): CsvParseRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Skip header row
  const dataLines = lines.slice(1);
  const seenInBatch = new Set<string>();
  const parsed: CsvParseRow[] = [];

  dataLines.forEach((line, idx) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    const rawDate = cols[0] ?? '';
    const description = cols[1] ?? '';
    const counterparty = cols[2] || description.slice(0, 28);
    const reference = cols[3] || `CSV-${idx + 1}`;
    const rawAmount = (cols[4] ?? '0').replace(/\./g, '').replace(',', '.');
    const amount = Number.parseFloat(rawAmount);
    const normalizedDate = normalizeSpanishDate(rawDate);

    let error: string | undefined;
    if (!normalizedDate) error = 'Fecha no válida (use DD/MM/AAAA o AAAA-MM-DD)';
    else if (!Number.isFinite(amount) || amount === 0) error = 'Importe numérico no válido';
    else if (!description) error = 'Concepto vacío';

    const fingerprint = makeBankTxFingerprint(
      normalizedDate ?? rawDate,
      amount,
      reference,
      description
    );
    const isDuplicate = existingFingerprints.has(fingerprint) || seenInBatch.has(fingerprint);
    seenInBatch.add(fingerprint);

    parsed.push({
      rowIndex: idx + 1,
      rawDate,
      normalizedDate: normalizedDate ?? rawDate,
      description,
      counterparty,
      reference,
      amount: Number.isFinite(amount) ? round2(amount) : 0,
      fingerprint,
      isDuplicate,
      error,
    });
  });

  return parsed;
}

export interface ReconciliationCandidate {
  transactionId: string;
  invoiceId: string;
  invoiceNumber: string;
  confidence: number;
  reason: string;
  ambiguous: boolean;
}

/**
 * Deterministic matching rules: amount match, date proximity, invoice reference, counterparty.
 * Never silently reconciles ambiguous transactions.
 */
export function findReconciliationCandidates(
  tx: BankTransaction,
  invoices: Invoice[],
  alreadyReconciledInvoiceIds: Set<string>
): ReconciliationCandidate[] {
  const candidates: ReconciliationCandidate[] = [];
  const txAbs = Math.abs(tx.amount);
  const expectedDirection = tx.amount >= 0 ? 'ISSUED' : 'RECEIVED';

  for (const inv of invoices) {
    if (inv.clientId !== tx.clientId) continue;
    if (inv.kind === 'QUOTE') continue;
    if (inv.direction !== expectedDirection) continue;
    if (alreadyReconciledInvoiceIds.has(inv.id)) continue;

    const pendingAmount = round2(inv.totalAmount - inv.paidAmount);
    if (pendingAmount <= 0) continue;

    const amountDiff = Math.abs(txAbs - pendingAmount);
    const totalDiff = Math.abs(txAbs - inv.totalAmount);
    const refInText =
      tx.reference.toUpperCase().includes(inv.invoiceNumber.toUpperCase()) ||
      tx.description.toUpperCase().includes(inv.invoiceNumber.toUpperCase());
    const nameMatch =
      tx.counterparty.toLowerCase().includes(inv.contactName.toLowerCase().slice(0, 8)) ||
      inv.contactName.toLowerCase().includes(tx.counterparty.toLowerCase().slice(0, 8));

    const txTime = new Date(tx.date).getTime();
    const invTime = new Date(inv.issueDate).getTime();
    const daysDiff = Math.abs(txTime - invTime) / (1000 * 60 * 60 * 24);

    if (amountDiff < 0.05 || totalDiff < 0.05) {
      let confidence = 0.65;
      const reasons: string[] = ['Importe exacto'];
      if (refInText) {
        confidence += 0.25;
        reasons.push('Referencia de factura coincidente');
      }
      if (nameMatch) {
        confidence += 0.07;
        reasons.push('Contraparte coincidente');
      }
      if (daysDiff <= 45) {
        confidence += 0.03;
        reasons.push('Fecha dentro de ventana');
      }
      candidates.push({
        transactionId: tx.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        confidence: Math.min(0.99, round2(confidence)),
        reason: reasons.join(' · '),
        ambiguous: false,
      });
    } else if (refInText && amountDiff > 0.05) {
      candidates.push({
        transactionId: tx.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        confidence: 0.58,
        reason: `Referencia coincidente con diferencia de importe (${round2(amountDiff)} EUR)`,
        ambiguous: true,
      });
    }
  }

  if (candidates.length > 1) {
    return candidates.map((c) => ({ ...c, ambiguous: true }));
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}
