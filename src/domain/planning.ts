import {
  FinancialAsset,
  FinancialGoal,
  FinancialLiability,
  FinancialProfile,
  FinancialScenario,
  ScenarioType,
} from '../types/domain';
import { round2 } from './formatters';

export interface GoalProgressBreakdown {
  totalFunded: number;
  evidenceFunded: number;
  manualFunded: number;
  targetAmount: number;
  progressPercent: number;
  evidencePercent: number;
  manualPercent: number;
  remainingAmount: number;
  projectedMonthsToTarget: number | null;
}

/**
 * Computes goal progress distinguishing evidence-based funding from manually entered funding.
 */
export function computeGoalProgress(goal: FinancialGoal): GoalProgressBreakdown {
  const evidenceFunded = Math.max(0, round2(goal.evidenceFundedAmount));
  const manualFunded = Math.max(0, round2(goal.manualFundedAmount));
  const totalFunded = round2(evidenceFunded + manualFunded);
  const targetAmount = Math.max(1, round2(goal.targetAmount));

  const progressPercent = Math.min(100, round2((totalFunded / targetAmount) * 100));
  const evidencePercent = Math.min(100, round2((evidenceFunded / targetAmount) * 100));
  const manualPercent = Math.min(100 - evidencePercent, round2((manualFunded / targetAmount) * 100));
  const remainingAmount = Math.max(0, round2(targetAmount - totalFunded));

  const projectedMonthsToTarget =
    remainingAmount === 0
      ? 0
      : goal.monthlyContributionPlanned > 0
      ? Math.ceil(remainingAmount / goal.monthlyContributionPlanned)
      : null;

  return {
    totalFunded,
    evidenceFunded,
    manualFunded,
    targetAmount,
    progressPercent,
    evidencePercent,
    manualPercent,
    remainingAmount,
    projectedMonthsToTarget,
  };
}

export interface NetWorthSummary {
  businessAssets: number;
  businessLiabilities: number;
  businessNetWorth: number;
  personalAssets: number;
  personalLiabilities: number;
  personalNetWorth: number;
}

export function computeSeparatedNetWorth(
  clientId: string,
  assets: FinancialAsset[],
  liabilities: FinancialLiability[]
): NetWorthSummary {
  const clientAssets = assets.filter((a) => a.clientId === clientId);
  const clientLiabilities = liabilities.filter((l) => l.clientId === clientId);

  const businessAssets = round2(
    clientAssets.filter((a) => a.scope === 'BUSINESS').reduce((s, a) => s + a.currentValue, 0)
  );
  const businessLiabilities = round2(
    clientLiabilities.filter((l) => l.scope === 'BUSINESS').reduce((s, l) => s + l.outstandingBalance, 0)
  );
  const personalAssets = round2(
    clientAssets.filter((a) => a.scope === 'PERSONAL').reduce((s, a) => s + a.currentValue, 0)
  );
  const personalLiabilities = round2(
    clientLiabilities.filter((l) => l.scope === 'PERSONAL').reduce((s, l) => s + l.outstandingBalance, 0)
  );

  return {
    businessAssets,
    businessLiabilities,
    businessNetWorth: round2(businessAssets - businessLiabilities),
    personalAssets,
    personalLiabilities,
    personalNetWorth: round2(personalAssets - personalLiabilities),
  };
}

export function computeSavingsCapacity(profile: FinancialProfile): number {
  return round2(profile.monthlyGrossIncome - profile.monthlyFixedExpenses - profile.monthlyVariableExpenses);
}

/**
 * Generates three transparent financial scenarios (CONSERVATIVE, BASE, OPTIMISTIC)
 * without claiming guaranteed investment outcomes.
 */
export function buildScenarioProjections(
  baselineLiquidity: number,
  monthlySavingsCapacity: number,
  customRates?: Partial<Record<ScenarioType, { incomeGrowth: number; inflation: number; returnRate: number }>>
): FinancialScenario[] {
  const configs: {
    type: ScenarioType;
    label: string;
    incomeGrowth: number;
    inflation: number;
    returnRate: number;
    savingsFactor: number;
    summary: string;
  }[] = [
    {
      type: 'CONSERVATIVE',
      label: 'Conservador',
      incomeGrowth: customRates?.CONSERVATIVE?.incomeGrowth ?? 0.015,
      inflation: customRates?.CONSERVATIVE?.inflation ?? 0.032,
      returnRate: customRates?.CONSERVATIVE?.returnRate ?? 0.018,
      savingsFactor: 0.8,
      summary: 'Prioriza liquidez inmediata, menor crecimiento de ingresos e inflación prudente.',
    },
    {
      type: 'BASE',
      label: 'Base',
      incomeGrowth: customRates?.BASE?.incomeGrowth ?? 0.035,
      inflation: customRates?.BASE?.inflation ?? 0.025,
      returnRate: customRates?.BASE?.returnRate ?? 0.035,
      savingsFactor: 1.0,
      summary: 'Continuidad de ingresos actuales con disciplina de ahorro mensual constante.',
    },
    {
      type: 'OPTIMISTIC',
      label: 'Optimista',
      incomeGrowth: customRates?.OPTIMISTIC?.incomeGrowth ?? 0.065,
      inflation: customRates?.OPTIMISTIC?.inflation ?? 0.022,
      returnRate: customRates?.OPTIMISTIC?.returnRate ?? 0.055,
      savingsFactor: 1.2,
      summary: 'Mayor captación de ingresos y optimización de costes operativos.',
    },
  ];

  return configs.map((cfg) => {
    const adjustedMonthlySavings = round2(Math.max(0, monthlySavingsCapacity * cfg.savingsFactor));
    const projectMonths = (months: number) => {
      let balance = baselineLiquidity;
      const monthlyRate = cfg.returnRate / 12;
      const netRealGrowth = (cfg.incomeGrowth - cfg.inflation) / 12;
      for (let m = 1; m <= months; m++) {
        const dynamicSaving = adjustedMonthlySavings * Math.pow(1 + netRealGrowth, m);
        balance = balance * (1 + monthlyRate) + Math.max(0, dynamicSaving);
      }
      return round2(balance);
    };

    return {
      id: `scen-${cfg.type.toLowerCase()}`,
      type: cfg.type,
      label: cfg.label,
      annualIncomeGrowthRate: cfg.incomeGrowth,
      annualExpenseInflationRate: cfg.inflation,
      expectedAnnualReturnRate: cfg.returnRate,
      monthlySavingsCapacity: adjustedMonthlySavings,
      projected12mBalance: projectMonths(12),
      projected36mBalance: projectMonths(36),
      projected60mBalance: projectMonths(60),
      assumptionsSummary: cfg.summary,
    };
  });
}
