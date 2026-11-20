import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCheck2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatDateTimeEs,
  formatEUR,
  round2,
} from '../../domain/formatters';
import { useAppStore } from '../../services/useAppStore';
import { DocumentRecord, DocumentStatus } from '../../types/domain';
import {
  EmptyState,
  LegalNoticeBanner,
  PageHeader,
  Panel,
  SlideDrawer,
  StatusLabel,
} from '../../components/ui/Surface';
import { DocumentUploadModal } from './DocumentUploadModal';

interface DocumentInboxViewProps {
  clientId?: string; // If undefined, shows across all accessible clients for professional
  isClientMode?: boolean;
  onNavigateToAccounting?: () => void;
}

export const DocumentInboxView: React.FC<DocumentInboxViewProps> = ({
  clientId,
  isClientMode = false,
  onNavigateToAccounting,
}) => {
  const {
    state,
    accessibleClients,
    can,
    updateDocumentExtraction,
    approveDocumentAndGenerateEntry,
    rejectDocument,
    updateSimulatedChannels,
  } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'INBOX' | 'CHANNELS' | 'RULES'>('INBOX');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Edit extraction state inside drawer
  const [editCounterparty, setEditCounterparty] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editBase, setEditBase] = useState('');
  const [editVatRate, setEditVatRate] = useState('21');
  const [editWithholding, setEditWithholding] = useState('0');
  const [editAccountCode, setEditAccountCode] = useState('6290');
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const allowedClientIds = useMemo(
    () => new Set(accessibleClients.map((c) => c.id)),
    [accessibleClients]
  );

  const docs = useMemo(() => {
    return state.documents
      .filter((d) => (clientId ? d.clientId === clientId : allowedClientIds.has(d.clientId)))
      .filter((d) => (statusFilter === 'ALL' ? true : d.status === statusFilter))
      .filter((d) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          d.fileName.toLowerCase().includes(q) ||
          (d.extraction?.counterpartyName.toLowerCase().includes(q) ?? false) ||
          (d.extraction?.invoiceNumber.toLowerCase().includes(q) ?? false)
        );
      });
  }, [state.documents, clientId, allowedClientIds, statusFilter, search]);

  const selectedDoc: DocumentRecord | undefined = state.documents.find((d) => d.id === selectedDocId);

  const openDocumentReview = (doc: DocumentRecord) => {
    setSelectedDocId(doc.id);
    setFeedbackMsg(null);
    if (doc.extraction) {
      setEditCounterparty(doc.extraction.counterpartyName);
      setEditTaxId(doc.extraction.counterpartyTaxId);
      setEditInvoiceNumber(doc.extraction.invoiceNumber);
      setEditBase(String(doc.extraction.taxableBase));
      setEditVatRate(String(doc.extraction.vatRate));
      setEditWithholding(String(doc.extraction.withholdingAmount));
      setEditAccountCode(doc.extraction.suggestedAccountCode);
    }
  };

  const handleSaveCorrections = () => {
    if (!selectedDoc) return;
    const baseNum = Number.parseFloat(editBase.replace(',', '.')) || 0;
    const vatNum = Number(editVatRate) || 0;
    const irpfNum = Number.parseFloat(editWithholding.replace(',', '.')) || 0;
    updateDocumentExtraction(
      selectedDoc.id,
      {
        counterpartyName: editCounterparty,
        counterpartyTaxId: editTaxId,
        invoiceNumber: editInvoiceNumber,
        taxableBase: round2(baseNum),
        vatRate: vatNum,
        withholdingAmount: round2(irpfNum),
        suggestedAccountCode: editAccountCode,
      },
      saveAsRule
    );
    setFeedbackMsg({
      type: 'ok',
      text: saveAsRule
        ? 'Correcciones guardadas y regla de preferencia explícita registrada para futuras facturas de este proveedor.'
        : 'Correcciones guardadas en la extracción del documento.',
    });
  };

  const handleApproveAndPost = () => {
    if (!selectedDoc) return;
    // Save latest edits first before approving
    if (selectedDoc.extraction) {
      const baseNum = Number.parseFloat(editBase.replace(',', '.')) || selectedDoc.extraction.taxableBase;
      const vatNum = Number(editVatRate) || selectedDoc.extraction.vatRate;
      const irpfNum = Number.parseFloat(editWithholding.replace(',', '.')) || 0;
      updateDocumentExtraction(
        selectedDoc.id,
        {
          counterpartyName: editCounterparty || selectedDoc.extraction.counterpartyName,
          counterpartyTaxId: editTaxId || selectedDoc.extraction.counterpartyTaxId,
          invoiceNumber: editInvoiceNumber || selectedDoc.extraction.invoiceNumber,
          taxableBase: round2(baseNum),
          vatRate: vatNum,
          withholdingAmount: round2(irpfNum),
          suggestedAccountCode: editAccountCode || selectedDoc.extraction.suggestedAccountCode,
        },
        false
      );
    }
    const res = approveDocumentAndGenerateEntry(selectedDoc.id);
    if (res.ok) {
      setFeedbackMsg({
        type: 'ok',
        text: 'Documento aprobado y asiento contable cuadrado generado en el Libro Diario. Los informes e IVA Modelo 303 han sido actualizados.',
      });
    } else {
      setFeedbackMsg({ type: 'err', text: res.error || 'No se pudo aprobar el documento.' });
    }
  };

  const statusTone = (status: DocumentStatus) => {
    if (status === DocumentStatus.ACCOUNTED || status === DocumentStatus.APPROVED) return 'success';
    if (status === DocumentStatus.NEEDS_REVIEW || status === DocumentStatus.EXTRACTED) return 'warning';
    if (status === DocumentStatus.REJECTED) return 'danger';
    return 'info';
  };

  const canUpload = can('documents.upload');
  const canReview = can('documents.review');
  const activeClientId = clientId || state.selectedClientId;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isClientMode ? 'Documentos y Justificantes' : 'Bandeja de Documentos y Extracción IA'}
        subtitle={
          isClientMode
            ? 'Sube tus facturas o tickets y sigue el estado de revisión de tu gestoría.'
            : 'Revisa extracciones asistidas, corrige incidencias, aplica reglas de aprendizaje y genera asientos contables.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isClientMode && (
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode('INBOX')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    viewMode === 'INBOX'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Bandeja ({docs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('RULES')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    viewMode === 'RULES'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Reglas ({state.extractionRules.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('CHANNELS')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    viewMode === 'CHANNELS'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Canales (Simulados)
                </button>
              </div>
            )}
            {canUpload && (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                <Plus className="h-4 w-4" />
                <span>Subir documento</span>
              </button>
            )}
          </div>
        }
      />

      {viewMode === 'CHANNELS' && !isClientMode && (
        <div className="space-y-4">
          <LegalNoticeBanner
            text="INTEGRACIONES SIMULADAS — NO CONECTADAS: Las bandejas de Email y WhatsApp Business muestran ejemplos demostrativos sin conexión ni recepción de mensajes desde servicios externos."
            tone="warning"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Mail className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-semibold">Ingesta por Correo Electrónico</h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Estado: No conectado · Simulación de canal
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSimulatedChannels({ emailEnabled: !state.simulatedChannels.emailEnabled })}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                >
                  {state.simulatedChannels.emailEnabled ? 'Simulación activa' : 'Activar vista ejemplo'}
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-slate-500">Dirección asignada de demostración:</div>
                <div className="mt-1 font-mono font-medium">{state.simulatedChannels.emailAddress}</div>
                <div className="mt-3 border-t border-slate-200 pt-2 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  Ejemplo simulado: «Adjunto factura hosting Noviembre» · PDF 312 KB (Sin webhook activo)
                </div>
              </div>
            </Panel>

            <Panel>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <MessageSquare className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-semibold">Ingesta vía WhatsApp Business</h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Estado: No conectado · Simulación de canal
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSimulatedChannels({ whatsappEnabled: !state.simulatedChannels.whatsappEnabled })}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                >
                  {state.simulatedChannels.whatsappEnabled ? 'Simulación activa' : 'Activar vista ejemplo'}
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-slate-500">Número receptor simulado:</div>
                <div className="mt-1 font-mono font-medium">{state.simulatedChannels.whatsappNumber}</div>
                <div className="mt-3 border-t border-slate-200 pt-2 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  Ejemplo simulado: Foto de ticket restaurante subida por cliente (Sin envío real WhatsApp API)
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {viewMode === 'RULES' && !isClientMode && (
        <Panel>
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold">
              Reglas explícitas de preferencia y aprendizaje documental
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Cuando un contable corrige una cuenta PGC o tipo de IVA y guarda la preferencia, el motor de extracción aplica esa regla determinista en futuras facturas del mismo proveedor (sin reentrenamiento opaco de modelos).
            </p>
          </div>
          {state.extractionRules.length === 0 ? (
            <EmptyState
              title="Sin reglas personalizadas todavía"
              description="Corrige un documento en la bandeja y marca 'Guardar regla de preferencia' para verla aquí."
            />
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {state.extractionRules.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {rule.supplierName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      NIF patrón: {rule.supplierTaxIdPattern} · {rule.note}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-teal-700 dark:text-teal-400">
                    Cuenta {rule.preferredAccountCode} · IVA {rule.preferredVatRate}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {viewMode === 'INBOX' && (
        <>
          {/* Filter Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {[
                { key: 'ALL', label: 'Todos' },
                { key: DocumentStatus.NEEDS_REVIEW, label: 'Requiere revisión' },
                { key: DocumentStatus.EXTRACTED, label: 'Extraídos' },
                { key: DocumentStatus.ACCOUNTED, label: 'Contabilizados' },
                { key: DocumentStatus.REJECTED, label: 'Rechazados' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar archivo, proveedor o nº factura..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {docs.length === 0 ? (
            <EmptyState
              title="No hay documentos en este filtro"
              description="Sube un nuevo documento desde el botón superior o cambia el filtro de estado."
              action={
                canUpload ? (
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white dark:bg-teal-600"
                  >
                    Subir documento
                  </button>
                ) : undefined
              }
            />
          ) : (
            <Panel padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                      <th className="px-4 py-3 font-medium">Documento / Archivo</th>
                      <th className="px-4 py-3 font-medium">Cliente</th>
                      <th className="px-4 py-3 font-medium">Emisor / Extraído</th>
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {docs.map((doc) => {
                      const client = state.clientProfiles.find((c) => c.id === doc.clientId);
                      const hasDup = Boolean(doc.extraction?.duplicateCandidateDocId);
                      const uncertainCount =
                        doc.extraction?.fieldConfidences.filter((f) => f.uncertain).length ?? 0;

                      return (
                        <tr
                          key={doc.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {doc.fileName}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              {DOCUMENT_TYPE_LABELS[doc.type]} · {formatDateTimeEs(doc.uploadedAt)}
                              {hasDup ? ' · Posible duplicado' : ''}
                              {uncertainCount > 0 ? ` · ${uncertainCount} campo(s) dudoso(s)` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {client?.displayName ?? doc.clientId}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-900 dark:text-slate-100">
                              {doc.extraction?.counterpartyName ?? '—'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {doc.extraction?.invoiceNumber ?? 'Sin número'} · Cta{' '}
                              {doc.extraction?.suggestedAccountCode ?? '—'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {doc.extraction ? formatEUR(doc.extraction.totalAmount) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusLabel
                              text={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                              tone={statusTone(doc.status)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openDocumentReview(doc)}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>{canReview && doc.status !== DocumentStatus.ACCOUNTED ? 'Revisar' : 'Detalle'}</span>
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
        </>
      )}

      {/* Side-by-side Document Preview + AI Extraction Review Drawer */}
      <SlideDrawer
        open={Boolean(selectedDoc)}
        onClose={() => setSelectedDocId(null)}
        title={selectedDoc?.fileName ?? 'Detalle del documento'}
        subtitle={
          selectedDoc
            ? `${DOCUMENT_TYPE_LABELS[selectedDoc.type]} · Subido por ${selectedDoc.uploadedByName} · ${formatDateTimeEs(selectedDoc.uploadedAt)}`
            : undefined
        }
        wide
      >
        {selectedDoc && (
          <div className="space-y-6">
            {selectedDoc.extraction?.duplicateCandidateDocId && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50/80 p-3.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-semibold">Alerta de posible factura duplicada:</span> Coincide en proveedor y número de factura con un documento ya registrado. Verifica antes de aprobar.
                </div>
              </div>
            )}

            {feedbackMsg && (
              <div
                className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs ${
                  feedbackMsg.type === 'ok'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                }`}
              >
                <span>{feedbackMsg.text}</span>
                {feedbackMsg.type === 'ok' && onNavigateToAccounting && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDocId(null);
                      onNavigateToAccounting();
                    }}
                    className="shrink-0 font-semibold underline"
                  >
                    Ver en Asientos
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left: Synthetic Document Visual Preview */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Vista previa del justificante
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                    <span className="font-display font-semibold text-slate-900 dark:text-slate-100">
                      {selectedDoc.extraction?.counterpartyName ?? 'Documento'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {selectedDoc.sourceChannel}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-slate-600 dark:text-slate-400">
                    <div>NIF/CIF: <span className="font-mono text-slate-900 dark:text-slate-200">{selectedDoc.extraction?.counterpartyTaxId}</span></div>
                    <div>Nº Factura: <span className="font-mono text-slate-900 dark:text-slate-200">{selectedDoc.extraction?.invoiceNumber}</span></div>
                    <div>Fecha emisión: <span className="font-mono">{selectedDoc.extraction?.issueDate}</span></div>
                    <p className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed dark:border-slate-800 dark:bg-slate-900">
                      {selectedDoc.previewSummary}
                    </p>
                  </div>
                  <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800 space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span>Base imponible</span>
                      <span>{formatEUR(selectedDoc.extraction?.taxableBase ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IVA ({selectedDoc.extraction?.vatRate ?? 21}%)</span>
                      <span>{formatEUR(selectedDoc.extraction?.vatAmount ?? 0)}</span>
                    </div>
                    {(selectedDoc.extraction?.withholdingAmount ?? 0) > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>Retención IRPF</span>
                        <span>-{formatEUR(selectedDoc.extraction?.withholdingAmount ?? 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                      <span>Total documento</span>
                      <span>{formatEUR(selectedDoc.extraction?.totalAmount ?? 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Confidence disclaimer */}
                {selectedDoc.extraction && (
                  <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                        Indicador orientativo de lectura IA
                      </span>
                      <span className="font-mono font-semibold">
                        {Math.round(selectedDoc.extraction.overallConfidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      La confianza orientativa no garantiza exactitud fiscal ni sustituye la validación contable.
                    </p>
                    {selectedDoc.extraction.fieldConfidences.filter((f) => f.uncertain).length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-amber-800 dark:text-amber-300">
                        {selectedDoc.extraction.fieldConfidences
                          .filter((f) => f.uncertain)
                          .map((f) => (
                            <li key={f.field}>
                              • Campo <strong>{f.field}</strong>: {f.reason}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Editable Extraction & Accounting Proposal */}
              <div className="space-y-4">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Campos estructurados y propuesta contable
                </div>

                <div className="space-y-3 text-xs">
                  <label className="block">
                    <span className="text-slate-600 dark:text-slate-400">Proveedor / Cliente</span>
                    <input
                      type="text"
                      disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                      value={editCounterparty}
                      onChange={(e) => setEditCounterparty(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-slate-600 dark:text-slate-400">NIF / CIF</span>
                      <input
                        type="text"
                        disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                        value={editTaxId}
                        onChange={(e) => setEditTaxId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                      />
                    </label>
                    <label className="block">
                      <span className="text-slate-600 dark:text-slate-400">Nº Factura</span>
                      <input
                        type="text"
                        disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                        value={editInvoiceNumber}
                        onChange={(e) => setEditInvoiceNumber(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-slate-600 dark:text-slate-400">Base (€)</span>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                        value={editBase}
                        onChange={(e) => setEditBase(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                      />
                    </label>
                    <label className="block">
                      <span className="text-slate-600 dark:text-slate-400">IVA (%)</span>
                      <select
                        disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                        value={editVatRate}
                        onChange={(e) => setEditVatRate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                      >
                        <option value="21">21%</option>
                        <option value="10">10%</option>
                        <option value="4">4%</option>
                        <option value="0">0%</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-slate-600 dark:text-slate-400">Retención (€)</span>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                        value={editWithholding}
                        onChange={(e) => setEditWithholding(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-slate-600 dark:text-slate-400">Subcuenta PGC propuesta</span>
                    <select
                      disabled={!canReview || selectedDoc.status === DocumentStatus.ACCOUNTED}
                      value={editAccountCode}
                      onChange={(e) => setEditAccountCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                    >
                      {state.chartOfAccounts
                        .filter((a) => a.group === 6 || a.group === 7 || a.group === 2)
                        .map((acc) => (
                          <option key={acc.code} value={acc.code}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  {canReview && selectedDoc.status !== DocumentStatus.ACCOUNTED && (
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                      <input
                        type="checkbox"
                        checked={saveAsRule}
                        onChange={(e) => setSaveAsRule(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600"
                      />
                      <span className="text-[11px] text-slate-700 dark:text-slate-300">
                        Guardar cuenta e IVA como regla explícita para este proveedor
                      </span>
                    </label>
                  )}
                </div>

                {canReview && selectedDoc.status !== DocumentStatus.ACCOUNTED && selectedDoc.status !== DocumentStatus.REJECTED && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleSaveCorrections}
                      className="min-h-[40px] rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Guardar corrección
                    </button>
                    <button
                      type="button"
                      onClick={handleApproveAndPost}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
                    >
                      <FileCheck2 className="h-4 w-4" />
                      <span>Aprobar y generar asiento</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        rejectDocument(selectedDoc.id, 'Descartado por contable (posible duplicado o no deducible)');
                        setFeedbackMsg({ type: 'ok', text: 'Documento marcado como rechazado.' });
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Rechazar</span>
                    </button>
                  </div>
                )}

                {selectedDoc.status === DocumentStatus.ACCOUNTED && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Documento ya contabilizado y vinculado al Libro Diario e IVA.</span>
                  </div>
                )}

                {/* Review audit trail */}
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Historial de correcciones ({selectedDoc.reviewHistory.length})
                  </div>
                  {selectedDoc.reviewHistory.length === 0 ? (
                    <p className="mt-1 text-[11px] text-slate-500">Sin correcciones registradas todavía.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                      {selectedDoc.reviewHistory.map((log) => (
                        <li key={log.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{log.reviewerName}</span> ·{' '}
                          {formatDateTimeEs(log.timestamp)} — {log.changesSummary}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SlideDrawer>

      <DocumentUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        clientId={activeClientId}
      />
    </div>
  );
};
