import React, { useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { computeGoalProgress } from '../../domain/planning';
import { canViewClientPersonalData } from '../../domain/rbac';
import { formatDateEs, formatEUR } from '../../domain/formatters';
import {
  EmptyState,
  ModalDialog,
  PageHeader,
  Panel,
  StatusLabel,
} from '../../components/ui/Surface';
import { GoalProgressBar } from '../../components/ui/Charts';
import { FinancialGoal } from '../../types/domain';

interface GoalsViewProps {
  clientIdFilter?: string;
}

export const GoalsView: React.FC<GoalsViewProps> = ({ clientIdFilter }) => {
  const { state, accessibleClients, can, addGoalContribution, createGoal } = useAppStore();
  const targetClientId = clientIdFilter || state.selectedClientId || accessibleClients[0]?.id;
  const canViewPersonal = canViewClientPersonalData(state, targetClientId);

  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'BUSINESS' | 'PERSONAL'>('ALL');
  const [contribGoal, setContribGoal] = useState<FinancialGoal | null>(null);
  const [contribAmt, setContribAmt] = useState('500');
  const [contribSource, setContribSource] = useState<'EVIDENCE_BANK_ACCOUNT' | 'MANUAL_ENTRY'>('EVIDENCE_BANK_ACCOUNT');
  const [contribNote, setContribNote] = useState('Aportación mensual planificada');

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('Fondo de reserva ampliación equipo');
  const [newTarget, setNewTarget] = useState('15000');
  const [newMonthly, setNewMonthly] = useState('750');
  const [newDate, setNewDate] = useState('2027-12-31');
  const [newScope, setNewScope] = useState<'BUSINESS' | 'PERSONAL'>('BUSINESS');
  const [newCategory, setNewCategory] = useState<FinancialGoal['category']>('SAVINGS');

  const goals = useMemo(() => {
    return state.financialGoals
      .filter((g) => g.clientId === targetClientId)
      .filter((g) => (g.scope === 'PERSONAL' ? canViewPersonal : true))
      .filter((g) => (scopeFilter === 'ALL' ? true : g.scope === scopeFilter));
  }, [state.financialGoals, targetClientId, canViewPersonal, scopeFilter]);

  const canManage = can('finance.goals.manage');
  const canPropose = can('finance.goals.propose');

  const handleAddContribution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribGoal) return;
    const amt = Number.parseFloat(contribAmt.replace(',', '.')) || 0;
    if (amt <= 0) return;
    addGoalContribution(contribGoal.id, amt, contribSource, contribNote);
    setContribGoal(null);
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmt = Number.parseFloat(newTarget.replace(',', '.')) || 10000;
    const monthlyAmt = Number.parseFloat(newMonthly.replace(',', '.')) || 500;
    createGoal({
      clientId: targetClientId,
      scope: newScope,
      name: newName,
      category: newCategory,
      targetAmount: targetAmt,
      evidenceFundedAmount: 0,
      manualFundedAmount: 0,
      startDate: '2026-11-20',
      targetDate: newDate,
      priority: 'MEDIUM',
      monthlyContributionPlanned: monthlyAmt,
      responsibleAdvisorId: 'u-advisor',
      status: canManage ? 'ACTIVE' : 'PROPOSED_BY_CLIENT',
      notes: canManage ? 'Creado por asesor financiero.' : 'Propuesto por el cliente; pendiente de revisión del asesor.',
    });
    setNewOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Objetivos Financieros y Seguimiento"
        subtitle="Progreso calculado mediante aportaciones respaldadas por evidencia bancaria separadas de registros manuales."
        actions={
          (canManage || canPropose) ? (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <Plus className="h-4 w-4" />
              <span>{canManage ? 'Nuevo objetivo' : 'Proponer objetivo'}</span>
            </button>
          ) : undefined
        }
      />

      {canViewPersonal && (
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 w-fit">
          {[
            { k: 'ALL', l: 'Todos' },
            { k: 'BUSINESS', l: 'Empresariales' },
            { k: 'PERSONAL', l: 'Personales' },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setScopeFilter(t.k as typeof scopeFilter)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                scopeFilter === t.k
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState
          title="Sin objetivos configurados en este ámbito"
          description="Crea o propón un objetivo financiero para empezar a medir el progreso con evidencia."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {goals.map((goal) => {
            const prog = computeGoalProgress(goal);
            return (
              <Panel key={goal.id} className="flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {goal.scope === 'BUSINESS' ? 'Ámbito Empresarial' : 'Ámbito Personal'} · Meta {formatDateEs(goal.targetDate)}
                      </div>
                      <h3 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        {goal.name}
                      </h3>
                    </div>
                    <StatusLabel
                      text={
                        goal.status === 'COMPLETED'
                          ? 'Completado'
                          : goal.status === 'AT_RISK'
                          ? 'Requiere atención'
                          : goal.status === 'PROPOSED_BY_CLIENT'
                          ? 'Propuesto'
                          : 'En curso'
                      }
                      tone={
                        goal.status === 'COMPLETED'
                          ? 'success'
                          : goal.status === 'AT_RISK'
                          ? 'danger'
                          : goal.status === 'PROPOSED_BY_CLIENT'
                          ? 'warning'
                          : 'info'
                      }
                    />
                  </div>

                  <div className="mt-4">
                    <GoalProgressBar
                      evidencePercent={prog.evidencePercent}
                      manualPercent={prog.manualPercent}
                      totalPercent={prog.progressPercent}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500">Evidencia bancaria</div>
                      <div className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                        {formatEUR(prog.evidenceFunded)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Aporte manual</div>
                      <div className="font-mono font-semibold text-amber-700 dark:text-amber-400">
                        {formatEUR(prog.manualFunded)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Objetivo total</div>
                      <div className="font-mono font-semibold">{formatEUR(prog.targetAmount)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">
                    Cuota mensual: <strong className="font-mono">{formatEUR(goal.monthlyContributionPlanned)}</strong>
                    {prog.projectedMonthsToTarget !== null && prog.projectedMonthsToTarget > 0
                      ? ` · ~${prog.projectedMonthsToTarget} meses restantes`
                      : ''}
                  </span>
                  {(canManage || canPropose) && goal.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setContribGoal(goal);
                        setContribSource(canManage ? 'EVIDENCE_BANK_ACCOUNT' : 'MANUAL_ENTRY');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Target className="h-3.5 w-3.5 text-teal-600" />
                      <span>Registrar aportación</span>
                    </button>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Contribution Modal */}
      <ModalDialog
        open={Boolean(contribGoal)}
        onClose={() => setContribGoal(null)}
        title={`Registrar aportación · ${contribGoal?.name ?? ''}`}
      >
        <form onSubmit={handleAddContribution} className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-400">
            El porcentaje de progreso nunca se edita manualmente: solo avanza mediante aportaciones vinculadas a evidencia bancaria o entradas manuales auditadas.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span>Importe (€)</span>
              <input
                type="number"
                step="0.01"
                required
                value={contribAmt}
                onChange={(e) => setContribAmt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span>Tipo de atribución</span>
              <select
                value={contribSource}
                onChange={(e) => setContribSource(e.target.value as typeof contribSource)}
                disabled={!canManage}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
              >
                <option value="EVIDENCE_BANK_ACCOUNT">Evidencia bancaria verificada</option>
                <option value="MANUAL_ENTRY">Aportación manual declarada</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span>Nota justificativa</span>
            <input
              type="text"
              required
              value={contribNote}
              onChange={(e) => setContribNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setContribGoal(null)} className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-700">
              Registrar aportación
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Create Goal Modal */}
      <ModalDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={canManage ? 'Crear objetivo financiero' : 'Proponer objetivo al asesor'}
      >
        <form onSubmit={handleCreateGoal} className="space-y-4 text-xs">
          <label className="block">
            <span>Nombre del objetivo</span>
            <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span>Ámbito</span>
              <select value={newScope} onChange={(e) => setNewScope(e.target.value as 'BUSINESS' | 'PERSONAL')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <option value="BUSINESS">Empresarial</option>
                {canViewPersonal && <option value="PERSONAL">Personal</option>}
              </select>
            </label>
            <label className="block">
              <span>Categoría</span>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as FinancialGoal['category'])} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <option value="EMERGENCY_FUND">Fondo de emergencia</option>
                <option value="EQUIPMENT">Equipamiento / Inversión</option>
                <option value="EXPANSION">Expansión negocio</option>
                <option value="DEBT_REDUCTION">Reducción de deuda</option>
                <option value="HOME_PURCHASE">Compra de vivienda</option>
                <option value="EDUCATION">Educación</option>
                <option value="RETIREMENT">Jubilación</option>
                <option value="SAVINGS">Ahorro general</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span>Importe meta (€)</span>
              <input type="number" required value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span>Aporte mensual (€)</span>
              <input type="number" required value={newMonthly} onChange={(e) => setNewMonthly(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span>Fecha objetivo</span>
              <input type="date" required value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setNewOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white dark:bg-teal-600">
              {canManage ? 'Crear objetivo' : 'Enviar propuesta'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
