import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  FileText,
  Target,
  Upload,
} from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { computeTreasuryMetrics } from '../../domain/treasury';
import { getClientEstimatedTaxLiability } from '../../domain/tax';
import { computeGoalProgress } from '../../domain/planning';
import { ENTITY_TYPE_LABELS, formatDateEs, formatEUR } from '../../domain/formatters';
import {
  MetricCard,
  PageHeader,
  Panel,
  StatusLabel,
} from '../../components/ui/Surface';
import { GoalProgressBar } from '../../components/ui/Charts';
import { DocumentUploadModal } from '../documents/DocumentUploadModal';
import { ClientEntityType, DocumentStatus } from '../../types/domain';

interface ClientPortalHomeProps {
  onNavigate: (route: string) => void;
}

export const ClientPortalHome: React.FC<ClientPortalHomeProps> = ({ onNavigate }) => {
  const { state, accessibleClients, can, markNotificationsRead } = useAppStore();
  const client =
    accessibleClients.find((c) => c.id === state.selectedClientId) ?? accessibleClients[0];
  const [uploadOpen, setUploadOpen] = useState(false);

  const metrics = useMemo(() => {
    if (!client) return null;
    return computeTreasuryMetrics(
      client.id,
      state.bankAccounts,
      state.bankTransactions,
      state.invoices,
      state.journalEntries,
      state.chartOfAccounts
    );
  }, [
    client,
    state.bankAccounts,
    state.bankTransactions,
    state.invoices,
    state.journalEntries,
    state.chartOfAccounts,
  ]);

  if (!client || !metrics) return null;

  const isIndividual = client.entityType === ClientEntityType.INDIVIDUAL;
  const estTaxes = getClientEstimatedTaxLiability(state.taxDeclarations, client.id);
  const clientDocsPending = state.documents.filter(
    (d) => d.clientId === client.id && (d.status === DocumentStatus.NEEDS_REVIEW || d.status === DocumentStatus.EXTRACTED)
  );
  const openTasks = state.tasks.filter((t) => t.clientId === client.id && t.status === 'OPEN');
  const openInvoices = state.invoices.filter(
    (i) => i.clientId === client.id && i.direction === 'ISSUED' && i.status !== 'PAID'
  );
  const clientGoals = state.financialGoals.filter((g) => g.clientId === client.id);
  const avgGoalProgress =
    clientGoals.length > 0
      ? clientGoals.reduce((s, g) => s + computeGoalProgress(g).progressPercent, 0) /
        clientGoals.length
      : 0;
  const publishedPlans = state.financialPlans.filter(
    (p) => p.clientId === client.id && p.status === 'PUBLISHED'
  );
  const notifications = state.notifications.filter((n) => n.clientId === client.id && !n.read);
  const recentTx = state.bankTransactions
    .filter((t) => t.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Mobile-first Hero CTA */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
            {ENTITY_TYPE_LABELS[client.entityType]} · {client.taxId}
          </div>
          <h1 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">
            Hola, {client.displayName}
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Resumen vivo de tu liquidez, documentos pendientes, impuestos estimados y metas financieras.
          </p>
        </div>

        {can('documents.upload') && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 active:scale-[0.99] whitespace-nowrap shrink-0"
          >
            <Camera className="h-5 w-5" />
            <span>Subir documento</span>
          </button>
        )}
      </div>

      {/* Unread Notifications Strip */}
      {notifications.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-sky-950 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
            <div>
              <strong>{notifications[0].title}:</strong> {notifications[0].detail}
            </div>
          </div>
          <button
            type="button"
            onClick={markNotificationsRead}
            className="self-start text-xs font-medium text-sky-800 underline sm:self-center dark:text-sky-300"
          >
            Marcar avisos como leídos ({notifications.length})
          </button>
        </div>
      )}

      {/* 8 Primary Metric Cards distinguishing Liquidity, Cash, Profit & Tax */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Liquidez disponible"
          value={formatEUR(metrics.availableLiquidity)}
          detail="Saldo libre inmediato"
          tone="accent"
          onClick={() => (can('treasury.read') ? onNavigate('bancos') : undefined)}
        />
        <MetricCard
          label="Cobros esperados"
          value={formatEUR(metrics.expectedCashInflows)}
          detail={`${openInvoices.length} factura(s) pendientes`}
          tone="positive"
        />
        <MetricCard
          label="Pagos próximos"
          value={formatEUR(metrics.upcomingPayables)}
          detail="Proveedores por vencer"
          tone="warning"
        />
        {!isIndividual ? (
          <MetricCard
            label="Impuestos estimados (Borrador)"
            value={formatEUR(estTaxes)}
            detail="Previsión 4T sin validez oficial"
            tone={estTaxes > 0 ? 'warning' : 'neutral'}
            onClick={() => (can('tax.drafts.generate') ? onNavigate('impuestos') : undefined)}
          />
        ) : (
          <MetricCard
            label="Saldo restringido"
            value={formatEUR(metrics.restrictedCash)}
            detail="Reservas asignadas"
          />
        )}
        {!isIndividual && (
          <MetricCard
            label="Resultado contable (Beneficio)"
            value={formatEUR(metrics.accountingProfit)}
            detail="Criterio devengo PGC (≠ Caja)"
            onClick={() => (can('accounting.entries.read') ? onNavigate('contabilidad') : undefined)}
          />
        )}
        <MetricCard
          label="Flujo neto de caja"
          value={formatEUR(metrics.netCashFlowPeriod)}
          detail="Entradas menos salidas"
        />
        <MetricCard
          label="Docs / Solicitudes pendientes"
          value={String(clientDocsPending.length + openTasks.length)}
          detail={`${openTasks.length} solicitud(es) del asesor`}
          tone={openTasks.length > 0 ? 'danger' : 'neutral'}
          onClick={() => onNavigate('mensajes')}
        />
        <MetricCard
          label="Cumplimiento de objetivos"
          value={`${avgGoalProgress.toFixed(0)}%`}
          detail={`${clientGoals.length} objetivo(s) activos`}
          tone="positive"
          onClick={() => onNavigate('objetivos')}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pending Requests from Accountant / Advisor */}
        <Panel className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Acciones y solicitudes pendientes</h2>
            <button
              type="button"
              onClick={() => onNavigate('mensajes')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Ver todo
            </button>
          </div>
          {openTasks.length === 0 && clientDocsPending.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Estás al día: no hay solicitudes documentales abiertas.</span>
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              {openTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-slate-500">
                      {t.createdByName} · Vence {formatDateEs(t.dueDate)}
                    </div>
                  </div>
                  {can('documents.upload') && (
                    <button
                      type="button"
                      onClick={() => setUploadOpen(true)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white dark:bg-teal-600 shrink-0"
                    >
                      <Upload className="h-3.5 w-3.5" /> Subir ahora
                    </button>
                  )}
                </div>
              ))}
              {clientDocsPending.slice(0, 3).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate font-medium">{d.fileName}</span>
                  </div>
                  <StatusLabel text="En revisión gestoría" tone="warning" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Financial Goals & Published Plan */}
        <Panel className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Objetivos y Plan Financiero</h2>
            <button
              type="button"
              onClick={() => onNavigate('objetivos')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Ver objetivos
            </button>
          </div>
          <div className="space-y-4">
            {clientGoals.slice(0, 3).map((g) => {
              const p = computeGoalProgress(g);
              return (
                <div key={g.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Target className="h-3.5 w-3.5 text-teal-600" />
                      {g.name}
                    </span>
                    <span className="font-mono text-slate-500">
                      {formatEUR(p.totalFunded)} / {formatEUR(p.targetAmount)}
                    </span>
                  </div>
                  <GoalProgressBar
                    evidencePercent={p.evidencePercent}
                    manualPercent={p.manualPercent}
                    totalPercent={p.progressPercent}
                  />
                </div>
              );
            })}
          </div>
          {publishedPlans.length > 0 && can('finance.profile.read') && (
            <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/40 p-3.5 text-xs dark:border-teal-800 dark:bg-teal-950/30">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {publishedPlans[0].title}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Ahorro estimado: {formatEUR(publishedPlans[0].baselineMonthlySavingsCapacity)}/mes
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('plan')}
                className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400 shrink-0"
              >
                Abrir <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </Panel>
      </div>

      {/* Recent Financial Activity */}
      {can('treasury.read') && (
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Actividad bancaria reciente</h2>
            <button
              type="button"
              onClick={() => onNavigate('bancos')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
            >
              Ver tesorería
            </button>
          </div>
          <div className="divide-y divide-slate-200 text-xs dark:divide-slate-800">
            {recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{tx.description}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatDateEs(tx.date)} · {tx.counterparty}
                  </div>
                </div>
                <div
                  className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
                    tx.amount >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {formatEUR(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <DocumentUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        clientId={client.id}
      />
    </div>
  );
};

export const ClientProfileSettingsView: React.FC = () => {
  const { state, activePersona, activeRole, accessibleClients } = useAppStore();
  const client =
    accessibleClients.find((c) => c.id === state.selectedClientId) ?? accessibleClients[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil y Configuración"
        subtitle="Información de la entidad demo, permisos activos de tu sesión y preferencias."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel className="space-y-3 text-xs">
          <h2 className="font-display text-base font-semibold">Datos de la entidad (Demo)</h2>
          <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <span className="text-slate-500">Denominación</span>
            <span className="font-medium">{client?.legalName}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <span className="text-slate-500">Identificación fiscal</span>
            <span className="font-mono">{client?.taxId}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <span className="text-slate-500">Tipo</span>
            <span>{client ? ENTITY_TYPE_LABELS[client.entityType] : '—'}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-500">Actividad CNAE</span>
            <span>{client?.cnaeCode} — {client?.cnaeDescription}</span>
          </div>
        </Panel>

        <Panel className="space-y-3 text-xs">
          <h2 className="font-display text-base font-semibold">Sesión y permisos RBAC activos</h2>
          <div className="text-slate-600 dark:text-slate-400">
            Persona activa: <strong>{activePersona.label}</strong> · Rol: <strong>{activeRole?.name}</strong>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {activeRole?.permissions.map((p) => (
              <span
                key={p}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-800"
              >
                {p}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};
