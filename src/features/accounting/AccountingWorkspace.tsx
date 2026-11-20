import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Lock,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import {
  computeBalanceSheet,
  computeProfitAndLoss,
  computeTrialBalance,
  computeVatBook,
  validateJournalEntryBalance,
} from '../../domain/accounting';
import {
  ENTITY_TYPE_LABELS,
  formatDateEs,
  formatEUR,
  JOURNAL_STATUS_LABELS,
  round2,
} from '../../domain/formatters';
import {
  EmptyState,
  MetricCard,
  ModalDialog,
  PageHeader,
  Panel,
  SlideDrawer,
  StatusLabel,
} from '../../components/ui/Surface';
import { DocumentStatus, JournalEntry, JournalEntryLine, JournalEntryStatus } from '../../types/domain';

interface AccountingWorkspaceProps {
  activeSection:
    | 'panel'
    | 'clientes'
    | 'asientos'
    | 'plan'
    | 'libros'
    | 'informes';
  clientIdFilter?: string;
  onNavigate?: (section: string) => void;
}

export const AccountingWorkspace: React.FC<AccountingWorkspaceProps> = ({
  activeSection,
  clientIdFilter,
  onNavigate,
}) => {
  const {
    state,
    accessibleClients,
    can,
    setSelectedClientId,
    createDraftJournalEntry,
    approveAndPostJournalEntry,
    reversePostedJournalEntry,
    closeAccountingPeriod,
  } = useAppStore();

  const targetClientId = clientIdFilter || state.selectedClientId || accessibleClients[0]?.id;
  const targetClient = state.clientProfiles.find((c) => c.id === targetClientId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [bookTab, setBookTab] = useState<'DIARIO' | 'MAYOR' | 'IVA' | 'SUMAS' | 'PYG' | 'BALANCE' | 'CIERRE'>('DIARIO');
  const [ledgerAccount, setLedgerAccount] = useState('5720');
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [entryFeedback, setEntryFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Draft entry form state
  const [draftConcept, setDraftConcept] = useState('Gasto bancario / Ajuste contable demo');
  const [draftDate, setDraftDate] = useState('2026-11-20');
  const [draftDebitAcc, setDraftDebitAcc] = useState('6290');
  const [draftCreditAcc, setDraftCreditAcc] = useState('5720');
  const [draftDebitAmt, setDraftDebitAmt] = useState('120');
  const [draftCreditAmt, setDraftCreditAmt] = useState('120');

  const clientEntries = useMemo(
    () =>
      state.journalEntries
        .filter((e) => e.clientId === targetClientId)
        .sort((a, b) => b.entryNumber - a.entryNumber),
    [state.journalEntries, targetClientId]
  );

  const filteredEntries = useMemo(() => {
    return clientEntries
      .filter((e) => (statusFilter === 'ALL' ? true : e.status === statusFilter))
      .filter((e) =>
        accountFilter === 'ALL' ? true : e.lines.some((l) => l.accountCode === accountFilter)
      )
      .filter((e) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          e.concept.toLowerCase().includes(q) ||
          String(e.entryNumber).includes(q) ||
          e.lines.some((l) => l.accountCode.includes(q) || l.accountName.toLowerCase().includes(q))
        );
      });
  }, [clientEntries, statusFilter, accountFilter, search]);

  const trialBalance = useMemo(
    () => computeTrialBalance(clientEntries, state.chartOfAccounts),
    [clientEntries, state.chartOfAccounts]
  );

  const pnl = useMemo(
    () => computeProfitAndLoss(clientEntries, state.chartOfAccounts),
    [clientEntries, state.chartOfAccounts]
  );

  const balanceSheet = useMemo(
    () => computeBalanceSheet(clientEntries, state.chartOfAccounts),
    [clientEntries, state.chartOfAccounts]
  );

  const clientInvoices = useMemo(
    () => state.invoices.filter((i) => i.clientId === targetClientId),
    [state.invoices, targetClientId]
  );

  const vatBook = useMemo(() => computeVatBook(clientInvoices), [clientInvoices]);
  const clientPeriods = useMemo(
    () => state.accountingPeriods.filter((p) => p.clientId === targetClientId),
    [state.accountingPeriods, targetClientId]
  );

  const exportCsvPreview = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateDraftEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setEntryFeedback(null);
    const dAmt = round2(Number.parseFloat(draftDebitAmt.replace(',', '.')) || 0);
    const cAmt = round2(Number.parseFloat(draftCreditAmt.replace(',', '.')) || 0);
    const dAcc = state.chartOfAccounts.find((a) => a.code === draftDebitAcc);
    const cAcc = state.chartOfAccounts.find((a) => a.code === draftCreditAcc);

    const lines: JournalEntryLine[] = [
      {
        id: `dl-1-${Date.now()}`,
        accountCode: draftDebitAcc,
        accountName: dAcc?.name ?? 'Cuenta Debe',
        description: draftConcept,
        debit: dAmt,
        credit: 0,
      },
      {
        id: `dl-2-${Date.now()}`,
        accountCode: draftCreditAcc,
        accountName: cAcc?.name ?? 'Cuenta Haber',
        description: draftConcept,
        debit: 0,
        credit: cAmt,
      },
    ];

    const res = createDraftJournalEntry({
      clientId: targetClientId,
      date: draftDate,
      concept: draftConcept,
      lines,
    });
    if (!res.ok) {
      setEntryFeedback({ type: 'err', text: res.error || 'Asiento descuadrado.' });
      return;
    }
    setNewEntryOpen(false);
    if (res.entry) setSelectedEntry(res.entry);
  };

  if (activeSection === 'panel') {
    const pendingDocs = state.documents.filter(
      (d) =>
        accessibleClients.some((c) => c.id === d.clientId) &&
        (d.status === DocumentStatus.NEEDS_REVIEW || d.status === DocumentStatus.EXTRACTED)
    );
    const pendingMatches = state.bankTransactions.filter(
      (t) =>
        accessibleClients.some((c) => c.id === t.clientId) &&
        (t.reconciliationStatus === 'PROPOSED_MATCH' || t.reconciliationStatus === 'EXCEPTION')
    );
    const draftEntries = state.journalEntries.filter(
      (e) =>
        accessibleClients.some((c) => c.id === e.clientId) &&
        (e.status === JournalEntryStatus.DRAFT || e.status === JournalEntryStatus.UNDER_REVIEW)
    );
    const pendingTaxes = state.taxDeclarations.filter(
      (d) =>
        accessibleClients.some((c) => c.id === d.clientId) &&
        d.status !== 'FILED_EXTERNALLY'
    );

    return (
      <div className="space-y-6">
        <PageHeader
          title="Panel de Gestoría y Cumplimiento"
          subtitle="Control operativo en tiempo real de clientes asignados, bandeja documental, conciliación y calendario fiscal."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Documentos por revisar"
            value={String(pendingDocs.length)}
            detail="Extracciones IA o posibles duplicados"
            tone={pendingDocs.length > 0 ? 'warning' : 'positive'}
            onClick={() => onNavigate?.('documentos')}
          />
          <MetricCard
            label="Conciliaciones pendientes"
            value={String(pendingMatches.length)}
            detail="Propuestas y excepciones bancarias"
            tone={pendingMatches.length > 0 ? 'warning' : 'positive'}
            onClick={() => onNavigate?.('conciliacion')}
          />
          <MetricCard
            label="Asientos en borrador"
            value={String(draftEntries.length)}
            detail="Pendientes de validación Debe = Haber"
            onClick={() => onNavigate?.('asientos')}
          />
          <MetricCard
            label="Declaraciones en curso"
            value={String(pendingTaxes.length)}
            detail="Borradores 303 y obligaciones 4T 2026"
            tone="accent"
            onClick={() => onNavigate?.('declaraciones')}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Cola prioritaria de revisión documental</h2>
              <button
                type="button"
                onClick={() => onNavigate?.('documentos')}
                className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                Abrir bandeja
              </button>
            </div>
            {pendingDocs.length === 0 ? (
              <p className="text-xs text-slate-500">Todos los documentos asignados están revisados.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {pendingDocs.slice(0, 5).map((doc) => {
                  const cli = state.clientProfiles.find((c) => c.id === doc.clientId);
                  return (
                    <div key={doc.id} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{doc.fileName}</div>
                        <div className="text-[11px] text-slate-500">
                          {cli?.displayName} · {doc.extraction?.counterpartyName}
                        </div>
                      </div>
                      <div className="font-mono font-semibold tabular-nums">
                        {doc.extraction ? formatEUR(doc.extraction.totalAmount) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Resumen contable · {targetClient?.displayName}</h2>
              <button
                type="button"
                onClick={() => onNavigate?.('libros')}
                className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                Ver libros
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-slate-500">Ingresos contabilizados (G7)</div>
                <div className="mt-1 font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatEUR(pnl.revenues)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-slate-500">Gastos contabilizados (G6)</div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {formatEUR(pnl.expenses)}
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Resultado contable (Devengo)</span>
                  <span className="font-mono text-base font-bold text-teal-700 dark:text-teal-400">
                    {formatEUR(pnl.operatingResult)} ({pnl.marginPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  if (activeSection === 'clientes') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Cartera de Clientes"
          subtitle="Empresas y autónomos accesibles según tus asignaciones profesionales vigentes."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accessibleClients.map((cli) => {
            const isSelected = cli.id === targetClientId;
            const docsPending = state.documents.filter(
              (d) => d.clientId === cli.id && d.status === DocumentStatus.NEEDS_REVIEW
            ).length;
            return (
              <Panel
                key={cli.id}
                className={isSelected ? 'border-teal-600 dark:border-teal-500' : ''}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-slate-500">{cli.taxId}</div>
                    <h3 className="mt-1 font-display text-base font-semibold">{cli.displayName}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {ENTITY_TYPE_LABELS[cli.entityType]} · CNAE {cli.cnaeCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientId(cli.id);
                      onNavigate?.('asientos');
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      isSelected
                        ? 'bg-teal-600 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {isSelected ? 'Cliente activo' : 'Seleccionar'}
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <span>IVA: {cli.vatRegime}</span>
                  <span>·</span>
                  <span>Régimen: {cli.directTaxRegime}</span>
                  <span>·</span>
                  <span>Docs pendientes: <strong className="font-mono">{docsPending}</strong></span>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeSection === 'plan') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Plan Contable PGC · ${targetClient?.displayName ?? ''}`}
          subtitle="Estructura de cuentas y saldos vivos calculados a partir de los asientos aprobados."
        />
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Nombre de la cuenta</th>
                  <th className="px-4 py-3 font-medium">Grupo</th>
                  <th className="px-4 py-3 font-medium text-right">Debe</th>
                  <th className="px-4 py-3 font-medium text-right">Haber</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {state.chartOfAccounts.map((acc) => {
                  const tbRow = trialBalance.find((t) => t.accountCode === acc.code);
                  const net = tbRow ? round2(tbRow.sumDebit - tbRow.sumCredit) : 0;
                  return (
                    <tr key={acc.code} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono font-semibold">{acc.code}</td>
                      <td className="px-4 py-2.5">{acc.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">Grupo {acc.group}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatEUR(tbRow?.sumDebit ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatEUR(tbRow?.sumCredit ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                        {formatEUR(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  if (activeSection === 'libros' || activeSection === 'informes') {
    const ledgerMovements = clientEntries
      .filter((e) => e.status === JournalEntryStatus.POSTED || e.status === JournalEntryStatus.APPROVED)
      .flatMap((e) =>
        e.lines
          .filter((l) => l.accountCode === ledgerAccount)
          .map((l) => ({
            entryNumber: e.entryNumber,
            date: e.date,
            concept: e.concept,
            debit: l.debit,
            credit: l.credit,
          }))
      );

    return (
      <div className="space-y-6">
        <PageHeader
          title={`Libros Contables e Informes · ${targetClient?.displayName ?? ''}`}
          subtitle="Diario, Mayor, Libros de IVA, Sumas y Saldos, PyG, Balance de Situación y Cierre de periodo."
          actions={
            <button
              type="button"
              onClick={() =>
                exportCsvPreview(
                  `sumas_saldos_${targetClientId}.csv`,
                  ['Cuenta', 'Nombre', 'Debe', 'Haber', 'SaldoDeudor', 'SaldoAcreedor'],
                  trialBalance.map((r) => [
                    r.accountCode,
                    r.accountName,
                    r.sumDebit,
                    r.sumCredit,
                    r.debitBalance,
                    r.creditBalance,
                  ])
                )
              }
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Download className="h-4 w-4" />
              <span>Exportar Sumas y Saldos CSV</span>
            </button>
          }
        />

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { k: 'DIARIO', l: 'Libro Diario' },
            { k: 'MAYOR', l: 'Libro Mayor' },
            { k: 'IVA', l: 'Libros de IVA' },
            { k: 'SUMAS', l: 'Sumas y Saldos' },
            { k: 'PYG', l: 'Pérdidas y Ganancias' },
            { k: 'BALANCE', l: 'Balance Situación' },
            { k: 'CIERRE', l: 'Periodos y Cierre' },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setBookTab(t.k as typeof bookTab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                bookTab === t.k
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        {bookTab === 'DIARIO' && (
          <Panel padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-4 py-3 font-medium">Asiento</th>
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                    <th className="px-4 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 font-medium text-right">Debe</th>
                    <th className="px-4 py-3 font-medium text-right">Haber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {clientEntries
                    .filter((e) => e.status === JournalEntryStatus.POSTED || e.status === JournalEntryStatus.APPROVED)
                    .flatMap((entry) =>
                      entry.lines.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-mono text-slate-500">
                            {idx === 0 ? `#${entry.entryNumber} · ${formatDateEs(entry.date)}` : ''}
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                            {line.accountCode} · {line.accountName}
                          </td>
                          <td className="px-4 py-2.5">{line.description}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {line.debit > 0 ? formatEUR(line.debit) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {line.credit > 0 ? formatEUR(line.credit) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {bookTab === 'MAYOR' && (
          <Panel className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Cuenta a consultar:
              </label>
              <select
                value={ledgerAccount}
                onChange={(e) => setLedgerAccount(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                {state.chartOfAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
            {ledgerMovements.length === 0 ? (
              <EmptyState
                title="Sin movimientos en esta cuenta"
                description="Selecciona otra subcuenta del Plan General Contable para explorar su Mayor."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                      <th className="py-2 font-medium">Asiento</th>
                      <th className="py-2 font-medium">Fecha</th>
                      <th className="py-2 font-medium">Concepto</th>
                      <th className="py-2 font-medium text-right">Debe</th>
                      <th className="py-2 font-medium text-right">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {ledgerMovements.map((m, i) => (
                      <tr key={i}>
                        <td className="py-2 font-mono">#{m.entryNumber}</td>
                        <td className="py-2">{formatDateEs(m.date)}</td>
                        <td className="py-2">{m.concept}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{formatEUR(m.debit)}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{formatEUR(m.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {bookTab === 'IVA' && (
          <Panel padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-4 py-3 font-medium">Libro</th>
                    <th className="px-4 py-3 font-medium">Factura</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tercero (NIF)</th>
                    <th className="px-4 py-3 font-medium text-right">Base</th>
                    <th className="px-4 py-3 font-medium text-right">Tipo</th>
                    <th className="px-4 py-3 font-medium text-right">Cuota IVA</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {vatBook.map((row) => (
                    <tr key={row.invoiceId}>
                      <td className="px-4 py-2.5 font-medium">
                        {row.bookType === 'EMITIDAS' ? 'IVA Repercutido' : 'IVA Soportado'}
                      </td>
                      <td className="px-4 py-2.5 font-mono">{row.invoiceNumber}</td>
                      <td className="px-4 py-2.5">{formatDateEs(row.issueDate)}</td>
                      <td className="px-4 py-2.5">
                        {row.counterpartyName} <span className="font-mono text-slate-500">({row.counterpartyTaxId})</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatEUR(row.taxableBase)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{row.vatRate}%</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatEUR(row.vatAmount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">{formatEUR(row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {bookTab === 'SUMAS' && (
          <Panel padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                    <th className="px-4 py-3 font-medium">Denominación</th>
                    <th className="px-4 py-3 font-medium text-right">Sumas Debe</th>
                    <th className="px-4 py-3 font-medium text-right">Sumas Haber</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo Deudor</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo Acreedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {trialBalance.map((r) => (
                    <tr key={r.accountCode}>
                      <td className="px-4 py-2.5 font-mono font-semibold">{r.accountCode}</td>
                      <td className="px-4 py-2.5">{r.accountName}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatEUR(r.sumDebit)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatEUR(r.sumCredit)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatEUR(r.debitBalance)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatEUR(r.creditBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {bookTab === 'PYG' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel>
              <h3 className="font-display text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Ingresos de Explotación (Grupo 7)
              </h3>
              <div className="mt-3 divide-y divide-slate-200 text-xs dark:divide-slate-800">
                {pnl.revenueBreakdown.map((item) => (
                  <div key={item.code} className="flex justify-between py-2.5">
                    <span>{item.code} · {item.name}</span>
                    <span className="font-mono font-semibold tabular-nums">{formatEUR(item.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-3 font-semibold">
                  <span>Total Ingresos</span>
                  <span className="font-mono tabular-nums">{formatEUR(pnl.revenues)}</span>
                </div>
              </div>
            </Panel>
            <Panel>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Gastos de Explotación (Grupo 6)
              </h3>
              <div className="mt-3 divide-y divide-slate-200 text-xs dark:divide-slate-800">
                {pnl.expenseBreakdown.map((item) => (
                  <div key={item.code} className="flex justify-between py-2.5">
                    <span>{item.code} · {item.name}</span>
                    <span className="font-mono font-semibold tabular-nums">{formatEUR(item.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-3 font-semibold">
                  <span>Total Gastos</span>
                  <span className="font-mono tabular-nums">{formatEUR(pnl.expenses)}</span>
                </div>
                <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm font-bold text-teal-700 dark:border-slate-800 dark:text-teal-400">
                  <span>Resultado Contable del Ejercicio</span>
                  <span className="font-mono tabular-nums">{formatEUR(pnl.operatingResult)}</span>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {bookTab === 'BALANCE' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel>
              <h3 className="font-display text-sm font-semibold">ACTIVO</h3>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span>Activo No Corriente (Inmovilizado G2)</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.nonCurrentAssets)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Activo Corriente (Clientes, IVA sop., Tesorería)</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.currentAssets)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-bold dark:border-slate-800">
                  <span>TOTAL ACTIVO</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.totalAssets)}</span>
                </div>
              </div>
            </Panel>
            <Panel>
              <h3 className="font-display text-sm font-semibold">PATRIMONIO NETO Y PASIVO</h3>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span>Capital y Reservas (G1)</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.equityAndReserves)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Resultado del Ejercicio</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.currentYearResult)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pasivo No Corriente</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.nonCurrentLiabilities)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pasivo Corriente (Proveedores, Acreedores, HP)</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.currentLiabilities)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-bold dark:border-slate-800">
                  <span>TOTAL PATRIMONIO NETO Y PASIVO</span>
                  <span className="font-mono tabular-nums">{formatEUR(balanceSheet.totalEquityAndLiabilities)}</span>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {bookTab === 'CIERRE' && (
          <Panel>
            <h3 className="font-display text-base font-semibold">Periodos Contables y Cierre</h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Un periodo cerrado bloquea la contabilización de nuevos asientos en ese trimestre para preservar la integridad contable.
            </p>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {clientPeriods.map((per) => (
                <div key={per.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-display text-sm font-semibold">{per.label}</div>
                    <div className="text-xs text-slate-500">
                      {formatDateEs(per.startDate)} — {formatDateEs(per.endDate)}
                      {per.closedAt ? ` · Cerrado el ${formatDateEs(per.closedAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusLabel
                      text={per.status === 'CLOSED' ? 'Periodo cerrado' : 'Abierto'}
                      tone={per.status === 'CLOSED' ? 'neutral' : 'success'}
                    />
                    {per.status !== 'CLOSED' && can('accounting.periods.close') && (
                      <button
                        type="button"
                        onClick={() => closeAccountingPeriod(per.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                      >
                        <Lock className="h-3.5 w-3.5" /> Cerrar periodo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    );
  }

  // Default: ASIENTOS CONTABLES
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Asientos Contables · ${targetClient?.displayName ?? ''}`}
        subtitle="Diario de asientos de partida doble con validación estricta Debe = Haber y trazabilidad documental."
        actions={
          can('accounting.entries.create') ? (
            <button
              type="button"
              onClick={() => {
                setEntryFeedback(null);
                setNewEntryOpen(true);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo asiento</span>
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {[
              { k: 'ALL', l: 'Todos' },
              { k: JournalEntryStatus.POSTED, l: 'Contabilizados' },
              { k: JournalEntryStatus.DRAFT, l: 'Borradores' },
              { k: JournalEntryStatus.REVERSED, l: 'Anulados' },
            ].map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setStatusFilter(t.k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  statusFilter === t.k
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            aria-label="Filtrar por cuenta contable"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="ALL">Todas las cuentas PGC</option>
            {state.chartOfAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar concepto, nº asiento o cuenta..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <EmptyState
          title="Sin asientos en este filtro"
          description="Ajusta los filtros o aprueba un documento en la bandeja para generar un asiento automático."
        />
      ) : (
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Nº / Fecha</th>
                  <th className="px-4 py-3 font-medium">Concepto</th>
                  <th className="px-4 py-3 font-medium text-right">Debe</th>
                  <th className="px-4 py-3 font-medium text-right">Haber</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredEntries.map((je) => {
                  const bal = validateJournalEntryBalance(je);
                  return (
                    <tr key={je.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold">#{je.entryNumber}</div>
                        <div className="text-[11px] text-slate-500">{formatDateEs(je.date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{je.concept}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {je.lines.map((l) => l.accountCode).join(' · ')}
                          {je.sourceDocumentId ? ' · Documento vinculado' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatEUR(bal.totalDebit)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatEUR(bal.totalCredit)}</td>
                      <td className="px-4 py-3">
                        <StatusLabel
                          text={JOURNAL_STATUS_LABELS[je.status] ?? je.status}
                          tone={
                            je.status === JournalEntryStatus.POSTED || je.status === JournalEntryStatus.APPROVED
                              ? 'success'
                              : je.status === JournalEntryStatus.REVERSED
                              ? 'danger'
                              : 'warning'
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEntryFeedback(null);
                            setSelectedEntry(je);
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          Ver apuntes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Entry Side Drawer */}
      <SlideDrawer
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={`Asiento #${selectedEntry?.entryNumber ?? ''}`}
        subtitle={selectedEntry ? `${formatDateEs(selectedEntry.date)} · ${selectedEntry.concept}` : undefined}
      >
        {selectedEntry && (
          <div className="space-y-4 text-xs">
            {entryFeedback && (
              <div
                className={`rounded-lg border p-3 ${
                  entryFeedback.type === 'ok'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200'
                }`}
              >
                {entryFeedback.text}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-3 py-2 font-medium">Cuenta</th>
                    <th className="px-3 py-2 font-medium">Concepto</th>
                    <th className="px-3 py-2 font-medium text-right">Debe</th>
                    <th className="px-3 py-2 font-medium text-right">Haber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {selectedEntry.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-mono">{l.accountCode}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.accountName}</div>
                        <div className="text-[11px] text-slate-500">{l.description}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatEUR(l.debit)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatEUR(l.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 font-mono dark:bg-slate-800/60">
              <span>Validación partida doble</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {validateJournalEntryBalance(selectedEntry).valid ? 'CUADRADO (Debe = Haber)' : 'DESCUADRADO'}
              </span>
            </div>

            {can('accounting.entries.approve') && selectedEntry.status === JournalEntryStatus.DRAFT && (
              <button
                type="button"
                onClick={() => {
                  const res = approveAndPostJournalEntry(selectedEntry.id);
                  if (res.ok) {
                    setEntryFeedback({ type: 'ok', text: 'Asiento aprobado y contabilizado en Libro Diario.' });
                    setSelectedEntry({ ...selectedEntry, status: JournalEntryStatus.POSTED });
                  } else {
                    setEntryFeedback({ type: 'err', text: res.error || 'Error al aprobar.' });
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Aprobar y contabilizar asiento</span>
              </button>
            )}

            {can('accounting.entries.approve') && selectedEntry.status === JournalEntryStatus.POSTED && (
              <button
                type="button"
                onClick={() => {
                  const res = reversePostedJournalEntry(selectedEntry.id, 'Rectificación solicitada por contable');
                  if (res.ok) {
                    setEntryFeedback({
                      type: 'ok',
                      text: 'Se ha generado un contraasiento de anulación preservando el rastro de auditoría (los asientos contabilizados nunca se sobrescriben).',
                    });
                    setSelectedEntry({ ...selectedEntry, status: JournalEntryStatus.REVERSED });
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 px-4 py-2.5 font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Anular mediante contraasiento (Auditoría)</span>
              </button>
            )}
          </div>
        )}
      </SlideDrawer>

      {/* New Draft Entry Modal */}
      <ModalDialog open={newEntryOpen} onClose={() => setNewEntryOpen(false)} title="Nuevo asiento contable (Borrador)">
        <form onSubmit={handleCreateDraftEntry} className="space-y-4 text-xs">
          {entryFeedback && entryFeedback.type === 'err' && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              {entryFeedback.text}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block">
              <span>Concepto</span>
              <input type="text" required value={draftConcept} onChange={(e) => setDraftConcept(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span>Fecha</span>
              <input type="date" required value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block">
              <span>Cuenta DEBE</span>
              <select value={draftDebitAcc} onChange={(e) => setDraftDebitAcc(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                {state.chartOfAccounts.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span>Importe Debe (€)</span>
              <input type="number" step="0.01" value={draftDebitAmt} onChange={(e) => setDraftDebitAmt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block">
              <span>Cuenta HABER</span>
              <select value={draftCreditAcc} onChange={(e) => setDraftCreditAcc(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                {state.chartOfAccounts.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span>Importe Haber (€)</span>
              <input type="number" step="0.01" value={draftCreditAmt} onChange={(e) => setDraftCreditAmt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setNewEntryOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white dark:bg-teal-600">
              Crear borrador (validar cuadre)
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
