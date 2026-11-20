import React, { useMemo, useState } from 'react';
import { Check, FileSpreadsheet, Info, Upload } from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import {
  computeCashFlowForecast,
  computeTreasuryMetrics,
  CsvParseRow,
  findReconciliationCandidates,
  parseBankCsvText,
} from '../../domain/treasury';
import { formatDateEs, formatEUR } from '../../domain/formatters';
import {
  EmptyState,
  LegalNoticeBanner,
  MetricCard,
  ModalDialog,
  PageHeader,
  Panel,
  StatusLabel,
} from '../../components/ui/Surface';
import { CashFlowComparisonChart } from '../../components/ui/Charts';

interface TreasuryWorkspaceProps {
  clientIdFilter?: string;
  defaultTab?: 'OVERVIEW' | 'RECONCILIATION' | 'FORECAST';
}

const SAMPLE_CSV_TEMPLATE = `Fecha;Concepto;Contraparte;Referencia;Importe
18/11/2026;TRANSF CLINICA VITALIA F-2026-046;Clinica Vitalia Salud SL;F-2026-046;4719,00
20/11/2026;ABONO CONSULTORIA ENERGETICA DEMO;Grupo Solaria Energia Demo SL;SOL-NOV-99;2420,00
20/11/2026;COMISION TRANSFERENCIA SEPA;Banco Atlantico Demo;COM-NOV-02;-18,50`;

export const TreasuryWorkspace: React.FC<TreasuryWorkspaceProps> = ({
  clientIdFilter,
  defaultTab = 'OVERVIEW',
}) => {
  const {
    state,
    accessibleClients,
    can,
    importBankCsvRows,
    approveReconciliationMatch,
    resolveReconciliationException,
  } = useAppStore();

  const targetClientId = clientIdFilter || state.selectedClientId || accessibleClients[0]?.id;
  const client = state.clientProfiles.find((c) => c.id === targetClientId);

  const [tab, setTab] = useState<'OVERVIEW' | 'RECONCILIATION' | 'FORECAST'>(defaultTab);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState(SAMPLE_CSV_TEMPLATE);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [parsedPreview, setParsedPreview] = useState<CsvParseRow[] | null>(null);
  const [importResultMsg, setImportResultMsg] = useState<string | null>(null);

  const clientAccounts = useMemo(
    () => state.bankAccounts.filter((a) => a.clientId === targetClientId),
    [state.bankAccounts, targetClientId]
  );

  const clientTransactions = useMemo(
    () =>
      state.bankTransactions
        .filter((t) => t.clientId === targetClientId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.bankTransactions, targetClientId]
  );

  const metrics = useMemo(
    () =>
      computeTreasuryMetrics(
        targetClientId,
        state.bankAccounts,
        state.bankTransactions,
        state.invoices,
        state.journalEntries,
        state.chartOfAccounts
      ),
    [
      targetClientId,
      state.bankAccounts,
      state.bankTransactions,
      state.invoices,
      state.journalEntries,
      state.chartOfAccounts,
    ]
  );

  const clientFinancialProfile = state.financialProfiles.find((f) => f.clientId === targetClientId);
  const forecastPoints = useMemo(
    () =>
      computeCashFlowForecast(
        metrics,
        clientFinancialProfile?.monthlyGrossIncome ?? 12000,
        (clientFinancialProfile?.monthlyFixedExpenses ?? 7000) +
          (clientFinancialProfile?.monthlyVariableExpenses ?? 1500)
      ),
    [metrics, clientFinancialProfile]
  );

  const alreadyReconciledInvoices = useMemo(
    () =>
      new Set(
        state.bankTransactions
          .filter((t) => t.reconciliationStatus === 'RECONCILED' && t.reconciledInvoiceId)
          .map((t) => t.reconciledInvoiceId as string)
      ),
    [state.bankTransactions]
  );

  const filteredTransactions = useMemo(() => {
    return clientTransactions.filter((t) =>
      statusFilter === 'ALL' ? true : t.reconciliationStatus === statusFilter
    );
  }, [clientTransactions, statusFilter]);

  const handleOpenCsv = () => {
    setSelectedBankId(clientAccounts[0]?.id ?? '');
    setParsedPreview(null);
    setImportResultMsg(null);
    setCsvModalOpen(true);
  };

  const handleParseCsv = () => {
    const existingFingerprints = new Set(
      clientTransactions.map((t) => t.fingerprint)
    );
    const rows = parseBankCsvText(csvText, existingFingerprints, ';');
    setParsedPreview(rows);
  };

  const handleConfirmCsvImport = () => {
    if (!parsedPreview || !selectedBankId) return;
    const batch = importBankCsvRows(
      targetClientId,
      selectedBankId,
      `extracto_demo_${Date.now().toString().slice(-4)}.csv`,
      parsedPreview
    );
    setImportResultMsg(
      `Importación completada: ${batch.importedRows} movimiento(s) nuevo(s) añadidos y ${batch.duplicateRowsRejected} duplicado(s) rechazados automáticamente.`
    );
    setParsedPreview(null);
  };

  const handleCsvFileUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setCsvText(ev.target.result);
        setParsedPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const canImport = can('treasury.transactions.import');
  const canApproveRec = can('treasury.reconciliation.approve');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bancos, Tesorería y Conciliación · ${client?.displayName ?? ''}`}
        subtitle="Saldos bancarios sintéticos, distinción entre beneficio y liquidez, importación CSV y conciliación determinista."
        actions={
          canImport && clientAccounts.length > 0 ? (
            <button
              type="button"
              onClick={handleOpenCsv}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <Upload className="h-4 w-4" />
              <span>Importar extracto CSV</span>
            </button>
          ) : undefined
        }
      />

      <LegalNoticeBanner
        text="BANCOS SINTÉTICOS DE DEMOSTRACIÓN: No existen conexiones PSD2 ni agregadores bancarios reales conectados en esta fase."
        tone="info"
      />

      {/* Distinct Metrics Grid: Never conflating Profit with Cash or Liquidity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MetricCard
          label="Saldo bancario total"
          value={formatEUR(metrics.cashBalance)}
          detail={`${clientAccounts.length} cuenta(s) activas`}
        />
        <MetricCard
          label="Liquidez disponible"
          value={formatEUR(metrics.availableLiquidity)}
          detail="Saldo libre operativo"
          tone="accent"
        />
        <MetricCard
          label="Caja restringida"
          value={formatEUR(metrics.restrictedCash)}
          detail="Reservas fiscales / metas"
          tone="warning"
        />
        <MetricCard
          label="Cobros esperados"
          value={formatEUR(metrics.expectedCashInflows)}
          detail="Facturas emitidas abiertas"
          tone="positive"
        />
        <MetricCard
          label="Pagos próximos"
          value={formatEUR(metrics.upcomingPayables)}
          detail="Proveedores por vencer"
          tone="danger"
        />
        <MetricCard
          label="Beneficio contable (Devengo)"
          value={formatEUR(metrics.accountingProfit)}
          detail="Resultado PyG (≠ Caja)"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 w-fit">
        {[
          { k: 'OVERVIEW', l: 'Cuentas y Movimientos' },
          { k: 'RECONCILIATION', l: 'Conciliación y Excepciones' },
          { k: 'FORECAST', l: 'Previsión 30/60/90d y 12m' },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k as typeof tab)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === t.k
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'FORECAST' ? (
        <Panel className="space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold">
              Previsión de Flujo de Caja (30, 60, 90 días y 12 meses)
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Proyección calculada a partir de la liquidez disponible actual, vencimientos de facturas pendientes y cadencia mensual estimada.
            </p>
          </div>
          <CashFlowComparisonChart points={forecastPoints} />
        </Panel>
      ) : (
        <>
          {/* Bank Accounts Strip */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {clientAccounts.map((acc) => (
              <Panel key={acc.id} padding="sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {acc.bankName} · {acc.ownershipScope === 'PERSONAL' ? 'Titularidad Personal' : 'Titularidad Empresarial'}
                    </div>
                    <div className="mt-0.5 font-display text-sm font-semibold">{acc.alias}</div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{acc.ibanMasked}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold tabular-nums">{formatEUR(acc.currentBalance)}</div>
                    <div className="text-[11px] text-teal-700 dark:text-teal-400">
                      Disponible: {formatEUR(acc.availableBalance)}
                    </div>
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          {/* Transaction Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {[
                { k: 'ALL', l: 'Todos' },
                { k: 'PROPOSED_MATCH', l: 'Propuestas' },
                { k: 'EXCEPTION', l: 'Excepciones' },
                { k: 'UNMATCHED', l: 'Sin conciliar' },
                { k: 'RECONCILED', l: 'Conciliados' },
              ].map((st) => (
                <button
                  key={st.k}
                  type="button"
                  onClick={() => setStatusFilter(st.k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    statusFilter === st.k
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st.l}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              Mostrando <strong className="font-mono">{filteredTransactions.length}</strong> movimiento(s)
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <EmptyState
              title="Sin movimientos en este filtro"
              description="Cambia el filtro superior o importa un extracto CSV de demostración."
            />
          ) : (
            <Panel padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Concepto / Contraparte</th>
                      <th className="px-4 py-3 font-medium text-right">Importe</th>
                      <th className="px-4 py-3 font-medium">Conciliación / Reglas</th>
                      <th className="px-4 py-3 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredTransactions.slice(0, 35).map((tx) => {
                      const candidates =
                        tx.reconciliationStatus !== 'RECONCILED'
                          ? findReconciliationCandidates(tx, state.invoices, alreadyReconciledInvoices)
                          : [];
                      const topCandidate =
                        candidates[0] ??
                        (tx.proposedInvoiceId
                          ? {
                              invoiceId: tx.proposedInvoiceId,
                              invoiceNumber:
                                state.invoices.find((i) => i.id === tx.proposedInvoiceId)?.invoiceNumber ??
                                tx.proposedInvoiceId,
                              confidence: tx.matchConfidence ?? 0.85,
                              reason: tx.matchReason ?? 'Coincidencia propuesta',
                              ambiguous: false,
                            }
                          : undefined);

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono whitespace-nowrap">{formatDateEs(tx.date)}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{tx.description}</div>
                            <div className="text-[11px] text-slate-500">
                              {tx.counterparty} · Ref: {tx.reference}
                            </div>
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                              tx.amount >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {formatEUR(tx.amount)}
                          </td>
                          <td className="px-4 py-3">
                            {tx.reconciliationStatus === 'RECONCILED' ? (
                              <StatusLabel text={tx.matchReason || 'Conciliado'} tone="success" />
                            ) : tx.reconciliationStatus === 'EXCEPTION' ? (
                              <StatusLabel text={tx.matchReason || 'Excepción bancaria'} tone="danger" />
                            ) : topCandidate ? (
                              <div>
                                <StatusLabel
                                  text={`Propuesta: ${topCandidate.invoiceNumber} (${Math.round(topCandidate.confidence * 100)}%)`}
                                  tone="warning"
                                />
                                <div className="mt-0.5 text-[11px] text-slate-500">{topCandidate.reason}</div>
                              </div>
                            ) : (
                              <StatusLabel text="Sin factura coincidente" tone="neutral" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {tx.reconciliationStatus !== 'RECONCILED' && canApproveRec && topCandidate && (
                              <button
                                type="button"
                                onClick={() => approveReconciliationMatch(tx.id, topCandidate.invoiceId)}
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700"
                              >
                                <Check className="h-3.5 w-3.5" /> Aprobar cruce
                              </button>
                            )}
                            {tx.reconciliationStatus === 'EXCEPTION' && canApproveRec && !topCandidate && (
                              <button
                                type="button"
                                onClick={() =>
                                  resolveReconciliationException(tx.id, 'Imputado a gasto/anticipo por contable')
                                }
                                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700"
                              >
                                Resolver excepción
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}

      {/* CSV Import Modal */}
      <ModalDialog open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title="Importar extracto bancario CSV (Demo)">
        <div className="space-y-4 text-xs">
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Formato esperado: <strong>Fecha;Concepto;Contraparte;Referencia;Importe</strong>. El ejemplo precargado incluye 1 movimiento ya existente para demostrar el rechazo automático de duplicados y 2 movimientos nuevos.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Cuenta bancaria destino</span>
              <select
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {clientAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.alias} ({a.ibanMasked})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Cargar archivo .CSV local (opcional)</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleCsvFileUpload(e.target.files?.[0])}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-slate-600 dark:text-slate-400">Contenido CSV (editable para pruebas)</span>
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setParsedPreview(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {importResultMsg && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              {importResultMsg}
            </div>
          )}

          {parsedPreview && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-3 py-2">Fecha norm.</th>
                    <th className="px-3 py-2">Concepto</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                    <th className="px-3 py-2">Validación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {parsedPreview.map((r) => (
                    <tr key={r.rowIndex}>
                      <td className="px-3 py-2 font-mono">{r.normalizedDate}</td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatEUR(r.amount)}</td>
                      <td className="px-3 py-2">
                        {r.error ? (
                          <StatusLabel text={r.error} tone="danger" />
                        ) : r.isDuplicate ? (
                          <StatusLabel text="Duplicado rechazado" tone="warning" />
                        ) : (
                          <StatusLabel text="Válido (Nuevo)" tone="success" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={handleParseCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 font-medium dark:border-slate-700"
            >
              <FileSpreadsheet className="h-4 w-4" /> Previsualizar y validar
            </button>
            {parsedPreview && parsedPreview.some((r) => !r.isDuplicate && !r.error) && (
              <button
                type="button"
                onClick={handleConfirmCsvImport}
                className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-700"
              >
                Confirmar importación
              </button>
            )}
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
