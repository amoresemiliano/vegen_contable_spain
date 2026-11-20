import React, { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Send, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import {
  buildScenarioProjections,
  computeSavingsCapacity,
  computeSeparatedNetWorth,
} from '../../domain/planning';
import { canViewClientPersonalData } from '../../domain/rbac';
import { computeTreasuryMetrics } from '../../domain/treasury';
import { ENTITY_TYPE_LABELS, formatDateEs, formatEUR, round2 } from '../../domain/formatters';
import {
  EmptyState,
  LegalNoticeBanner,
  MetricCard,
  PageHeader,
  Panel,
  StatusLabel,
} from '../../components/ui/Surface';
import { ScenarioComparisonChart } from '../../components/ui/Charts';
import { FinancialPlan } from '../../types/domain';

interface AdvisoryWorkspaceProps {
  activeSection:
    | 'panel'
    | 'clientes'
    | 'diagnostico'
    | 'patrimonio'
    | 'presupuestos'
    | 'planes'
    | 'escenarios'
    | 'inversiones'
    | 'seguimiento'
    | 'informes'
    | 'client_plan';
  clientIdFilter?: string;
  onNavigate?: (section: string) => void;
}

export const AdvisoryWorkspace: React.FC<AdvisoryWorkspaceProps> = ({
  activeSection,
  clientIdFilter,
  onNavigate,
}) => {
  const {
    state,
    accessibleClients,
    can,
    setSelectedClientId,
    updateOrCreateFinancialPlan,
    publishFinancialPlan,
  } = useAppStore();

  const targetClientId = clientIdFilter || state.selectedClientId || accessibleClients[0]?.id;
  const client = state.clientProfiles.find((c) => c.id === targetClientId);
  const canViewPersonal = canViewClientPersonalData(state, targetClientId);

  const clientProfile = state.financialProfiles.find((fp) => fp.clientId === targetClientId);
  const clientPlan = state.financialPlans.find((p) => p.clientId === targetClientId);

  const treasuryMetrics = useMemo(
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

  const netWorth = useMemo(
    () => computeSeparatedNetWorth(targetClientId, state.financialAssets, state.financialLiabilities),
    [targetClientId, state.financialAssets, state.financialLiabilities]
  );

  // Interactive scenario assumptions state
  const [monthlyIncome, setMonthlyIncome] = useState<number>(
    clientProfile?.monthlyGrossIncome ?? 15000
  );
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(
    (clientProfile?.monthlyFixedExpenses ?? 8000) +
      (clientProfile?.monthlyVariableExpenses ?? 2000)
  );
  const [baseGrowthPct, setBaseGrowthPct] = useState<number>(3.5);
  const [baseReturnPct, setBaseReturnPct] = useState<number>(3.5);
  const [planNotes, setPlanNotes] = useState<string>(
    clientPlan?.executiveNotes ??
      'Plan financiero orientativo basado en capacidad de ahorro neta y reserva de liquidez.'
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Sync inputs when switching client
  React.useEffect(() => {
    if (clientProfile) {
      setMonthlyIncome(clientProfile.monthlyGrossIncome);
      setMonthlyExpenses(
        round2(clientProfile.monthlyFixedExpenses + clientProfile.monthlyVariableExpenses)
      );
    }
    if (clientPlan) {
      setPlanNotes(clientPlan.executiveNotes);
    }
    setSavedNotice(null);
  }, [targetClientId, clientProfile?.id, clientPlan?.id]);

  const liveMonthlySavings = round2(Math.max(0, monthlyIncome - monthlyExpenses));
  const baselineLiq = Math.max(0, treasuryMetrics.availableLiquidity);
  const liveScenarios = useMemo(
    () =>
      buildScenarioProjections(baselineLiq, liveMonthlySavings, {
        BASE: {
          incomeGrowth: baseGrowthPct / 100,
          inflation: 0.025,
          returnRate: baseReturnPct / 100,
        },
      }),
    [baselineLiq, liveMonthlySavings, baseGrowthPct, baseReturnPct]
  );

  const handleSaveAndOptionallyPublish = (publishNow: boolean) => {
    const planObj: FinancialPlan = clientPlan
      ? {
          ...clientPlan,
          baselineLiquidity: baselineLiq,
          baselineMonthlySavingsCapacity: liveMonthlySavings,
          executiveNotes: planNotes,
          scenarios: liveScenarios,
          status: publishNow ? 'PUBLISHED' : clientPlan.status,
          publishedAt: publishNow ? new Date().toISOString().slice(0, 10) : clientPlan.publishedAt,
        }
      : {
          id: `plan-${targetClientId}-${Date.now()}`,
          clientId: targetClientId,
          scope: client?.entityType === 'INDIVIDUAL' ? 'PERSONAL' : 'BUSINESS',
          title: `Plan Financiero ${client?.displayName ?? ''}`,
          advisorId: 'u-advisor',
          advisorName: 'Mateo Roldán',
          status: publishNow ? 'PUBLISHED' : 'DRAFT',
          createdAt: new Date().toISOString().slice(0, 10),
          publishedAt: publishNow ? new Date().toISOString().slice(0, 10) : undefined,
          horizonMonths: 60,
          baselineLiquidity: baselineLiq,
          baselineMonthlySavingsCapacity: liveMonthlySavings,
          executiveNotes: planNotes,
          disclaimer:
            'Documento de planificación orientativa basado en hipótesis transparentes y datos de demostración. Las proyecciones no constituyen garantía de rentabilidad.',
          scenarios: liveScenarios,
          linkedGoalIds: state.financialGoals
            .filter((g) => g.clientId === targetClientId)
            .map((g) => g.id),
        };

    updateOrCreateFinancialPlan(planObj);
    if (publishNow) {
      publishFinancialPlan(planObj.id);
      setSavedNotice('Plan financiero guardado y publicado. Ya es visible en el Portal del Cliente.');
    } else {
      setSavedNotice('Borrador del plan y escenarios actualizados.');
    }
  };

  // CLIENT-FACING PUBLISHED PLAN VIEW
  if (activeSection === 'client_plan') {
    const published = state.financialPlans.filter(
      (p) => p.clientId === targetClientId && p.status === 'PUBLISHED'
    );
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mi Plan Financiero"
          subtitle="Planificación personalizada y escenarios orientativos publicados por tu asesor financiero."
        />
        {published.length === 0 ? (
          <EmptyState
            title="Aún no tienes un plan financiero publicado"
            description="Tu asesor está preparando tu diagnóstico y escenarios personalizados. Recibirás una notificación cuando esté disponible."
          />
        ) : (
          published.map((plan) => (
            <div key={plan.id} className="space-y-5">
              <LegalNoticeBanner text={plan.disclaimer} tone="info" />
              <Panel className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      Asesor responsable: {plan.advisorName} · Publicado el {formatDateEs(plan.publishedAt || plan.createdAt)}
                    </div>
                    <h2 className="mt-1 font-display text-lg font-semibold">{plan.title}</h2>
                  </div>
                  <StatusLabel text="Plan publicado" tone="success" />
                </div>

                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                  {plan.executiveNotes}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MetricCard
                    label="Liquidez inicial de partida"
                    value={formatEUR(plan.baselineLiquidity)}
                  />
                  <MetricCard
                    label="Capacidad de ahorro mensual"
                    value={formatEUR(plan.baselineMonthlySavingsCapacity)}
                    tone="accent"
                  />
                  <MetricCard
                    label="Horizonte analizado"
                    value={`${plan.horizonMonths} meses`}
                  />
                </div>

                <div className="pt-2">
                  <h3 className="mb-3 font-display text-sm font-semibold">
                    Comparativa de escenarios orientativos (12, 36 y 60 meses)
                  </h3>
                  <ScenarioComparisonChart
                    baselineLiquidity={plan.baselineLiquidity}
                    scenarios={plan.scenarios}
                  />
                </div>
              </Panel>
            </div>
          ))
        )}
      </div>
    );
  }

  // ADVISOR DASHBOARD
  if (activeSection === 'panel') {
    const atRiskGoals = state.financialGoals.filter(
      (g) => accessibleClients.some((c) => c.id === g.clientId) && g.status === 'AT_RISK'
    );
    const unpublishedPlans = state.financialPlans.filter(
      (p) => accessibleClients.some((c) => c.id === p.clientId) && p.status !== 'PUBLISHED'
    );

    return (
      <div className="space-y-6">
        <PageHeader
          title="Panel de Asesoramiento Financiero"
          subtitle="Seguimiento de liquidez de cartera, objetivos en riesgo, reuniones próximas y publicación de planes."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Clientes asesorados"
            value={String(accessibleClients.length)}
            detail="Empresas, autónomos y particulares"
            onClick={() => onNavigate?.('clientes')}
          />
          <MetricCard
            label="Objetivos que requieren atención"
            value={String(atRiskGoals.length)}
            detail="Desviación respecto a cuota objetivo"
            tone={atRiskGoals.length > 0 ? 'warning' : 'positive'}
            onClick={() => onNavigate?.('objetivos')}
          />
          <MetricCard
            label="Planes pendientes de publicar"
            value={String(unpublishedPlans.length)}
            detail="Listos para revisión o envío"
            tone="accent"
            onClick={() => onNavigate?.('planes')}
          />
          <MetricCard
            label="Próxima reunión"
            value={formatDateEs(clientProfile?.nextMeetingDate || '2026-11-28')}
            detail={client?.displayName}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel>
            <h2 className="mb-3 font-display text-base font-semibold">
              Alertas de liquidez y capacidad de ahorro
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {accessibleClients.map((cli) => {
                const tm = computeTreasuryMetrics(
                  cli.id,
                  state.bankAccounts,
                  state.bankTransactions,
                  state.invoices,
                  state.journalEntries,
                  state.chartOfAccounts
                );
                const fp = state.financialProfiles.find((f) => f.clientId === cli.id);
                const cap = fp ? computeSavingsCapacity(fp) : 0;
                return (
                  <div key={cli.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-semibold">{cli.displayName}</div>
                      <div className="text-slate-500">
                        Liquidez disp.: {formatEUR(tm.availableLiquidity)} · Ahorro est.: {formatEUR(cap)}/mes
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClientId(cli.id);
                        onNavigate?.('planes');
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 dark:border-slate-700"
                    >
                      Planificar
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-3 font-display text-base font-semibold">
              Planes financieros en cartera
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {state.financialPlans
                .filter((p) => accessibleClients.some((c) => c.id === p.clientId))
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0 pr-3">
                      <div className="font-semibold truncate">{p.title}</div>
                      <div className="text-slate-500">
                        Horizonte {p.horizonMonths} meses · {p.linkedGoalIds.length} objetivos vinculados
                      </div>
                    </div>
                    <StatusLabel
                      text={p.status === 'PUBLISHED' ? 'Publicado' : 'Borrador / Revisión'}
                      tone={p.status === 'PUBLISHED' ? 'success' : 'warning'}
                    />
                  </div>
                ))}
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
          title="Cartera de Clientes · Asesoramiento"
          subtitle="Selecciona un cliente autorizado para analizar su diagnóstico financiero, patrimonio o planificar escenarios."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accessibleClients.map((cli) => {
            const fp = state.financialProfiles.find((f) => f.clientId === cli.id);
            const personalAllowed = canViewClientPersonalData(state, cli.id);
            return (
              <Panel
                key={cli.id}
                className={cli.id === targetClientId ? 'border-teal-600 dark:border-teal-500' : ''}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-500">{cli.taxId}</div>
                    <h3 className="mt-1 font-display text-base font-semibold">{cli.displayName}</h3>
                    <div className="text-xs text-slate-500">
                      {ENTITY_TYPE_LABELS[cli.entityType]} · Riesgo: {fp?.riskTolerance ?? 'MODERATE'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientId(cli.id);
                      onNavigate?.('diagnostico');
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-teal-600"
                  >
                    Abrir perfil
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <span>Horizonte: {fp?.planningHorizonYears ?? 5} años</span>
                  <span>·</span>
                  <span>
                    Ámbito personal: {personalAllowed ? 'Autorizado (separado)' : 'Restringido por permisos'}
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeSection === 'patrimonio' || activeSection === 'inversiones') {
    const bizAssets = state.financialAssets.filter(
      (a) => a.clientId === targetClientId && a.scope === 'BUSINESS'
    );
    const bizLiab = state.financialLiabilities.filter(
      (l) => l.clientId === targetClientId && l.scope === 'BUSINESS'
    );
    const persAssets = state.financialAssets.filter(
      (a) => a.clientId === targetClientId && a.scope === 'PERSONAL'
    );
    const persLiab = state.financialLiabilities.filter(
      (l) => l.clientId === targetClientId && l.scope === 'PERSONAL'
    );

    return (
      <div className="space-y-6">
        <PageHeader
          title={`Patrimonio e Inversiones · ${client?.displayName ?? ''}`}
          subtitle="Separación jurídica y contable estricta entre activos/pasivos empresariales y personales."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Activos empresariales" value={formatEUR(netWorth.businessAssets)} />
          <MetricCard label="Pasivos empresariales" value={formatEUR(netWorth.businessLiabilities)} tone="danger" />
          <MetricCard
            label="Patrimonio neto personal"
            value={canViewPersonal ? formatEUR(netWorth.personalNetWorth) : 'Restringido'}
            detail={canViewPersonal ? 'Separado de la sociedad' : 'Sin permiso finance.personal.read'}
            tone={canViewPersonal ? 'accent' : 'neutral'}
          />
          <MetricCard
            label="Patrimonio neto empresarial"
            value={formatEUR(netWorth.businessNetWorth)}
            tone="positive"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel>
            <h2 className="mb-3 font-display text-base font-semibold">
              Bloque Empresarial ({client?.displayName})
            </h2>
            {bizAssets.length === 0 && bizLiab.length === 0 ? (
              <p className="text-xs text-slate-500">Sin activos empresariales (cliente particular).</p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="font-medium text-slate-500">Activos</div>
                {bizAssets.map((a) => (
                  <div key={a.id} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-[11px] text-slate-500">{a.notes}</div>
                    </div>
                    <div className="font-mono font-semibold">{formatEUR(a.currentValue)}</div>
                  </div>
                ))}
                <div className="pt-2 font-medium text-slate-500">Pasivos y Financiación</div>
                {bizLiab.map((l) => (
                  <div key={l.id} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[11px] text-slate-500">Cuota {formatEUR(l.monthlyPayment)}/mes · TAE {l.interestRateApr}%</div>
                    </div>
                    <div className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                      -{formatEUR(l.outstandingBalance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Bloque Personal (Separado)</h2>
              {!canViewPersonal && <Lock className="h-4 w-4 text-slate-400" />}
            </div>
            {!canViewPersonal ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Los datos financieros personales están protegidos y ocultos porque tu rol o asignación actual no tiene autorizado el acceso a información personal.
                </span>
              </div>
            ) : persAssets.length === 0 && persLiab.length === 0 ? (
              <p className="text-xs text-slate-500">
                No hay posiciones personales registradas directamente bajo este NIF.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="font-medium text-slate-500">Activos e Inversiones (Entrada Manual)</div>
                {persAssets.map((a) => (
                  <div key={a.id} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-[11px] text-slate-500">{a.notes}</div>
                    </div>
                    <div className="font-mono font-semibold">{formatEUR(a.currentValue)}</div>
                  </div>
                ))}
                {persLiab.map((l) => (
                  <div key={l.id} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[11px] text-slate-500">Cuota {formatEUR(l.monthlyPayment)}/mes · TAE {l.interestRateApr}%</div>
                    </div>
                    <div className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                      -{formatEUR(l.outstandingBalance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    );
  }

  if (activeSection === 'diagnostico') {
    const cap = clientProfile ? computeSavingsCapacity(clientProfile) : 0;
    const monthsRunway =
      clientProfile && (clientProfile.monthlyFixedExpenses + clientProfile.monthlyVariableExpenses) > 0
        ? treasuryMetrics.availableLiquidity /
          (clientProfile.monthlyFixedExpenses + clientProfile.monthlyVariableExpenses)
        : 0;
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Diagnóstico Financiero · ${client?.displayName ?? ''}`}
          subtitle="Radiografía de liquidez operativa, capacidad de ahorro, endeudamiento y horizonte financiero."
          actions={
            <button
              type="button"
              onClick={() => onNavigate?.('planes')}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white dark:bg-teal-600"
            >
              Ir al planificador de escenarios
            </button>
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Liquidez disponible" value={formatEUR(treasuryMetrics.availableLiquidity)} tone="accent" />
          <MetricCard label="Colchón operativo" value={`${monthsRunway.toFixed(1)} meses`} detail="Cobertura de gasto mensual" />
          <MetricCard label="Capacidad ahorro est." value={formatEUR(cap)} detail="Mensual antes de extraordinarios" tone="positive" />
          <MetricCard label="Tolerancia al riesgo" value={clientProfile?.riskTolerance ?? 'MODERATE'} detail={`Horizonte ${clientProfile?.planningHorizonYears ?? 5} años`} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel className="space-y-3 text-xs">
            <h2 className="font-display text-base font-semibold">Estructura de flujo mensual base</h2>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <span className="text-slate-500">Ingresos mensuales brutos estimados</span>
              <span className="font-mono font-semibold">{formatEUR(clientProfile?.monthlyGrossIncome ?? 0)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <span className="text-slate-500">Gastos fijos estructurales</span>
              <span className="font-mono">{formatEUR(clientProfile?.monthlyFixedExpenses ?? 0)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <span className="text-slate-500">Gastos variables recurrentes</span>
              <span className="font-mono">{formatEUR(clientProfile?.monthlyVariableExpenses ?? 0)}</span>
            </div>
            <div className="flex justify-between py-2 font-semibold text-teal-700 dark:text-teal-400">
              <span>Margen neto mensual disponible para metas</span>
              <span className="font-mono">{formatEUR(cap)}</span>
            </div>
          </Panel>
          <Panel className="space-y-3 text-xs">
            <h2 className="font-display text-base font-semibold">Observaciones del asesor y situación fiscal</h2>
            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
              {clientPlan?.executiveNotes ?? 'Diagnóstico inicial generado con datos contables y bancarios consolidados del ejercicio 2026.'}
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="font-medium">Separación de patrimonio</div>
              <div className="mt-1 text-slate-500">
                Patrimonio neto empresarial: <strong>{formatEUR(netWorth.businessNetWorth)}</strong> ·{' '}
                Personal: <strong>{canViewPersonal ? formatEUR(netWorth.personalNetWorth) : 'Restringido por RBAC'}</strong>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  if (activeSection === 'presupuestos') {
    const cap = clientProfile ? computeSavingsCapacity(clientProfile) : 0;
    const totalExp = (clientProfile?.monthlyFixedExpenses ?? 0) + (clientProfile?.monthlyVariableExpenses ?? 0);
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Presupuestos y Capacidad de Ahorro · ${client?.displayName ?? ''}`}
          subtitle="Desglose mensual de estructura fija, variable y margen asignable a objetivos y reservas."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Ingresos presupuestados" value={formatEUR(clientProfile?.monthlyGrossIncome ?? 0)} />
          <MetricCard label="Gasto mensual total" value={formatEUR(totalExp)} tone="warning" />
          <MetricCard label="Superávit / Ahorro meta" value={formatEUR(cap)} tone="positive" />
        </div>
        <Panel className="space-y-3 text-xs">
          <h2 className="font-display text-base font-semibold">Partidas presupuestarias mensuales orientativas</h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            <div className="flex justify-between py-2.5">
              <span>Estructura fija (nóminas, alquiler, suministros, seguros)</span>
              <span className="font-mono font-medium">{formatEUR(clientProfile?.monthlyFixedExpenses ?? 0)}</span>
            </div>
            <div className="flex justify-between py-2.5">
              <span>Operativa variable (marketing, software, desplazamientos)</span>
              <span className="font-mono font-medium">{formatEUR(clientProfile?.monthlyVariableExpenses ?? 0)}</span>
            </div>
            <div className="flex justify-between py-2.5">
              <span>Asignación mensual recomendada a objetivos activos</span>
              <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                {formatEUR(
                  state.financialGoals
                    .filter((g) => g.clientId === targetClientId)
                    .reduce((s, g) => s + g.monthlyContributionPlanned, 0)
                )}
              </span>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  if (activeSection === 'seguimiento' || activeSection === 'informes') {
    const clientGoals = state.financialGoals.filter((g) => g.clientId === targetClientId);
    return (
      <div className="space-y-6">
        <PageHeader
          title={
            activeSection === 'seguimiento'
              ? `Seguimiento y Revisiones · ${client?.displayName ?? ''}`
              : `Informes de Asesoramiento · ${client?.displayName ?? ''}`
          }
          subtitle="Control de hitos, actas de seguimiento y estado de planes publicados al cliente."
        />
        <LegalNoticeBanner
          text="INFORME ORIENTATIVO DE DEMOSTRACIÓN: Las proyecciones reflejan hipótesis explícitas y no garantizan rentabilidades futuras."
          tone="info"
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel className="space-y-3 text-xs">
            <h2 className="font-display text-base font-semibold">Estado de planes y revisiones</h2>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <span className="text-slate-500">Plan actual</span>
              <span className="font-medium">{clientPlan?.title ?? 'Sin plan creado'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <span className="text-slate-500">Estado de publicación</span>
              <StatusLabel
                text={clientPlan?.status === 'PUBLISHED' ? 'Publicado al cliente' : 'Borrador interno'}
                tone={clientPlan?.status === 'PUBLISHED' ? 'success' : 'warning'}
              />
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Próxima sesión de revisión</span>
              <span className="font-mono">{formatDateEs(clientProfile?.nextMeetingDate ?? '2026-11-28')}</span>
            </div>
          </Panel>
          <Panel className="space-y-3 text-xs">
            <h2 className="font-display text-base font-semibold">Resumen de cumplimiento de objetivos</h2>
            {clientGoals.map((g) => (
              <div key={g.id} className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                <span className="font-medium">{g.name}</span>
                <span className="font-mono">
                  {formatEUR(g.evidenceFundedAmount + g.manualFundedAmount)} / {formatEUR(g.targetAmount)}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    );
  }

  // Interactive Financial Plan Builder / Escenarios
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Planificador Financiero y Escenarios · ${client?.displayName ?? ''}`}
        subtitle="Define hipótesis transparentes de ahorro, compara 3 escenarios (Conservador, Base, Optimista) y publica al cliente."
        actions={
          can('finance.plans.publish') ? (
            <button
              type="button"
              onClick={() => handleSaveAndOptionallyPublish(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
            >
              <Send className="h-4 w-4" />
              <span>Publicar plan al cliente</span>
            </button>
          ) : undefined
        }
      />

      <LegalNoticeBanner
        text="PLANIFICACIÓN ORIENTATIVA: Las hipótesis no constituyen resultados garantizados ni asesoramiento automatizado de valores negociables."
        tone="info"
      />

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Transparent Baseline & Assumptions */}
        <Panel className="space-y-4">
          <h2 className="font-display text-base font-semibold">1. Línea base y capacidad de ahorro</h2>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <span>Liquidez disponible actual</span>
              <strong className="font-mono">{formatEUR(baselineLiq)}</strong>
            </div>

            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Ingresos mensuales estimados (€)</span>
              <input
                type="number"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Gastos mensuales totales (€)</span>
              <input
                type="number"
                value={monthlyExpenses}
                onChange={(e) => setMonthlyExpenses(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <div className="flex justify-between rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800 dark:bg-teal-950/30">
              <span>Capacidad de ahorro mensual</span>
              <strong className="font-mono text-teal-700 dark:text-teal-400">
                {formatEUR(liveMonthlySavings)} / mes
              </strong>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-slate-600 dark:text-slate-400">Crec. ingresos Base (%)</span>
                <input
                  type="number"
                  step="0.5"
                  value={baseGrowthPct}
                  onChange={(e) => setBaseGrowthPct(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="block">
                <span className="text-slate-600 dark:text-slate-400">Rentabilidad Base (%)</span>
                <input
                  type="number"
                  step="0.5"
                  value={baseReturnPct}
                  onChange={(e) => setBaseReturnPct(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-slate-600 dark:text-slate-400">Notas explicativas del asesor</span>
              <textarea
                rows={3}
                value={planNotes}
                onChange={(e) => setPlanNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            {can('finance.plans.create') && (
              <button
                type="button"
                onClick={() => handleSaveAndOptionallyPublish(false)}
                className="w-full rounded-lg border border-slate-300 py-2 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Guardar borrador
              </button>
            )}
          </div>
        </Panel>

        {/* Right: 3 Scenarios Chart & Table */}
        <Panel className="space-y-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">
              2. Comparativa de escenarios (Conservador, Base, Optimista)
            </h2>
            <StatusLabel
              text={clientPlan?.status === 'PUBLISHED' ? 'Publicado al cliente' : 'En preparación'}
              tone={clientPlan?.status === 'PUBLISHED' ? 'success' : 'warning'}
            />
          </div>

          <ScenarioComparisonChart
            baselineLiquidity={baselineLiq}
            scenarios={liveScenarios}
          />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <th className="py-2 font-medium">Escenario</th>
                  <th className="py-2 font-medium text-right">Ahorro/mes</th>
                  <th className="py-2 font-medium text-right">12 meses</th>
                  <th className="py-2 font-medium text-right">36 meses</th>
                  <th className="py-2 font-medium text-right">60 meses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {liveScenarios.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5">
                      <div className="font-semibold">{s.label}</div>
                      <div className="text-[11px] text-slate-500">{s.assumptionsSummary}</div>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatEUR(s.monthlySavingsCapacity)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatEUR(s.projected12mBalance)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{formatEUR(s.projected36mBalance)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums">{formatEUR(s.projected60mBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};
