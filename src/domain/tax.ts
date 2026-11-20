import {
  ClientEntityType,
  ClientProfile,
  Invoice,
  JournalEntry,
  JournalEntryStatus,
  TaxDeclaration,
  TaxDeclarationStatus,
  TaxModelDefinition,
  TaxObligation,
} from '../types/domain';
import { round2 } from './formatters';

/**
 * Rules-based tax obligation profiler.
 * Proposes applicable Spanish tax models based on verified client attributes.
 * Never marks a model mandatory solely because it exists in the catalog.
 */
export function proposeClientTaxObligations(
  client: ClientProfile,
  models: TaxModelDefinition[],
  existingObligations: TaxObligation[]
): TaxObligation[] {
  const proposals: TaxObligation[] = [];

  for (const model of models) {
    const existing = existingObligations.find(
      (o) => o.clientId === client.id && o.modelNumber === model.modelNumber
    );
    if (existing) {
      proposals.push(existing);
      continue;
    }

    let applicable = false;
    let rationale = 'No aplica según perfil censal actual.';

    switch (model.modelNumber) {
      case '303':
      case '390':
        if (client.vatRegime === 'GENERAL' && client.entityType !== ClientEntityType.INDIVIDUAL) {
          applicable = true;
          rationale = 'Sujeto pasivo de IVA en Régimen General.';
        }
        break;
      case '111':
      case '190':
        if (client.hasEmployees || client.paysProfessionalFees) {
          applicable = true;
          rationale = 'Abóno de rendimientos del trabajo o profesionales sujetos a retención.';
        }
        break;
      case '115':
      case '180':
        if (client.hasRentals) {
          applicable = true;
          rationale = 'Arrendamiento de local u oficina afecto a retención.';
        }
        break;
      case '200':
      case '202':
        if (client.entityType === ClientEntityType.SL || client.entityType === ClientEntityType.OTHER_COMPANY) {
          applicable = true;
          rationale = 'Entidad sujeta al Impuesto sobre Sociedades.';
        }
        break;
      case '349':
        if (client.hasIntracommunityOps) {
          applicable = true;
          rationale = 'Operaciones intracomunitarias declaradas en perfil censal.';
        }
        break;
      case '347':
        if (client.entityType !== ClientEntityType.INDIVIDUAL) {
          applicable = true;
          rationale = 'Aplicable si existen operaciones con terceros > 3.005,06 EUR (sujeto a comprobación anual).';
        }
        break;
      case '036':
        applicable = false;
        rationale = 'Modelo censal eventual (solo ante altas o modificaciones censales).';
        break;
      default:
        applicable = false;
        rationale = 'PENDIENTE DE VALIDACIÓN NORMATIVA / No activado en perfil.';
    }

    if (applicable) {
      proposals.push({
        id: `obl-prop-${client.id}-${model.modelNumber}`,
        clientId: client.id,
        modelNumber: model.modelNumber,
        proposedByEngine: true,
        approvedByAccountant: false,
        applicable: true,
        rationale,
      });
    }
  }

  return proposals;
}

export interface Model303DraftCalculation {
  outputVatBase: number;
  outputVatAmount: number;
  inputVatBase: number;
  inputVatDeductible: number;
  netResultAmount: number;
  linkedInvoiceIds: string[];
  linkedEntryIds: string[];
  missingDataNotes: string[];
  completenessPercent: number;
}

/**
 * Calculates a simplified standard-regime Model 303 VAT draft for a given period (e.g. '2026-Q4').
 * Uses validated invoices and posted/approved journal entries from the shared dataset.
 */
export function calculateModel303Draft(
  client: ClientProfile,
  periodCode: string,
  invoices: Invoice[],
  entries: JournalEntry[],
  unreviewedDocumentCount: number
): Model303DraftCalculation {
  const missingDataNotes: string[] = [];

  if (client.vatRegime !== 'GENERAL') {
    missingDataNotes.push(
      'Cliente fuera del régimen general de IVA: cálculo automático excluido hasta validación normativa específica.'
    );
    return {
      outputVatBase: 0,
      outputVatAmount: 0,
      inputVatBase: 0,
      inputVatDeductible: 0,
      netResultAmount: 0,
      linkedInvoiceIds: [],
      linkedEntryIds: [],
      missingDataNotes,
      completenessPercent: 20,
    };
  }

  const periodRange = getQuarterDateRange(periodCode);
  const periodInvoices = invoices.filter(
    (inv) =>
      inv.clientId === client.id &&
      inv.kind !== 'QUOTE' &&
      inv.status !== 'DRAFT' &&
      inv.issueDate >= periodRange.start &&
      inv.issueDate <= periodRange.end
  );

  let outputVatBase = 0;
  let outputVatAmount = 0;
  let inputVatBase = 0;
  let inputVatDeductible = 0;
  const linkedInvoiceIds: string[] = [];
  const linkedEntryIdsSet = new Set<string>();

  for (const inv of periodInvoices) {
    linkedInvoiceIds.push(inv.id);
    if (inv.linkedJournalEntryId) {
      const entry = entries.find(
        (e) =>
          e.id === inv.linkedJournalEntryId &&
          (e.status === JournalEntryStatus.APPROVED || e.status === JournalEntryStatus.POSTED)
      );
      if (entry) {
        linkedEntryIdsSet.add(entry.id);
      } else {
        missingDataNotes.push(`Factura ${inv.invoiceNumber} tiene asiento pendiente de aprobación.`);
      }
    } else {
      missingDataNotes.push(`Factura ${inv.invoiceNumber} aún no tiene asiento contable vinculado.`);
    }

    if (inv.direction === 'ISSUED') {
      outputVatBase = round2(outputVatBase + inv.taxableBase);
      outputVatAmount = round2(outputVatAmount + inv.vatAmount);
    } else {
      inputVatBase = round2(inputVatBase + inv.taxableBase);
      inputVatDeductible = round2(inputVatDeductible + inv.vatAmount);
    }
  }

  if (unreviewedDocumentCount > 0) {
    missingDataNotes.push(
      `Existen ${unreviewedDocumentCount} documento(s) pendientes de revisión documental que podrían afectar al IVA soportado.`
    );
  }

  const netResultAmount = round2(outputVatAmount - inputVatDeductible);
  const totalCheckpoints = Math.max(periodInvoices.length + unreviewedDocumentCount, 1);
  const resolvedCheckpoints = periodInvoices.filter((i) => Boolean(i.linkedJournalEntryId)).length;
  const completenessPercent =
    periodInvoices.length === 0
      ? 35
      : Math.min(100, Math.round((resolvedCheckpoints / totalCheckpoints) * 100));

  return {
    outputVatBase,
    outputVatAmount,
    inputVatBase,
    inputVatDeductible,
    netResultAmount,
    linkedInvoiceIds,
    linkedEntryIds: Array.from(linkedEntryIdsSet),
    missingDataNotes,
    completenessPercent,
  };
}

export function getQuarterDateRange(periodCode: string): { start: string; end: string } {
  const [yearStr, qStr] = periodCode.split('-');
  const year = Number(yearStr) || 2026;
  switch (qStr) {
    case 'Q1':
      return { start: `${year}-01-01`, end: `${year}-03-31` };
    case 'Q2':
      return { start: `${year}-04-01`, end: `${year}-06-30` };
    case 'Q3':
      return { start: `${year}-07-01`, end: `${year}-09-30` };
    case 'Q4':
    default:
      return { start: `${year}-10-01`, end: `${year}-12-31` };
  }
}

export function getClientEstimatedTaxLiability(declarations: TaxDeclaration[], clientId: string): number {
  return round2(
    declarations
      .filter(
        (d) =>
          d.clientId === clientId &&
          d.status !== TaxDeclarationStatus.FILED_EXTERNALLY &&
          (d.calculatedSummary.netResultAmount ?? 0) > 0
      )
      .reduce((acc, d) => acc + (d.calculatedSummary.netResultAmount ?? 0), 0)
  );
}
