import { VegenAppState } from '../types/domain';
import { validateInvoiceTotals, validateJournalEntryBalance } from './accounting';
import { computeGoalProgress } from './planning';
import { getAccessibleClients, hasPermission } from './rbac';
import { calculateModel303Draft } from './tax';
import { parseBankCsvText } from './treasury';

export interface InvariantCheckResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export function runDomainInvariantChecks(state: VegenAppState): InvariantCheckResult[] {
  const results: InvariantCheckResult[] = [];

  // 1. All journal entries balance
  const unbalanced = state.journalEntries.filter((je) => !validateJournalEntryBalance(je).valid);
  results.push({
    id: 'inv-1',
    name: 'Cuadre de asientos contables (Debe = Haber)',
    passed: unbalanced.length === 0,
    details:
      unbalanced.length === 0
        ? `Todos los ${state.journalEntries.length} asientos cumplen Debe = Haber.`
        : `Asientos descuadrados: ${unbalanced.map((u) => u.id).join(', ')}`,
  });

  // 2. Invoice totals reconcile with line totals
  const badInvoices = state.invoices.filter((inv) => !validateInvoiceTotals(inv).valid);
  results.push({
    id: 'inv-2',
    name: 'Reconciliación de líneas y totales en facturas',
    passed: badInvoices.length === 0,
    details:
      badInvoices.length === 0
        ? `Las ${state.invoices.length} facturas cuadran exactamente con sus líneas, IVA y retenciones.`
        : `Facturas con descuadre: ${badInvoices.map((i) => i.invoiceNumber).join(', ')}`,
  });

  // 3. VAT calculations internally consistent for Client A 2026-Q4 Model 303
  const clientA = state.clientProfiles.find((c) => c.id === 'client-a');
  const decA303 = state.taxDeclarations.find((d) => d.id === 'dec-a-303-q4');
  let vatConsistent = false;
  let vatDetail = 'No se encontró declaración 303 Q4 de VEGEN Digital SL';
  if (clientA && decA303) {
    const recomputed = calculateModel303Draft(
      clientA,
      '2026-Q4',
      state.invoices,
      state.journalEntries,
      0
    );
    const diff = Math.abs(
      (decA303.calculatedSummary.netResultAmount ?? 0) - recomputed.netResultAmount
    );
    vatConsistent = diff < 0.05;
    vatDetail = `IVA repercutido ${recomputed.outputVatAmount.toFixed(2)} € - soportado ${recomputed.inputVatDeductible.toFixed(2)} € = ${recomputed.netResultAmount.toFixed(2)} €`;
  }
  results.push({
    id: 'inv-3',
    name: 'Consistencia cálculo simplificado IVA Modelo 303',
    passed: vatConsistent,
    details: vatDetail,
  });

  // 4. Bank CSV import duplicate detection
  const existingFingerprints = new Set(state.bankTransactions.map((t) => t.fingerprint));
  const sampleTx = state.bankTransactions[0];
  const dupCsv = sampleTx
    ? `Fecha;Concepto;Contraparte;Referencia;Importe\n${sampleTx.date};${sampleTx.description};${sampleTx.counterparty};${sampleTx.reference};${sampleTx.amount.toFixed(2).replace('.', ',')}\n20/11/2026;ABONO NUEVO DEMO;Cliente Test;NEW-01;500,00`
    : '';
  const parsedCsv = parseBankCsvText(dupCsv, existingFingerprints);
  const dupPassed = parsedCsv.length === 2 && parsedCsv[0].isDuplicate === true && parsedCsv[1].isDuplicate === false;
  results.push({
    id: 'inv-4',
    name: 'Rechazo de filas duplicadas en importación CSV bancaria',
    passed: dupPassed,
    details: dupPassed
      ? 'El parser detectó y bloqueó la fila duplicada manteniendo la transacción nueva.'
      : 'Fallo al detectar duplicado bancario.',
  });

  // 5. Reconciliation does not double-count invoices
  const reconciledInvIds = state.bankTransactions
    .filter((t) => t.reconciliationStatus === 'RECONCILED' && t.reconciledInvoiceId)
    .map((t) => t.reconciledInvoiceId as string);
  const uniqueReconciled = new Set(reconciledInvIds);
  results.push({
    id: 'inv-5',
    name: 'No duplicidad en conciliaciones bancarias',
    passed: reconciledInvIds.length === uniqueReconciled.size,
    details: `${reconciledInvIds.length} conciliaciones activas sin doble imputación sobre facturas.`,
  });

  // 6. Goal progress calculation accuracy
  const goal1 = state.financialGoals.find((g) => g.id === 'goal-1');
  const gp = goal1 ? computeGoalProgress(goal1) : null;
  const goalOk = gp !== null && gp.progressPercent === 70 && gp.evidenceFunded === 42000 && gp.manualFunded === 0;
  results.push({
    id: 'inv-6',
    name: 'Cálculo de progreso de objetivos (evidencia vs manual)',
    passed: goalOk,
    details: gp
      ? `Meta 1: ${gp.evidenceFunded} € evidencia + ${gp.manualFunded} € manual = ${gp.progressPercent}%`
      : 'Meta no encontrada',
  });

  // 7. RBAC permissions restrict sensitive actions
  const collabState: VegenAppState = { ...state, activePersonaId: 'persona-client-a-collab' };
  const collabBlocked =
    !hasPermission(collabState, 'accounting.entries.approve') &&
    !hasPermission(collabState, 'finance.personal.read') &&
    !hasPermission(collabState, 'roles.manage');
  results.push({
    id: 'inv-7',
    name: 'Restricción RBAC de permisos sensibles',
    passed: collabBlocked,
    details: collabBlocked
      ? 'Colaborador de cliente bloqueado para aprobar asientos, ver patrimonio personal o gestionar roles.'
      : 'Error en restricción RBAC.',
  });

  // 8. Tenant isolation across personas
  const clientAState: VegenAppState = { ...state, activePersonaId: 'persona-client-a-admin' };
  const clientDState: VegenAppState = { ...state, activePersonaId: 'persona-client-d' };
  const clientsForA = getAccessibleClients(clientAState);
  const clientsForD = getAccessibleClients(clientDState);
  const tenantOk =
    clientsForA.length === 1 &&
    clientsForA[0].id === 'client-a' &&
    clientsForD.length === 1 &&
    clientsForD[0].id === 'client-d';
  results.push({
    id: 'inv-8',
    name: 'Aislamiento multi-tenant por organización cliente',
    passed: tenantOk,
    details: tenantOk
      ? 'Cada persona cliente accede exclusivamente a su propia entidad.'
      : 'Fuga de aislamiento entre clientes.',
  });

  // 9. All personas resolve valid roles and workspaces
  const personasOk = state.personas.every(
    (p) =>
      state.users.some((u) => u.id === p.userId) &&
      state.roles.some((r) => r.id === p.roleId) &&
      state.organizations.some((o) => o.id === p.organizationId)
  );
  results.push({
    id: 'inv-9',
    name: 'Integridad de personas de demostración',
    passed: personasOk,
    details: `${state.personas.length} personas demo vinculadas válidamente a usuarios, roles y organizaciones.`,
  });

  // 10. Synthetic dataset minimum coverage checks
  const supplierCount = state.invoices.filter((i) => i.direction === 'RECEIVED').length;
  const customerCount = state.invoices.filter((i) => i.direction === 'ISSUED').length;
  const datasetOk =
    supplierCount >= 30 &&
    customerCount >= 25 &&
    state.bankTransactions.length >= 80 &&
    state.journalEntries.length >= 20 &&
    state.financialPlans.length >= 4 &&
    state.financialGoals.length >= 10;
  results.push({
    id: 'inv-10',
    name: 'Cobertura mínima del dataset sintético',
    passed: datasetOk,
    details: `${supplierCount} fact. proveedor, ${customerCount} fact. cliente, ${state.bankTransactions.length} mov. bancarios, ${state.journalEntries.length} asientos, ${state.financialPlans.length} planes, ${state.financialGoals.length} objetivos.`,
  });

  return results;
}
