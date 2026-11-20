import React, { useMemo, useState } from 'react';
import { FilePlus2, Lock, Printer, Search } from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { formatDateEs, formatEUR, round2 } from '../../domain/formatters';
import {
  EmptyState,
  LegalNoticeBanner,
  ModalDialog,
  PageHeader,
  Panel,
  SlideDrawer,
  StatusLabel,
} from '../../components/ui/Surface';
import { Invoice, InvoiceLine } from '../../types/domain';

interface InvoicingWorkspaceProps {
  clientId?: string;
}

export const InvoicingWorkspace: React.FC<InvoicingWorkspaceProps> = ({ clientId }) => {
  const { state, accessibleClients, can, saveDraftInvoice } = useAppStore();
  const [tab, setTab] = useState<'ISSUED' | 'RECEIVED' | 'QUOTES' | 'CONTACTS'>('ISSUED');
  const [search, setSearch] = useState('');
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Draft invoice builder state
  const activeClientId = clientId || state.selectedClientId;
  const [draftDirection, setDraftDirection] = useState<'ISSUED' | 'RECEIVED'>('ISSUED');
  const [draftKind, setDraftKind] = useState<'INVOICE' | 'QUOTE' | 'CREDIT_NOTE'>('INVOICE');
  const [draftContactName, setDraftContactName] = useState('Grupo Solaria Energía Demo SL');
  const [draftContactTaxId, setDraftContactTaxId] = useState('B-90010011 DEMO');
  const [draftDesc, setDraftDesc] = useState('Servicios de consultoría estratégica mensual');
  const [draftQty, setDraftQty] = useState('1');
  const [draftPrice, setDraftPrice] = useState('1800');
  const [draftDiscount, setDraftDiscount] = useState('0');
  const [draftVat, setDraftVat] = useState('21');
  const [draftIrpf, setDraftIrpf] = useState('0');

  const allowedIds = useMemo(() => new Set(accessibleClients.map((c) => c.id)), [accessibleClients]);

  const filteredInvoices = useMemo(() => {
    return state.invoices
      .filter((inv) => (clientId ? inv.clientId === clientId : allowedIds.has(inv.clientId)))
      .filter((inv) => {
        if (tab === 'QUOTES') return inv.kind === 'QUOTE' || inv.isRecurringTemplate;
        if (tab === 'ISSUED') return inv.direction === 'ISSUED' && inv.kind !== 'QUOTE';
        if (tab === 'RECEIVED') return inv.direction === 'RECEIVED' && inv.kind !== 'QUOTE';
        return false;
      })
      .filter((inv) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.contactName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [state.invoices, clientId, allowedIds, tab, search]);

  const contacts = useMemo(() => {
    return state.contacts.filter((c) =>
      clientId ? c.clientId === clientId : allowedIds.has(c.clientId)
    );
  }, [state.contacts, clientId, allowedIds]);

  const qtyNum = Number.parseFloat(draftQty) || 1;
  const priceNum = Number.parseFloat(draftPrice) || 0;
  const discNum = Number.parseFloat(draftDiscount) || 0;
  const vatNum = Number.parseFloat(draftVat) || 0;
  const irpfNum = Number.parseFloat(draftIrpf) || 0;
  const calcSub = round2(qtyNum * priceNum * (1 - discNum / 100));
  const calcVat = round2(calcSub * (vatNum / 100));
  const calcIrpf = round2(calcSub * (irpfNum / 100));
  const calcTotal = round2(calcSub + calcVat - calcIrpf);

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const line: InvoiceLine = {
      id: `dl-${Date.now()}`,
      description: draftDesc,
      quantity: qtyNum,
      unitPrice: priceNum,
      discountPercent: discNum,
      vatRate: vatNum,
      withholdingRate: irpfNum,
      accountCode: draftDirection === 'ISSUED' ? '7050' : '6290',
      lineSubtotal: calcSub,
      lineVat: calcVat,
      lineWithholding: calcIrpf,
      lineTotal: calcTotal,
    };

    const created = saveDraftInvoice({
      clientId: activeClientId,
      direction: draftDirection,
      kind: draftKind,
      status: 'DRAFT',
      invoiceNumber: `BORR-${Date.now().toString().slice(-4)}`,
      contactId: `cnt-${Date.now()}`,
      contactName: draftContactName,
      contactTaxId: draftContactTaxId,
      issueDate: '2026-11-20',
      dueDate: '2026-12-20',
      paymentMethod: 'Transferencia 30 días',
      taxableBase: calcSub,
      vatAmount: calcVat,
      withholdingAmount: calcIrpf,
      totalAmount: calcTotal,
      paidAmount: 0,
      lines: [line],
      notes: 'Borrador de demostración creado en módulo de facturación.',
    });
    setCreateOpen(false);
    setPreviewInvoice(created);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturación y Contactos (Modo Borrador)"
        subtitle="Gestión estructurada de facturas emitidas, recibidas, presupuestos y plantillas en entorno demostración."
        actions={
          can('invoices.create') ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <FilePlus2 className="h-4 w-4" />
              <span>Nuevo borrador demo</span>
            </button>
          ) : undefined
        }
      />

      <LegalNoticeBanner
        text="DOCUMENTO DE DEMOSTRACIÓN — NO VÁLIDO PARA FACTURACIÓN REAL. La emisión legal VERI*FACTU y la factura electrónica certificada permanecen deshabilitadas en esta fase MVP."
        tone="warning"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { k: 'ISSUED', l: 'Emitidas' },
            { k: 'RECEIVED', l: 'Recibidas' },
            { k: 'QUOTES', l: 'Presupuestos y Plantillas' },
            { k: 'CONTACTS', l: 'Clientes y Proveedores' },
          ].map((item) => (
            <button
              key={item.k}
              type="button"
              onClick={() => setTab(item.k as typeof tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                tab === item.k
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.l}
            </button>
          ))}
        </div>

        {tab !== 'CONTACTS' && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nº factura o tercero..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}
      </div>

      {tab === 'CONTACTS' ? (
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Razón social</th>
                  <th className="px-4 py-3 font-medium">NIF / CIF</th>
                  <th className="px-4 py-3 font-medium">Relación</th>
                  <th className="px-4 py-3 font-medium">Plazo pago</th>
                  <th className="px-4 py-3 font-medium">Cuenta PGC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 font-mono">{c.taxId}</td>
                    <td className="px-4 py-3">{c.kind === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{c.paymentTermDays} días</td>
                    <td className="px-4 py-3 font-mono">{c.defaultAccountCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : filteredInvoices.length === 0 ? (
        <EmptyState
          title="Sin registros en esta vista"
          description="Puedes crear un borrador de factura o presupuesto de demostración para verificar el cálculo de base, IVA y retención."
        />
      ) : (
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Número / Fecha</th>
                  <th className="px-4 py-3 font-medium">Tercero</th>
                  <th className="px-4 py-3 font-medium text-right">Base Imp.</th>
                  <th className="px-4 py-3 font-medium text-right">IVA</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Vista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {inv.invoiceNumber}
                      </div>
                      <div className="text-[11px] text-slate-500">{formatDateEs(inv.issueDate)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{inv.contactName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{inv.contactTaxId}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatEUR(inv.taxableBase)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatEUR(inv.vatAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {formatEUR(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel
                        text={
                          inv.status === 'PAID'
                            ? 'Pagada / Cobrada'
                            : inv.status === 'OVERDUE'
                            ? 'Vencida'
                            : inv.status === 'DRAFT'
                            ? 'Borrador Demo'
                            : 'Validada'
                        }
                        tone={
                          inv.status === 'PAID'
                            ? 'success'
                            : inv.status === 'OVERDUE'
                            ? 'danger'
                            : inv.status === 'DRAFT'
                            ? 'neutral'
                            : 'info'
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPreviewInvoice(inv)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Ver PDF Demo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Invoice PDF Preview Drawer */}
      <SlideDrawer
        open={Boolean(previewInvoice)}
        onClose={() => setPreviewInvoice(null)}
        title={`Vista previa · ${previewInvoice?.invoiceNumber ?? ''}`}
        subtitle="DOCUMENTO DE DEMOSTRACIÓN — NO VÁLIDO PARA FACTURACIÓN REAL"
      >
        {previewInvoice && (
          <div className="space-y-5 text-xs">
            <LegalNoticeBanner text="DOCUMENTO DE DEMOSTRACIÓN — NO VÁLIDO PARA FACTURACIÓN REAL" />
            <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <div className="font-display text-base font-bold">{previewInvoice.invoiceNumber}</div>
                  <div className="text-slate-500">Emisión: {formatDateEs(previewInvoice.issueDate)} · Vto: {formatDateEs(previewInvoice.dueDate)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{previewInvoice.contactName}</div>
                  <div className="font-mono text-slate-500">{previewInvoice.contactTaxId}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {previewInvoice.lines.map((l) => (
                  <div key={l.id} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <div className="font-medium">{l.description}</div>
                      <div className="text-[11px] text-slate-500">
                        {l.quantity} x {formatEUR(l.unitPrice)} · IVA {l.vatRate}% {l.withholdingRate > 0 ? `· IRPF -${l.withholdingRate}%` : ''}
                      </div>
                    </div>
                    <div className="font-mono font-semibold">{formatEUR(l.lineSubtotal)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>Base imponible</span>
                  <span>{formatEUR(previewInvoice.taxableBase)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA</span>
                  <span>{formatEUR(previewInvoice.vatAmount)}</span>
                </div>
                {previewInvoice.withholdingAmount > 0 && (
                  <div className="flex justify-between text-amber-700 dark:text-amber-400">
                    <span>Retención IRPF</span>
                    <span>-{formatEUR(previewInvoice.withholdingAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-800">
                  <span>Total factura</span>
                  <span>{formatEUR(previewInvoice.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <Lock className="h-3.5 w-3.5" /> Emisión oficial VERI*FACTU deshabilitada
              </span>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium dark:border-slate-700 dark:bg-slate-800"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir borrador
              </button>
            </div>
          </div>
        )}
      </SlideDrawer>

      {/* Create Draft Invoice Modal */}
      <ModalDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo borrador de factura / presupuesto">
        <form onSubmit={handleSaveDraft} className="space-y-4 text-xs">
          <LegalNoticeBanner text="DOCUMENTO DE DEMOSTRACIÓN — NO VÁLIDO PARA FACTURACIÓN REAL" />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Dirección</span>
              <select
                value={draftDirection}
                onChange={(e) => setDraftDirection(e.target.value as 'ISSUED' | 'RECEIVED')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="ISSUED">Factura emitida (Venta)</option>
                <option value="RECEIVED">Factura recibida (Gasto)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Tipo</span>
              <select
                value={draftKind}
                onChange={(e) => setDraftKind(e.target.value as 'INVOICE' | 'QUOTE' | 'CREDIT_NOTE')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="INVOICE">Factura borrador</option>
                <option value="QUOTE">Presupuesto</option>
                <option value="CREDIT_NOTE">Rectificativa</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Cliente / Proveedor</span>
              <input
                type="text"
                required
                value={draftContactName}
                onChange={(e) => setDraftContactName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">NIF / CIF (Demo)</span>
              <input
                type="text"
                required
                value={draftContactTaxId}
                onChange={(e) => setDraftContactTaxId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-slate-600 dark:text-slate-400">Concepto</span>
            <input
              type="text"
              required
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <div className="grid grid-cols-5 gap-2">
            <label className="block">
              <span>Cant.</span>
              <input type="number" step="1" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span>Precio (€)</span>
              <input type="number" step="0.01" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span>Dto (%)</span>
              <input type="number" step="1" value={draftDiscount} onChange={(e) => setDraftDiscount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span>IVA (%)</span>
              <select value={draftVat} onChange={(e) => setDraftVat(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                <option value="21">21%</option>
                <option value="10">10%</option>
                <option value="4">4%</option>
                <option value="0">0%</option>
              </select>
            </label>
            <label className="block">
              <span>IRPF (%)</span>
              <select value={draftIrpf} onChange={(e) => setDraftIrpf(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                <option value="0">0%</option>
                <option value="15">15%</option>
                <option value="19">19%</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="font-mono">
              Base: {formatEUR(calcSub)} · IVA: {formatEUR(calcVat)} · Total:{' '}
              <strong>{formatEUR(calcTotal)}</strong>
            </div>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white dark:bg-teal-600">
              Guardar borrador
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
