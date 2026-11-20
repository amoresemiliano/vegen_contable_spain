import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, FileCheck, RefreshCw, Upload } from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { proposeClientTaxObligations } from '../../domain/tax';
import { formatDateEs, formatEUR, TAX_STATUS_LABELS } from '../../domain/formatters';
import {
  EmptyState,
  LegalNoticeBanner,
  PageHeader,
  Panel,
  SlideDrawer,
  StatusLabel,
} from '../../components/ui/Surface';
import { TaxDeclaration, TaxDeclarationStatus } from '../../types/domain';

interface TaxWorkspaceProps {
  mode: 'OBLIGATIONS' | 'DECLARATIONS';
  clientIdFilter?: string;
}

export const TaxWorkspace: React.FC<TaxWorkspaceProps> = ({ mode, clientIdFilter }) => {
  const {
    state,
    accessibleClients,
    can,
    toggleTaxObligationApproval,
    recalculateModel303Draft,
    advanceTaxDeclarationStatus,
  } = useAppStore();

  const targetClientId = clientIdFilter || state.selectedClientId || accessibleClients[0]?.id;
  const client = state.clientProfiles.find((c) => c.id === targetClientId);

  const [selectedPeriod, setSelectedPeriod] = useState<'ALL' | '2026-Q3' | '2026-Q4'>('ALL');
  const [selectedDeclId, setSelectedDeclId] = useState<string | null>(null);
  const [receiptRefInput, setReceiptRefInput] = useState('JUSTIFICANTE-DEMO-EXT-2026Q4');

  const proposedObligations = useMemo(() => {
    if (!client) return [];
    return proposeClientTaxObligations(client, state.taxModels, state.taxObligations);
  }, [client, state.taxModels, state.taxObligations]);

  const declarations = useMemo(() => {
    const allowedIds = new Set(accessibleClients.map((c) => c.id));
    return state.taxDeclarations
      .filter((d) => (clientIdFilter ? d.clientId === clientIdFilter : allowedIds.has(d.clientId)))
      .filter((d) => (selectedPeriod === 'ALL' ? true : d.periodCode === selectedPeriod))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.taxDeclarations, accessibleClients, clientIdFilter, selectedPeriod]);

  const selectedDecl: TaxDeclaration | undefined = state.taxDeclarations.find(
    (d) => d.id === selectedDeclId
  );

  const canManageObligations = can('tax.obligations.manage');
  const canGenerateDrafts = can('tax.drafts.generate');
  const canApproveDrafts = can('tax.drafts.approve');

  if (mode === 'OBLIGATIONS') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Obligaciones Fiscales y Catálogo · ${client?.displayName ?? ''}`}
          subtitle="Motor de propuestas según perfil censal y registro de modelos españoles (036–848)."
        />

        <LegalNoticeBanner
          text="BORRADOR DE DEMOSTRACIÓN — SIN VALIDEZ TRIBUTARIA. Solo el Modelo 303 en Régimen General simplificado ejecuta cálculo automático demostrativo; el resto de modelos muestran su estado normativo."
          tone="warning"
        />

        <Panel>
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold">
              Perfil fiscal propuesto para {client?.displayName}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Criterios evaluados: Entidad ({client?.entityType}) · IVA ({client?.vatRegime}) · Empleados ({client?.hasEmployees ? 'Sí' : 'No'}) · Alquileres ({client?.hasRentals ? 'Sí' : 'No'}) · Intracomunitario ({client?.hasIntracommunityOps ? 'Sí' : 'No'}).
            </p>
          </div>
          {proposedObligations.length === 0 ? (
            <EmptyState
              title="Sin obligaciones periódicas empresariales"
              description="Este perfil corresponde a un particular o entidad sin obligaciones trimestrales periódicas activas."
            />
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {proposedObligations.map((obl) => {
                const model = state.taxModels.find((m) => m.modelNumber === obl.modelNumber);
                return (
                  <div key={obl.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="font-mono text-teal-700 dark:text-teal-400">Modelo {obl.modelNumber}</span>
                        <span>— {model?.officialName}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {obl.rationale} · {model?.frequency} ·{' '}
                        {model?.validationStatus === 'VERIFIED_DEMO_SIMPLIFIED'
                          ? 'Cálculo simplificado activo'
                          : 'PENDIENTE DE VALIDACIÓN NORMATIVA'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusLabel
                        text={obl.approvedByAccountant ? 'Aprobada por asesor' : 'Propuesta pendiente'}
                        tone={obl.approvedByAccountant ? 'success' : 'warning'}
                      />
                      {canManageObligations && state.taxObligations.some((o) => o.id === obl.id) && (
                        <button
                          type="button"
                          onClick={() => toggleTaxObligationApproval(obl.id)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          {obl.approvedByAccountant ? 'Revocar' : 'Aprobar perfil'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel padding="none" className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold">
              Registro extensible de modelos fiscales españoles ({state.taxModels.length} modelos)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 font-medium">Nombre oficial</th>
                  <th className="px-4 py-3 font-medium">Periodicidad</th>
                  <th className="px-4 py-3 font-medium">Plazo habitual</th>
                  <th className="px-4 py-3 font-medium">Estado de reglas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {state.taxModels.map((m) => (
                  <tr key={m.modelNumber} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono font-semibold">{m.modelNumber}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{m.officialName}</div>
                      <div className="text-[11px] text-slate-500">{m.applicabilityCriteria}</div>
                    </td>
                    <td className="px-4 py-2.5">{m.frequency}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{m.typicalDueWindow}</td>
                    <td className="px-4 py-2.5">
                      <StatusLabel
                        text={
                          m.validationStatus === 'VERIFIED_DEMO_SIMPLIFIED'
                            ? 'Demo simplificada activa'
                            : 'PENDIENTE DE VALIDACIÓN NORMATIVA'
                        }
                        tone={m.validationStatus === 'VERIFIED_DEMO_SIMPLIFIED' ? 'success' : 'neutral'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de Declaraciones y Calendario Fiscal"
        subtitle="Preparación de borradores desde registros contables validados. Sin envío telemático a AEAT."
        actions={
          canGenerateDrafts && client && client.vatRegime === 'GENERAL' ? (
            <button
              type="button"
              onClick={() => recalculateModel303Draft(client.id, '2026-Q4')}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Recalcular 303 (4T 2026)</span>
            </button>
          ) : undefined
        }
      />

      <LegalNoticeBanner
        text="BORRADOR DE DEMOSTRACIÓN — SIN VALIDEZ TRIBUTARIA. Esta plataforma nunca realiza presentaciones reales ante la Agencia Tributaria (AEAT)."
        tone="warning"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { k: 'ALL', l: 'Todos los periodos' },
            { k: '2026-Q4', l: '4T 2026 (Actual)' },
            { k: '2026-Q3', l: '3T 2026' },
          ].map((p) => (
            <button
              key={p.k}
              type="button"
              onClick={() => setSelectedPeriod(p.k as typeof selectedPeriod)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                selectedPeriod === p.k
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Calendar className="h-4 w-4" />
          <span>Próximo vencimiento general 4T: 20/01/2027 (111/115) · 30/01/2027 (303/390)</span>
        </div>
      </div>

      {declarations.length === 0 ? (
        <EmptyState
          title="Sin declaraciones fiscales para este cliente o periodo"
          description="El perfil seleccionado no tiene borradores fiscales en este trimestre."
        />
      ) : (
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Modelo / Periodo</th>
                  <th className="px-4 py-3 font-medium">Vencimiento</th>
                  <th className="px-4 py-3 font-medium">Completitud</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo indicativo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {declarations.map((decl) => {
                  const cli = state.clientProfiles.find((c) => c.id === decl.clientId);
                  return (
                    <tr key={decl.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium">{cli?.displayName ?? decl.clientId}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold">Modelo {decl.modelNumber}</div>
                        <div className="text-[11px] text-slate-500">{decl.periodCode}</div>
                      </td>
                      <td className="px-4 py-3 font-mono">{formatDateEs(decl.dueDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className="h-full bg-teal-600"
                              style={{ width: `${decl.completenessPercent}%` }}
                            />
                          </div>
                          <span className="font-mono">{decl.completenessPercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                        {decl.calculatedSummary.netResultAmount !== undefined
                          ? formatEUR(decl.calculatedSummary.netResultAmount)
                          : 'Plantilla'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel
                          text={TAX_STATUS_LABELS[decl.status] ?? decl.status}
                          tone={
                            decl.status === TaxDeclarationStatus.FILED_EXTERNALLY ||
                            decl.status === TaxDeclarationStatus.READY_FOR_EXTERNAL_FILING ||
                            decl.status === TaxDeclarationStatus.APPROVED
                              ? 'success'
                              : decl.status === TaxDeclarationStatus.PENDING_DATA
                              ? 'danger'
                              : 'warning'
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDeclId(decl.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          Revisar borrador
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

      {/* Declaration Review Drawer */}
      <SlideDrawer
        open={Boolean(selectedDecl)}
        onClose={() => setSelectedDeclId(null)}
        title={selectedDecl ? `Modelo ${selectedDecl.modelNumber} · ${selectedDecl.periodCode}` : 'Borrador fiscal'}
        subtitle="BORRADOR DE DEMOSTRACIÓN — SIN VALIDEZ TRIBUTARIA"
        wide
      >
        {selectedDecl && (
          <div className="space-y-5 text-xs">
            <LegalNoticeBanner text="BORRADOR DE DEMOSTRACIÓN — SIN VALIDEZ TRIBUTARIA. Solo para revisión interna y preparación previa a presentación externa." />

            {selectedDecl.missingDataNotes.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="font-semibold">Comprobaciones y datos pendientes:</div>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {selectedDecl.missingDataNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedDecl.calculatedSummary.isSimplifiedCalculation ? (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 space-y-2">
                <div className="font-display text-sm font-semibold">
                  Cálculo simplificado IVA (Régimen General Demo)
                </div>
                <div className="flex justify-between">
                  <span>Base imponible IVA devengado (Facturas emitidas)</span>
                  <span className="font-mono">{formatEUR(selectedDecl.calculatedSummary.outputVatBase ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cuota IVA devengado / repercutido</span>
                  <span className="font-mono font-semibold">{formatEUR(selectedDecl.calculatedSummary.outputVatAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Base imponible IVA deducible (Facturas recibidas)</span>
                  <span className="font-mono">{formatEUR(selectedDecl.calculatedSummary.inputVatBase ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cuota IVA deducible / soportado</span>
                  <span className="font-mono font-semibold">-{formatEUR(selectedDecl.calculatedSummary.inputVatDeductible ?? 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-800">
                  <span>Resultado indicativo neto</span>
                  <span className="font-mono text-teal-700 dark:text-teal-400">
                    {formatEUR(selectedDecl.calculatedSummary.netResultAmount ?? 0)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="font-semibold">Plantilla visual — PENDIENTE DE VALIDACIÓN NORMATIVA</div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Este modelo muestra los registros fuente vinculados pero no ejecuta cálculo legal automatizado completo en esta fase MVP.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Trazabilidad a registros fuente
              </div>
              <div className="mt-2 text-slate-600 dark:text-slate-400">
                Facturas vinculadas: <strong className="font-mono">{selectedDecl.linkedInvoiceIds.length}</strong> · Asientos contables aprobados:{' '}
                <strong className="font-mono">{selectedDecl.linkedEntryIds.length}</strong>
              </div>
            </div>

            {canApproveDrafts && selectedDecl.status !== TaxDeclarationStatus.FILED_EXTERNALLY && (
              <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => advanceTaxDeclarationStatus(selectedDecl.id, TaxDeclarationStatus.APPROVED)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Aprobar revisión</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      advanceTaxDeclarationStatus(selectedDecl.id, TaxDeclarationStatus.READY_FOR_EXTERNAL_FILING)
                    }
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-700"
                  >
                    <FileCheck className="h-4 w-4" />
                    <span>Marcar listo para presentación externa</span>
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="font-medium">Registrar justificante de presentación externa (Simulación manual)</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={receiptRefInput}
                      onChange={(e) => setReceiptRefInput(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        advanceTaxDeclarationStatus(
                          selectedDecl.id,
                          TaxDeclarationStatus.FILED_EXTERNALLY,
                          receiptRefInput
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white dark:bg-slate-700"
                    >
                      <Upload className="h-3.5 w-3.5" /> Registrar justificante
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedDecl.externalReceiptRef && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                Justificante registrado manualmente: <strong className="font-mono">{selectedDecl.externalReceiptRef}</strong> ({formatDateEs(selectedDecl.externalFiledAt || '')})
              </div>
            )}
          </div>
        )}
      </SlideDrawer>
    </div>
  );
};
