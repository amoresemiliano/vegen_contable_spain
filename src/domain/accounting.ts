import {
  ChartAccount,
  Invoice,
  JournalEntry,
  JournalEntryStatus,
} from '../types/domain';
import { round2 } from './formatters';

export interface BalanceValidationResult {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  message?: string;
}

export function validateJournalEntryBalance(entry: Pick<JournalEntry, 'lines'>): BalanceValidationResult {
  const totalDebit = round2(entry.lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0));
  const totalCredit = round2(entry.lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0));
  const difference = round2(Math.abs(totalDebit - totalCredit));

  if (entry.lines.length < 2) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      difference,
      message: 'Un asiento debe contener al menos dos apuntes (Debe y Haber).',
    };
  }

  if (totalDebit <= 0 || totalCredit <= 0) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      difference,
      message: 'Los importes totales del Debe y del Haber deben ser mayores que cero.',
    };
  }

  if (difference > 0.01) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      difference,
      message: `Asiento descuadrado por ${difference.toFixed(2)} EUR (Debe ≠ Haber). No puede aprobarse.`,
    };
  }

  return {
    valid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  group: number;
  type: ChartAccount['type'];
  sumDebit: number;
  sumCredit: number;
  debitBalance: number;
  creditBalance: number;
}

export function computeTrialBalance(
  entries: JournalEntry[],
  chart: ChartAccount[],
  includeStatuses: JournalEntryStatus[] = [JournalEntryStatus.APPROVED, JournalEntryStatus.POSTED]
): TrialBalanceRow[] {
  const map = new Map<string, { name: string; debit: number; credit: number }>();

  for (const entry of entries) {
    if (!includeStatuses.includes(entry.status)) continue;
    for (const line of entry.lines) {
      const existing = map.get(line.accountCode) ?? {
        name: line.accountName,
        debit: 0,
        credit: 0,
      };
      existing.debit = round2(existing.debit + line.debit);
      existing.credit = round2(existing.credit + line.credit);
      map.set(line.accountCode, existing);
    }
  }

  const rows: TrialBalanceRow[] = [];
  for (const [code, totals] of map.entries()) {
    const pgc = chart.find((c) => c.code === code);
    const diff = round2(totals.debit - totals.credit);
    rows.push({
      accountCode: code,
      accountName: pgc?.name ?? totals.name,
      group: pgc?.group ?? Number(code.charAt(0) || 0),
      type: pgc?.type ?? inferAccountType(code),
      sumDebit: totals.debit,
      sumCredit: totals.credit,
      debitBalance: diff > 0 ? diff : 0,
      creditBalance: diff < 0 ? Math.abs(diff) : 0,
    });
  }

  return rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

function inferAccountType(code: string): ChartAccount['type'] {
  const first = code.charAt(0);
  if (first === '6') return 'EXPENSE';
  if (first === '7') return 'REVENUE';
  if (first === '1') return 'EQUITY';
  if (first === '4' && (code.startsWith('40') || code.startsWith('41') || code.startsWith('475') || code.startsWith('477'))) {
    return 'LIABILITY';
  }
  if (first === '5' && code.startsWith('52')) return 'LIABILITY';
  return 'ASSET';
}

export interface ProfitAndLossSummary {
  revenues: number;
  expenses: number;
  operatingResult: number;
  marginPercent: number;
  revenueBreakdown: { code: string; name: string; amount: number }[];
  expenseBreakdown: { code: string; name: string; amount: number }[];
}

export function computeProfitAndLoss(
  entries: JournalEntry[],
  chart: ChartAccount[]
): ProfitAndLossSummary {
  const tb = computeTrialBalance(entries, chart);
  const revenueBreakdown: { code: string; name: string; amount: number }[] = [];
  const expenseBreakdown: { code: string; name: string; amount: number }[] = [];

  let revenues = 0;
  let expenses = 0;

  for (const row of tb) {
    if (row.accountCode.startsWith('7')) {
      const net = round2(row.sumCredit - row.sumDebit);
      revenues = round2(revenues + net);
      revenueBreakdown.push({ code: row.accountCode, name: row.accountName, amount: net });
    } else if (row.accountCode.startsWith('6')) {
      const net = round2(row.sumDebit - row.sumCredit);
      expenses = round2(expenses + net);
      expenseBreakdown.push({ code: row.accountCode, name: row.accountName, amount: net });
    }
  }

  const operatingResult = round2(revenues - expenses);
  const marginPercent = revenues > 0 ? round2((operatingResult / revenues) * 100) : 0;

  return {
    revenues,
    expenses,
    operatingResult,
    marginPercent,
    revenueBreakdown,
    expenseBreakdown,
  };
}

export interface BalanceSheetSummary {
  nonCurrentAssets: number;
  currentAssets: number;
  totalAssets: number;
  equityAndReserves: number;
  currentYearResult: number;
  nonCurrentLiabilities: number;
  currentLiabilities: number;
  totalEquityAndLiabilities: number;
}

export function computeBalanceSheet(
  entries: JournalEntry[],
  chart: ChartAccount[]
): BalanceSheetSummary {
  const tb = computeTrialBalance(entries, chart);
  const pnl = computeProfitAndLoss(entries, chart);

  let nonCurrentAssets = 0;
  let currentAssets = 0;
  let equityAndReserves = 0;
  let nonCurrentLiabilities = 0;
  let currentLiabilities = 0;

  for (const row of tb) {
    const netDebit = round2(row.sumDebit - row.sumCredit);
    const netCredit = round2(row.sumCredit - row.sumDebit);
    const first = row.accountCode.charAt(0);

    if (first === '2') {
      nonCurrentAssets = round2(nonCurrentAssets + netDebit);
    } else if (first === '3') {
      currentAssets = round2(currentAssets + netDebit);
    } else if (first === '4' || first === '5') {
      // Simplified PGC mapping: 430, 440, 472, 572 are assets if debit balance; 400, 410, 475, 477, 520 are liabilities if credit balance
      if (
        row.accountCode.startsWith('43') ||
        row.accountCode.startsWith('44') ||
        row.accountCode.startsWith('472') ||
        row.accountCode.startsWith('57')
      ) {
        currentAssets = round2(currentAssets + netDebit);
      } else {
        currentLiabilities = round2(currentLiabilities + netCredit);
      }
    } else if (first === '1') {
      if (row.accountCode.startsWith('17')) {
        nonCurrentLiabilities = round2(nonCurrentLiabilities + netCredit);
      } else {
        equityAndReserves = round2(equityAndReserves + netCredit);
      }
    }
  }

  const totalAssets = round2(nonCurrentAssets + currentAssets);
  const totalEquityAndLiabilities = round2(
    equityAndReserves + pnl.operatingResult + nonCurrentLiabilities + currentLiabilities
  );

  return {
    nonCurrentAssets,
    currentAssets,
    totalAssets,
    equityAndReserves,
    currentYearResult: pnl.operatingResult,
    nonCurrentLiabilities,
    currentLiabilities,
    totalEquityAndLiabilities,
  };
}

export interface VatBookRecord {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  bookType: 'EMITIDAS' | 'RECIBIDAS';
  taxableBase: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  accounted: boolean;
}

export function computeVatBook(invoices: Invoice[]): VatBookRecord[] {
  return invoices
    .filter((inv) => inv.kind !== 'QUOTE' && inv.status !== 'DRAFT')
    .map((inv) => {
      const mainVatRate = inv.lines[0]?.vatRate ?? 21;
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        counterpartyName: inv.contactName,
        counterpartyTaxId: inv.contactTaxId,
        bookType: (inv.direction === 'ISSUED' ? 'EMITIDAS' : 'RECIBIDAS') as 'EMITIDAS' | 'RECIBIDAS',
        taxableBase: inv.taxableBase,
        vatRate: mainVatRate,
        vatAmount: inv.vatAmount,
        totalAmount: inv.totalAmount,
        accounted: Boolean(inv.linkedJournalEntryId),
      };
    })
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

export function validateInvoiceTotals(invoice: Invoice): {
  valid: boolean;
  computedBase: number;
  computedVat: number;
  computedWithholding: number;
  computedTotal: number;
} {
  const computedBase = round2(invoice.lines.reduce((s, l) => s + l.lineSubtotal, 0));
  const computedVat = round2(invoice.lines.reduce((s, l) => s + l.lineVat, 0));
  const computedWithholding = round2(invoice.lines.reduce((s, l) => s + l.lineWithholding, 0));
  const computedTotal = round2(computedBase + computedVat - computedWithholding);

  const valid =
    Math.abs(computedBase - invoice.taxableBase) < 0.02 &&
    Math.abs(computedVat - invoice.vatAmount) < 0.02 &&
    Math.abs(computedWithholding - invoice.withholdingAmount) < 0.02 &&
    Math.abs(computedTotal - invoice.totalAmount) < 0.02;

  return { valid, computedBase, computedVat, computedWithholding, computedTotal };
}
