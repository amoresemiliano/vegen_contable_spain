import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AuditEvent,
  BankImportBatch,
  BankTransaction,
  ClientTask,
  CollaborationMessage,
  DocumentExtraction,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  ExtractionPreferenceRule,
  FinancialGoal,
  FinancialPlan,
  Invoice,
  InvoiceLine,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  PermissionCode,
  Role,
  SourceChannel,
  TaxDeclarationStatus,
  VegenAppState,
} from '../types/domain';
import { defaultDataAdapter } from './dataAdapter';
import { round2 } from '../domain/formatters';
import { validateJournalEntryBalance } from '../domain/accounting';
import {
  getAccessibleClients,
  getActivePersona,
  getActiveUserRole,
  hasPermission,
} from '../domain/rbac';
import { calculateModel303Draft } from '../domain/tax';
import { CsvParseRow } from '../domain/treasury';
import { buildScenarioProjections } from '../domain/planning';

interface UploadDocumentInput {
  clientId: string;
  fileName: string;
  mimeType: string;
  fileSizeKb: number;
  type: DocumentType;
  sourceChannel: SourceChannel;
  linkedTaskId?: string;
  customExtraction?: Partial<DocumentExtraction>;
}

interface AppContextValue {
  state: VegenAppState;
  activePersona: ReturnType<typeof getActivePersona>;
  activeRole: ReturnType<typeof getActiveUserRole>;
  accessibleClients: ReturnType<typeof getAccessibleClients>;
  can: (perm: PermissionCode) => boolean;
  switchPersona: (personaId: string) => void;
  setSelectedClientId: (clientId: string) => void;
  resetDemoData: () => void;
  // Document workflows
  uploadClientDocument: (input: UploadDocumentInput) => DocumentRecord;
  updateDocumentExtraction: (
    docId: string,
    updates: Partial<DocumentExtraction>,
    saveAsRule: boolean
  ) => void;
  approveDocumentAndGenerateEntry: (docId: string) => { ok: boolean; error?: string; entryId?: string };
  rejectDocument: (docId: string, reason: string) => void;
  // Accounting workflows
  createDraftJournalEntry: (params: {
    clientId: string;
    date: string;
    concept: string;
    lines: JournalEntryLine[];
    sourceDocumentId?: string;
  }) => { ok: boolean; error?: string; entry?: JournalEntry };
  approveAndPostJournalEntry: (entryId: string) => { ok: boolean; error?: string };
  reversePostedJournalEntry: (entryId: string, reason: string) => { ok: boolean; error?: string };
  closeAccountingPeriod: (periodId: string) => void;
  // Tax workflows
  toggleTaxObligationApproval: (obligationId: string) => void;
  recalculateModel303Draft: (clientId: string, periodCode: string) => void;
  advanceTaxDeclarationStatus: (
    declarationId: string,
    nextStatus: TaxDeclarationStatus,
    externalReceiptRef?: string
  ) => void;
  // Invoicing workflows
  saveDraftInvoice: (invoice: Omit<Invoice, 'id'> & { id?: string }) => Invoice;
  // Treasury & reconciliation workflows
  importBankCsvRows: (clientId: string, bankAccountId: string, fileName: string, rows: CsvParseRow[]) => BankImportBatch;
  approveReconciliationMatch: (transactionId: string, invoiceId: string) => void;
  resolveReconciliationException: (transactionId: string, note: string) => void;
  // Financial planning & goals
  addGoalContribution: (goalId: string, amount: number, sourceType: 'EVIDENCE_BANK_ACCOUNT' | 'MANUAL_ENTRY', note: string) => void;
  createGoal: (goal: Omit<FinancialGoal, 'id' | 'contributions' | 'milestones'>) => FinancialGoal;
  updateOrCreateFinancialPlan: (plan: FinancialPlan) => void;
  publishFinancialPlan: (planId: string) => void;
  // Collaboration & Tasks
  createClientTask: (task: Omit<ClientTask, 'id' | 'createdAt'>) => ClientTask;
  updateTaskStatus: (taskId: string, status: ClientTask['status']) => void;
  sendMessage: (msg: Omit<CollaborationMessage, 'id' | 'timestamp'>) => void;
  markNotificationsRead: () => void;
  // RBAC & Admin
  createOrCloneRole: (role: Omit<Role, 'id'>) => Role;
  updateRolePermissions: (roleId: string, permissions: PermissionCode[]) => void;
  assignUserRole: (userId: string, organizationId: string, roleId: string) => void;
  toggleProfessionalAssignment: (clientId: string, userId: string, firmOrgId: string, discipline: 'ACCOUNTING' | 'ADVISORY', canViewPersonalData: boolean) => void;
  updateSimulatedChannels: (updates: Partial<VegenAppState['simulatedChannels']>) => void;
}

const AppStoreContext = createContext<AppContextValue | null>(null);

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const AppStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<VegenAppState>(() => defaultDataAdapter.loadState());

  useEffect(() => {
    defaultDataAdapter.saveState(state);
  }, [state]);

  const activePersona = useMemo(() => getActivePersona(state), [state]);
  const activeRole = useMemo(() => getActiveUserRole(state), [state]);
  const accessibleClients = useMemo(() => getAccessibleClients(state), [state]);

  const can = (perm: PermissionCode) => hasPermission(state, perm);

  const makeAudit = (
    current: VegenAppState,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
    clientId?: string
  ): AuditEvent => {
    const persona = getActivePersona(current);
    const role = getActiveUserRole(current);
    const user = current.users.find((u) => u.id === persona.userId);
    return {
      id: uid('aud'),
      timestamp: new Date().toISOString(),
      actorUserId: persona.userId,
      actorName: user?.fullName ?? persona.label,
      actorRole: role?.code ?? 'UNKNOWN',
      organizationId: persona.organizationId,
      clientId,
      action,
      entityType,
      entityId,
      summary,
    };
  };

  const syncModel303ForClient = (draft: VegenAppState, clientId: string): VegenAppState => {
    const client = draft.clientProfiles.find((c) => c.id === clientId);
    if (!client) return draft;
    const unreviewed = draft.documents.filter(
      (d) => d.clientId === clientId && (d.status === DocumentStatus.NEEDS_REVIEW || d.status === DocumentStatus.EXTRACTED)
    ).length;
    const calc = calculateModel303Draft(client, '2026-Q4', draft.invoices, draft.journalEntries, unreviewed);
    const updatedDecls = draft.taxDeclarations.map((decl) => {
      if (decl.clientId === clientId && decl.modelNumber === '303' && decl.periodCode === '2026-Q4') {
        return {
          ...decl,
          completenessPercent: calc.completenessPercent,
          missingDataNotes: calc.missingDataNotes,
          calculatedSummary: {
            outputVatBase: calc.outputVatBase,
            outputVatAmount: calc.outputVatAmount,
            inputVatBase: calc.inputVatBase,
            inputVatDeductible: calc.inputVatDeductible,
            netResultAmount: calc.netResultAmount,
            isSimplifiedCalculation: true,
          },
          linkedInvoiceIds: calc.linkedInvoiceIds,
          linkedEntryIds: calc.linkedEntryIds,
          updatedAt: new Date().toISOString(),
        };
      }
      return decl;
    });
    return { ...draft, taxDeclarations: updatedDecls };
  };

  const switchPersona = (personaId: string) => {
    setState((prev) => {
      const nextPersona = prev.personas.find((p) => p.id === personaId);
      if (!nextPersona) return prev;
      const nextState: VegenAppState = {
        ...prev,
        activePersonaId: personaId,
      };
      const allowed = getAccessibleClients(nextState);
      const nextClientId =
        nextPersona.defaultClientId && allowed.some((c) => c.id === nextPersona.defaultClientId)
          ? nextPersona.defaultClientId
          : allowed[0]?.id ?? prev.selectedClientId;
      return { ...nextState, selectedClientId: nextClientId };
    });
  };

  const setSelectedClientId = (clientId: string) => {
    setState((prev) => ({ ...prev, selectedClientId: clientId }));
  };

  const resetDemoData = () => {
    const fresh = defaultDataAdapter.resetDemoState();
    setState(fresh);
  };

  const uploadClientDocument = (input: UploadDocumentInput): DocumentRecord => {
    const docId = uid('doc');
    const persona = getActivePersona(state);
    const uploader = state.users.find((u) => u.id === persona.userId);
    const client = state.clientProfiles.find((c) => c.id === input.clientId);

    // Check matching explicit preference rule for simulated AI extraction
    const defaultSupplierName = input.customExtraction?.counterpartyName || 'Consultora Tecnológica Norte SL (Demo)';
    const defaultTaxId = input.customExtraction?.counterpartyTaxId || 'B-95544332 DEMO';
    const matchedRule = state.extractionRules.find(
      (r) =>
        r.clientId === input.clientId &&
        (defaultTaxId.includes(r.supplierTaxIdPattern) ||
          defaultSupplierName.toLowerCase().includes(r.supplierName.toLowerCase().slice(0, 8)))
    );

    const base = round2(input.customExtraction?.taxableBase ?? 650);
    const vatRate = matchedRule ? matchedRule.preferredVatRate : (input.customExtraction?.vatRate ?? 21);
    const vatAmount = round2(base * (vatRate / 100));
    const withholdingAmount = round2(input.customExtraction?.withholdingAmount ?? 0);
    const totalAmount = round2(base + vatAmount - withholdingAmount);
    const invNum = input.customExtraction?.invoiceNumber || `EXT-${Math.floor(1000 + Math.random() * 8999)}`;

    // Check duplicate candidate against existing invoices
    const duplicateDoc = state.documents.find(
      (d) =>
        d.clientId === input.clientId &&
        d.extraction?.invoiceNumber === invNum &&
        d.extraction?.counterpartyName === defaultSupplierName
    );

    const extraction: DocumentExtraction = {
      id: uid('ext'),
      documentId: docId,
      counterpartyName: defaultSupplierName,
      counterpartyTaxId: defaultTaxId,
      invoiceNumber: invNum,
      issueDate: input.customExtraction?.issueDate || '2026-11-20',
      dueDate: input.customExtraction?.dueDate || '2026-12-20',
      currency: 'EUR',
      taxableBase: base,
      vatRate,
      vatAmount,
      withholdingAmount,
      totalAmount,
      paymentMethod: input.customExtraction?.paymentMethod || 'Transferencia bancaria',
      description: input.customExtraction?.description || `Documento ${input.fileName}`,
      suggestedCategory: matchedRule?.preferredCategory ?? input.customExtraction?.suggestedCategory ?? 'Servicios exteriores',
      suggestedAccountCode: matchedRule?.preferredAccountCode ?? input.customExtraction?.suggestedAccountCode ?? '6290',
      overallConfidence: matchedRule ? 0.94 : 0.82,
      appliedRuleId: matchedRule?.id,
      duplicateCandidateDocId: duplicateDoc?.id,
      fieldConfidences: matchedRule
        ? []
        : [
            { field: 'suggestedAccountCode', confidence: 0.74, uncertain: true, reason: 'Confirmar subcuenta PGC antes de contabilizar' },
            { field: 'counterpartyTaxId', confidence: 0.79, uncertain: true, reason: 'Verificar NIF/CIF extraído' },
          ],
    };

    const newDoc: DocumentRecord = {
      id: docId,
      organizationId: client?.organizationId ?? persona.organizationId,
      clientId: input.clientId,
      type: input.type,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSizeKb: input.fileSizeKb,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: persona.userId,
      uploadedByName: uploader?.fullName ?? persona.label,
      sourceChannel: input.sourceChannel,
      accountingPeriod: '2026-Q4',
      status: DocumentStatus.NEEDS_REVIEW,
      linkedRequestId: input.linkedTaskId,
      previewSummary: `Documento subido vía ${input.sourceChannel}. Extracción IA pendiente de revisión contable.`,
      extraction,
      reviewHistory: [],
    };

    setState((prev) => {
      const updatedTasks = input.linkedTaskId
        ? prev.tasks.map((t) =>
            t.id === input.linkedTaskId ? { ...t, status: 'SUBMITTED' as const, linkedDocumentId: docId } : t
          )
        : prev.tasks;

      const audit = makeAudit(
        prev,
        'DOCUMENT_UPLOADED',
        'document',
        docId,
        `Subida de ${input.fileName} (${base.toFixed(2)} € + IVA) para ${client?.displayName ?? input.clientId}`,
        input.clientId
      );

      return syncModel303ForClient(
        {
          ...prev,
          documents: [newDoc, ...prev.documents],
          tasks: updatedTasks,
          auditEvents: [audit, ...prev.auditEvents],
        },
        input.clientId
      );
    });

    return newDoc;
  };

  const updateDocumentExtraction = (
    docId: string,
    updates: Partial<DocumentExtraction>,
    saveAsRule: boolean
  ) => {
    setState((prev) => {
      const targetDoc = prev.documents.find((d) => d.id === docId);
      if (!targetDoc || !targetDoc.extraction) return prev;
      const persona = getActivePersona(prev);
      const user = prev.users.find((u) => u.id === persona.userId);

      const merged = { ...targetDoc.extraction, ...updates };
      const vatAmount = round2(merged.taxableBase * (merged.vatRate / 100));
      const totalAmount = round2(merged.taxableBase + vatAmount - (merged.withholdingAmount || 0));
      const cleanedExt: DocumentExtraction = {
        ...merged,
        vatAmount,
        totalAmount,
        fieldConfidences: merged.fieldConfidences.map((fc) =>
          updates[fc.field as keyof DocumentExtraction] !== undefined ? { ...fc, uncertain: false, confidence: 1 } : fc
        ),
      };

      const nextRules = [...prev.extractionRules];
      if (saveAsRule) {
        const rule: ExtractionPreferenceRule = {
          id: uid('rule'),
          clientId: targetDoc.clientId,
          supplierTaxIdPattern: cleanedExt.counterpartyTaxId.slice(0, 10),
          supplierName: cleanedExt.counterpartyName,
          preferredAccountCode: cleanedExt.suggestedAccountCode,
          preferredCategory: cleanedExt.suggestedCategory,
          preferredVatRate: cleanedExt.vatRate,
          createdFromDocumentId: docId,
          createdByUserId: persona.userId,
          createdAt: new Date().toISOString(),
          note: `Preferencia explícita guardada por ${user?.fullName ?? 'Contable'}: cuenta ${cleanedExt.suggestedAccountCode}, IVA ${cleanedExt.vatRate}%.`,
        };
        nextRules.unshift(rule);
      }

      const updatedDocs = prev.documents.map((d) =>
        d.id === docId
          ? {
              ...d,
              extraction: cleanedExt,
              reviewHistory: [
                ...d.reviewHistory,
                {
                  id: uid('rev'),
                  documentId: docId,
                  reviewerUserId: persona.userId,
                  reviewerName: user?.fullName ?? 'Contable',
                  timestamp: new Date().toISOString(),
                  action: 'CORRECTED' as const,
                  changesSummary: `Datos corregidos: ${cleanedExt.counterpartyName}, Base ${cleanedExt.taxableBase} €, Cuenta ${cleanedExt.suggestedAccountCode}${saveAsRule ? ' + Regla de preferencia guardada' : ''}.`,
                },
              ],
            }
          : d
      );

      return {
        ...prev,
        documents: updatedDocs,
        extractionRules: nextRules,
      };
    });
  };

  const approveDocumentAndGenerateEntry = (docId: string): { ok: boolean; error?: string; entryId?: string } => {
    const doc = state.documents.find((d) => d.id === docId);
    if (!doc || !doc.extraction) return { ok: false, error: 'Documento sin datos de extracción.' };
    if (doc.status === DocumentStatus.ACCOUNTED) {
      return { ok: false, error: 'El documento ya está contabilizado.' };
    }

    const ext = doc.extraction;
    const isCustomer = doc.type === DocumentType.CUSTOMER_INVOICE;
    const invId = doc.linkedInvoiceId || uid('inv');
    const entryId = uid('je');
    const accountObj = state.chartOfAccounts.find((a) => a.code === ext.suggestedAccountCode);
    const period =
      state.accountingPeriods.find((p) => p.clientId === doc.clientId && p.code === doc.accountingPeriod) ??
      state.accountingPeriods.find((p) => p.clientId === doc.clientId);

    if (period?.status === 'CLOSED') {
      return { ok: false, error: `El periodo ${period.code} está cerrado y no admite nuevos asientos.` };
    }

    const lines: JournalEntryLine[] = [];
    if (isCustomer) {
      lines.push({ id: uid('jl'), accountCode: '4300', accountName: 'Clientes', description: `Cobro ${ext.counterpartyName}`, debit: ext.totalAmount, credit: 0 });
      if (ext.withholdingAmount > 0) {
        lines.push({ id: uid('jl'), accountCode: '4730', accountName: 'Hacienda Pública, retenciones y pagos a cuenta', description: `Retención ${ext.invoiceNumber}`, debit: ext.withholdingAmount, credit: 0 });
      }
      lines.push({ id: uid('jl'), accountCode: ext.suggestedAccountCode || '7050', accountName: accountObj?.name ?? 'Prestaciones de servicios', description: ext.description, debit: 0, credit: ext.taxableBase });
      if (ext.vatAmount > 0) {
        lines.push({ id: uid('jl'), accountCode: '4770', accountName: 'Hacienda Pública, IVA repercutido', description: `IVA repercutido ${ext.invoiceNumber}`, debit: 0, credit: ext.vatAmount });
      }
    } else {
      lines.push({ id: uid('jl'), accountCode: ext.suggestedAccountCode || '6290', accountName: accountObj?.name ?? 'Otros servicios', description: ext.description, debit: ext.taxableBase, credit: 0 });
      if (ext.vatAmount > 0) {
        lines.push({ id: uid('jl'), accountCode: '4720', accountName: 'Hacienda Pública, IVA soportado', description: `IVA soportado ${ext.invoiceNumber}`, debit: ext.vatAmount, credit: 0 });
      }
      if (ext.withholdingAmount > 0) {
        lines.push({ id: uid('jl'), accountCode: '4751', accountName: 'Hacienda Pública, acreedora por retenciones practicadas', description: `Retención ${ext.invoiceNumber}`, debit: 0, credit: ext.withholdingAmount });
      }
      lines.push({ id: uid('jl'), accountCode: '4100', accountName: 'Acreedores por prestaciones de servicios', description: `Factura ${ext.invoiceNumber} · ${ext.counterpartyName}`, debit: 0, credit: ext.totalAmount });
    }

    const balanceCheck = validateJournalEntryBalance({ lines });
    if (!balanceCheck.valid) {
      return { ok: false, error: balanceCheck.message };
    }

    const invLine: InvoiceLine = {
      id: uid('il'),
      description: ext.description,
      quantity: 1,
      unitPrice: ext.taxableBase,
      discountPercent: 0,
      vatRate: ext.vatRate,
      withholdingRate: ext.taxableBase > 0 ? round2((ext.withholdingAmount / ext.taxableBase) * 100) : 0,
      accountCode: ext.suggestedAccountCode,
      lineSubtotal: ext.taxableBase,
      lineVat: ext.vatAmount,
      lineWithholding: ext.withholdingAmount,
      lineTotal: ext.totalAmount,
    };

    const newInvoice: Invoice = {
      id: invId,
      clientId: doc.clientId,
      direction: isCustomer ? 'ISSUED' : 'RECEIVED',
      kind: doc.type === DocumentType.CREDIT_NOTE ? 'CREDIT_NOTE' : 'INVOICE',
      status: 'VALIDATED',
      invoiceNumber: ext.invoiceNumber,
      contactId: uid('cnt'),
      contactName: ext.counterpartyName,
      contactTaxId: ext.counterpartyTaxId,
      issueDate: ext.issueDate,
      dueDate: ext.dueDate,
      paymentMethod: ext.paymentMethod,
      taxableBase: ext.taxableBase,
      vatAmount: ext.vatAmount,
      withholdingAmount: ext.withholdingAmount,
      totalAmount: ext.totalAmount,
      paidAmount: 0,
      lines: [invLine],
      linkedDocumentId: doc.id,
      linkedJournalEntryId: entryId,
    };

    setState((prev) => {
      const persona = getActivePersona(prev);
      const user = prev.users.find((u) => u.id === persona.userId);
      const nextNum = Math.max(0, ...prev.journalEntries.map((j) => j.entryNumber)) + 1;

      const newEntry: JournalEntry = {
        id: entryId,
        clientId: doc.clientId,
        entryNumber: nextNum,
        date: ext.issueDate,
        periodId: period?.id ?? 'per-a-q4',
        concept: `${isCustomer ? 'Factura emitida' : 'Factura recibida'} ${ext.invoiceNumber} (${ext.counterpartyName})`,
        status: JournalEntryStatus.POSTED,
        lines,
        sourceDocumentId: doc.id,
        sourceInvoiceId: invId,
        createdByUserId: persona.userId,
        approvedByUserId: persona.userId,
      };

      const nextInvoices = prev.invoices.some((i) => i.id === invId)
        ? prev.invoices.map((i) => (i.id === invId ? newInvoice : i))
        : [newInvoice, ...prev.invoices];

      const nextDocs = prev.documents.map((d) =>
        d.id === doc.id
          ? {
              ...d,
              status: DocumentStatus.ACCOUNTED,
              linkedInvoiceId: invId,
              linkedJournalEntryId: entryId,
              reviewHistory: [
                ...d.reviewHistory,
                {
                  id: uid('rev'),
                  documentId: doc.id,
                  reviewerUserId: persona.userId,
                  reviewerName: user?.fullName ?? 'Contable',
                  timestamp: new Date().toISOString(),
                  action: 'JOURNAL_GENERATED' as const,
                  changesSummary: `Aprobado y contabilizado en asiento #${nextNum} (${ext.totalAmount.toFixed(2)} €).`,
                },
              ],
            }
          : d
      );

      const nextTasks = doc.linkedRequestId
        ? prev.tasks.map((t) => (t.id === doc.linkedRequestId ? { ...t, status: 'RESOLVED' as const } : t))
        : prev.tasks;

      const audit = makeAudit(
        prev,
        'DOCUMENT_ACCOUNTED',
        'journal_entry',
        entryId,
        `Documento ${doc.fileName} contabilizado en asiento #${nextNum}`,
        doc.clientId
      );

      return syncModel303ForClient(
        {
          ...prev,
          documents: nextDocs,
          invoices: nextInvoices,
          journalEntries: [newEntry, ...prev.journalEntries],
          tasks: nextTasks,
          auditEvents: [audit, ...prev.auditEvents],
        },
        doc.clientId
      );
    });

    return { ok: true, entryId };
  };

  const rejectDocument = (docId: string, reason: string) => {
    setState((prev) => {
      const persona = getActivePersona(prev);
      const user = prev.users.find((u) => u.id === persona.userId);
      const target = prev.documents.find((d) => d.id === docId);
      const nextDocs = prev.documents.map((d) =>
        d.id === docId
          ? {
              ...d,
              status: DocumentStatus.REJECTED,
              reviewHistory: [
                ...d.reviewHistory,
                {
                  id: uid('rev'),
                  documentId: docId,
                  reviewerUserId: persona.userId,
                  reviewerName: user?.fullName ?? 'Contable',
                  timestamp: new Date().toISOString(),
                  action: 'REJECTED' as const,
                  changesSummary: `Rechazado: ${reason}`,
                },
              ],
            }
          : d
      );
      const audit = makeAudit(prev, 'DOCUMENT_REJECTED', 'document', docId, `Documento rechazado: ${reason}`, target?.clientId);
      return { ...prev, documents: nextDocs, auditEvents: [audit, ...prev.auditEvents] };
    });
  };

  const createDraftJournalEntry = (params: {
    clientId: string;
    date: string;
    concept: string;
    lines: JournalEntryLine[];
    sourceDocumentId?: string;
  }) => {
    const check = validateJournalEntryBalance({ lines: params.lines });
    if (!check.valid) {
      return { ok: false, error: check.message };
    }
    const period = state.accountingPeriods.find((p) => p.clientId === params.clientId && p.status !== 'CLOSED');
    const nextNum = Math.max(0, ...state.journalEntries.map((j) => j.entryNumber)) + 1;
    const entry: JournalEntry = {
      id: uid('je'),
      clientId: params.clientId,
      entryNumber: nextNum,
      date: params.date,
      periodId: period?.id ?? 'per-a-q4',
      concept: params.concept,
      status: JournalEntryStatus.DRAFT,
      lines: params.lines,
      sourceDocumentId: params.sourceDocumentId,
      createdByUserId: activePersona.userId,
    };
    setState((prev) => ({
      ...prev,
      journalEntries: [entry, ...prev.journalEntries],
      auditEvents: [
        makeAudit(prev, 'JOURNAL_DRAFT_CREATED', 'journal_entry', entry.id, `Borrador asiento #${nextNum}: ${params.concept}`, params.clientId),
        ...prev.auditEvents,
      ],
    }));
    return { ok: true, entry };
  };

  const approveAndPostJournalEntry = (entryId: string) => {
    const entry = state.journalEntries.find((e) => e.id === entryId);
    if (!entry) return { ok: false, error: 'Asiento no encontrado.' };
    const check = validateJournalEntryBalance(entry);
    if (!check.valid) return { ok: false, error: check.message };
    const period = state.accountingPeriods.find((p) => p.id === entry.periodId);
    if (period?.status === 'CLOSED') {
      return { ok: false, error: 'Periodo cerrado: no es posible contabilizar asientos.' };
    }
    setState((prev) => {
      const nextEntries = prev.journalEntries.map((e) =>
        e.id === entryId
          ? { ...e, status: JournalEntryStatus.POSTED, approvedByUserId: getActivePersona(prev).userId }
          : e
      );
      return syncModel303ForClient(
        {
          ...prev,
          journalEntries: nextEntries,
          auditEvents: [
            makeAudit(prev, 'JOURNAL_POSTED', 'journal_entry', entryId, `Asiento #${entry.entryNumber} aprobado y contabilizado`, entry.clientId),
            ...prev.auditEvents,
          ],
        },
        entry.clientId
      );
    });
    return { ok: true };
  };

  const reversePostedJournalEntry = (entryId: string, reason: string) => {
    const entry = state.journalEntries.find((e) => e.id === entryId);
    if (!entry) return { ok: false, error: 'Asiento no encontrado.' };
    if (entry.status !== JournalEntryStatus.POSTED) {
      return { ok: false, error: 'Solo los asientos contabilizados generan contraasiento de anulación.' };
    }
    setState((prev) => {
      const nextNum = Math.max(0, ...prev.journalEntries.map((j) => j.entryNumber)) + 1;
      const reversal: JournalEntry = {
        id: uid('je'),
        clientId: entry.clientId,
        entryNumber: nextNum,
        date: new Date().toISOString().slice(0, 10),
        periodId: entry.periodId,
        concept: `Contraasiento anulación #${entry.entryNumber}: ${reason}`,
        status: JournalEntryStatus.POSTED,
        reversedEntryId: entry.id,
        createdByUserId: getActivePersona(prev).userId,
        approvedByUserId: getActivePersona(prev).userId,
        lines: entry.lines.map((l) => ({
          ...l,
          id: uid('jl'),
          debit: l.credit,
          credit: l.debit,
          description: `Anulación: ${l.description}`,
        })),
      };
      const nextEntries = prev.journalEntries.map((e) =>
        e.id === entryId ? { ...e, status: JournalEntryStatus.REVERSED, auditNote: reason } : e
      );
      return syncModel303ForClient(
        {
          ...prev,
          journalEntries: [reversal, ...nextEntries],
          auditEvents: [
            makeAudit(prev, 'JOURNAL_REVERSED', 'journal_entry', entryId, `Asiento #${entry.entryNumber} anulado mediante contraasiento #${nextNum}`, entry.clientId),
            ...prev.auditEvents,
          ],
        },
        entry.clientId
      );
    });
    return { ok: true };
  };

  const closeAccountingPeriod = (periodId: string) => {
    setState((prev) => {
      const target = prev.accountingPeriods.find((p) => p.id === periodId);
      return {
        ...prev,
        accountingPeriods: prev.accountingPeriods.map((p) =>
          p.id === periodId
            ? { ...p, status: 'CLOSED', closedAt: new Date().toISOString().slice(0, 10), closedByUserId: getActivePersona(prev).userId }
            : p
        ),
        auditEvents: [
          makeAudit(prev, 'PERIOD_CLOSED', 'accounting_period', periodId, `Cierre contable del periodo ${target?.code ?? periodId}`, target?.clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const toggleTaxObligationApproval = (obligationId: string) => {
    setState((prev) => {
      const target = prev.taxObligations.find((o) => o.id === obligationId);
      const next = prev.taxObligations.map((o) =>
        o.id === obligationId ? { ...o, approvedByAccountant: !o.approvedByAccountant } : o
      );
      return {
        ...prev,
        taxObligations: next,
        auditEvents: [
          makeAudit(prev, 'TAX_OBLIGATION_TOGGLED', 'tax_obligation', obligationId, `Perfil fiscal Modelo ${target?.modelNumber} actualizado`, target?.clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const recalculateModel303Draft = (clientId: string, periodCode: string) => {
    setState((prev) => {
      const synced = syncModel303ForClient(prev, clientId);
      return {
        ...synced,
        auditEvents: [
          makeAudit(prev, 'TAX_DRAFT_RECALCULATED', 'tax_declaration', `${clientId}-${periodCode}`, `Borrador simplificado Modelo 303 (${periodCode}) recalculado desde libros contables`, clientId),
          ...synced.auditEvents,
        ],
      };
    });
  };

  const advanceTaxDeclarationStatus = (
    declarationId: string,
    nextStatus: TaxDeclarationStatus,
    externalReceiptRef?: string
  ) => {
    setState((prev) => {
      const persona = getActivePersona(prev);
      const target = prev.taxDeclarations.find((d) => d.id === declarationId);
      const nextDecls = prev.taxDeclarations.map((d) =>
        d.id === declarationId
          ? {
              ...d,
              status: nextStatus,
              reviewedByUserId: persona.userId,
              approvedByUserId:
                nextStatus === TaxDeclarationStatus.APPROVED ||
                nextStatus === TaxDeclarationStatus.READY_FOR_EXTERNAL_FILING
                  ? persona.userId
                  : d.approvedByUserId,
              externalReceiptRef: externalReceiptRef ?? d.externalReceiptRef,
              externalFiledAt:
                nextStatus === TaxDeclarationStatus.FILED_EXTERNALLY
                  ? new Date().toISOString().slice(0, 10)
                  : d.externalFiledAt,
              updatedAt: new Date().toISOString(),
            }
          : d
      );
      return {
        ...prev,
        taxDeclarations: nextDecls,
        auditEvents: [
          makeAudit(
            prev,
            'TAX_DECLARATION_UPDATED',
            'tax_declaration',
            declarationId,
            `Modelo ${target?.modelNumber} (${target?.periodCode}) pasado a estado ${nextStatus}${externalReceiptRef ? ` · Justificante ${externalReceiptRef}` : ''}`,
            target?.clientId
          ),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const saveDraftInvoice = (invoice: Omit<Invoice, 'id'> & { id?: string }): Invoice => {
    const invId = invoice.id || uid('inv');
    const saved: Invoice = { ...invoice, id: invId };
    setState((prev) => {
      const exists = prev.invoices.some((i) => i.id === invId);
      const nextInvoices = exists
        ? prev.invoices.map((i) => (i.id === invId ? saved : i))
        : [saved, ...prev.invoices];
      return syncModel303ForClient(
        {
          ...prev,
          invoices: nextInvoices,
          auditEvents: [
            makeAudit(prev, 'INVOICE_DRAFT_SAVED', 'invoice', invId, `Factura borrador ${saved.invoiceNumber} (${saved.totalAmount.toFixed(2)} €)`, saved.clientId),
            ...prev.auditEvents,
          ],
        },
        saved.clientId
      );
    });
    return saved;
  };

  const importBankCsvRows = (
    clientId: string,
    bankAccountId: string,
    fileName: string,
    rows: CsvParseRow[]
  ): BankImportBatch => {
    const validNew = rows.filter((r) => !r.isDuplicate && !r.error);
    const duplicateCount = rows.filter((r) => r.isDuplicate).length;
    const batchId = uid('imp');
    const batch: BankImportBatch = {
      id: batchId,
      clientId,
      bankAccountId,
      fileName,
      importedAt: new Date().toISOString(),
      importedByUserId: activePersona.userId,
      totalRows: rows.length,
      importedRows: validNew.length,
      duplicateRowsRejected: duplicateCount,
    };

    const newTxs: BankTransaction[] = validNew.map((r) => ({
      id: uid('tx'),
      clientId,
      bankAccountId,
      date: r.normalizedDate,
      valueDate: r.normalizedDate,
      description: r.description,
      counterparty: r.counterparty,
      reference: r.reference,
      amount: r.amount,
      category: r.amount >= 0 ? 'Cobro importado CSV' : 'Pago importado CSV',
      reconciliationStatus: 'UNMATCHED',
      importBatchId: batchId,
      fingerprint: r.fingerprint,
    }));

    const delta = round2(newTxs.reduce((s, t) => s + t.amount, 0));

    setState((prev) => ({
      ...prev,
      bankImports: [batch, ...prev.bankImports],
      bankTransactions: [...newTxs, ...prev.bankTransactions],
      bankAccounts: prev.bankAccounts.map((ba) =>
        ba.id === bankAccountId
          ? {
              ...ba,
              currentBalance: round2(ba.currentBalance + delta),
              availableBalance: round2(ba.availableBalance + delta),
              lastUpdated: new Date().toISOString().slice(0, 10),
            }
          : ba
      ),
      auditEvents: [
        makeAudit(
          prev,
          'BANK_CSV_IMPORTED',
          'bank_import',
          batchId,
          `Importado ${fileName}: ${validNew.length} nuevos movimientos, ${duplicateCount} duplicados rechazados`,
          clientId
        ),
        ...prev.auditEvents,
      ],
    }));

    return batch;
  };

  const approveReconciliationMatch = (transactionId: string, invoiceId: string) => {
    setState((prev) => {
      const tx = prev.bankTransactions.find((t) => t.id === transactionId);
      const inv = prev.invoices.find((i) => i.id === invoiceId);
      if (!tx || !inv) return prev;

      const nextTxs = prev.bankTransactions.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              reconciliationStatus: 'RECONCILED' as const,
              reconciledInvoiceId: invoiceId,
              proposedInvoiceId: undefined,
              matchReason: `Conciliado manualmente con ${inv.invoiceNumber}`,
            }
          : t
      );

      const newPaid = round2(Math.min(inv.totalAmount, inv.paidAmount + Math.abs(tx.amount)));
      const nextInvStatus: Invoice['status'] =
        newPaid >= inv.totalAmount - 0.05 ? 'PAID' : 'PARTIAL';
      const nextInvoices = prev.invoices.map((i) =>
        i.id === invoiceId ? { ...i, paidAmount: newPaid, status: nextInvStatus } : i
      );

      return {
        ...prev,
        bankTransactions: nextTxs,
        invoices: nextInvoices,
        auditEvents: [
          makeAudit(prev, 'RECONCILIATION_APPROVED', 'bank_transaction', transactionId, `Movimiento ${tx.description} conciliado con factura ${inv.invoiceNumber}`, tx.clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const resolveReconciliationException = (transactionId: string, note: string) => {
    setState((prev) => {
      const tx = prev.bankTransactions.find((t) => t.id === transactionId);
      return {
        ...prev,
        bankTransactions: prev.bankTransactions.map((t) =>
          t.id === transactionId
            ? { ...t, reconciliationStatus: 'RECONCILED', matchReason: `Resuelto manualmente: ${note}` }
            : t
        ),
        auditEvents: [
          makeAudit(prev, 'RECONCILIATION_EXCEPTION_RESOLVED', 'bank_transaction', transactionId, `Excepción bancaria resuelta: ${note}`, tx?.clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const addGoalContribution = (
    goalId: string,
    amount: number,
    sourceType: 'EVIDENCE_BANK_ACCOUNT' | 'MANUAL_ENTRY',
    note: string
  ) => {
    setState((prev) => {
      const persona = getActivePersona(prev);
      const user = prev.users.find((u) => u.id === persona.userId);
      const target = prev.financialGoals.find((g) => g.id === goalId);
      const nextGoals = prev.financialGoals.map((g) => {
        if (g.id !== goalId) return g;
        const evidenceFundedAmount =
          sourceType === 'EVIDENCE_BANK_ACCOUNT' ? round2(g.evidenceFundedAmount + amount) : g.evidenceFundedAmount;
        const manualFundedAmount =
          sourceType === 'MANUAL_ENTRY' ? round2(g.manualFundedAmount + amount) : g.manualFundedAmount;
        const total = evidenceFundedAmount + manualFundedAmount;
        return {
          ...g,
          evidenceFundedAmount,
          manualFundedAmount,
          status: total >= g.targetAmount ? ('COMPLETED' as const) : g.status,
          contributions: [
            {
              id: uid('gc'),
              goalId,
              date: new Date().toISOString().slice(0, 10),
              amount,
              sourceType,
              attributedByUserName: user?.fullName ?? persona.label,
              note,
            },
            ...g.contributions,
          ],
        };
      });
      return {
        ...prev,
        financialGoals: nextGoals,
        auditEvents: [
          makeAudit(prev, 'GOAL_CONTRIBUTION_ADDED', 'financial_goal', goalId, `Aportación ${amount.toFixed(2)} € (${sourceType}) en objetivo ${target?.name}`, target?.clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const createGoal = (goalInput: Omit<FinancialGoal, 'id' | 'contributions' | 'milestones'>): FinancialGoal => {
    const newGoal: FinancialGoal = {
      ...goalInput,
      id: uid('goal'),
      milestones: [
        { id: uid('ms'), label: '50% del objetivo', targetAmount: round2(goalInput.targetAmount * 0.5), reached: goalInput.evidenceFundedAmount + goalInput.manualFundedAmount >= goalInput.targetAmount * 0.5 },
        { id: uid('ms'), label: '100% completado', targetAmount: goalInput.targetAmount, reached: false },
      ],
      contributions: [],
    };
    setState((prev) => ({
      ...prev,
      financialGoals: [newGoal, ...prev.financialGoals],
      auditEvents: [
        makeAudit(prev, 'GOAL_CREATED', 'financial_goal', newGoal.id, `Nuevo objetivo creado: ${newGoal.name} (${newGoal.targetAmount} €)`, newGoal.clientId),
        ...prev.auditEvents,
      ],
    }));
    return newGoal;
  };

  const updateOrCreateFinancialPlan = (plan: FinancialPlan) => {
    setState((prev) => {
      const exists = prev.financialPlans.some((p) => p.id === plan.id);
      const recalculated: FinancialPlan = {
        ...plan,
        scenarios:
          plan.scenarios.length === 3
            ? plan.scenarios
            : buildScenarioProjections(plan.baselineLiquidity, plan.baselineMonthlySavingsCapacity),
      };
      return {
        ...prev,
        financialPlans: exists
          ? prev.financialPlans.map((p) => (p.id === plan.id ? recalculated : p))
          : [recalculated, ...prev.financialPlans],
      };
    });
  };

  const publishFinancialPlan = (planId: string) => {
    setState((prev) => {
      const target = prev.financialPlans.find((p) => p.id === planId);
      return {
        ...prev,
        financialPlans: prev.financialPlans.map((p) =>
          p.id === planId ? { ...p, status: 'PUBLISHED', publishedAt: new Date().toISOString().slice(0, 10) } : p
        ),
        notifications: target
          ? [
              {
                id: uid('not'),
                clientId: target.clientId,
                title: 'Nuevo Plan Financiero publicado',
                detail: `${target.advisorName} ha publicado: ${target.title}`,
                severity: 'INFO',
                read: false,
                createdAt: new Date().toISOString(),
              },
              ...prev.notifications,
            ]
          : prev.notifications,
        auditEvents: [
          makeAudit(prev, 'PLAN_PUBLISHED', 'financial_plan', planId, `Plan financiero publicado al cliente: ${target?.title}`, target?.clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const createClientTask = (taskInput: Omit<ClientTask, 'id' | 'createdAt'>): ClientTask => {
    const newTask: ClientTask = {
      ...taskInput,
      id: uid('task'),
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      tasks: [newTask, ...prev.tasks],
      notifications: [
        {
          id: uid('not'),
          clientId: taskInput.clientId,
          title: 'Nueva solicitud del despacho',
          detail: taskInput.title,
          severity: 'ACTION_REQUIRED',
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...prev.notifications,
      ],
      auditEvents: [
        makeAudit(prev, 'TASK_CREATED', 'task', newTask.id, `Solicitud creada: ${newTask.title}`, taskInput.clientId),
        ...prev.auditEvents,
      ],
    }));
    return newTask;
  };

  const updateTaskStatus = (taskId: string, status: ClientTask['status']) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
    }));
  };

  const sendMessage = (msgInput: Omit<CollaborationMessage, 'id' | 'timestamp'>) => {
    const msg: CollaborationMessage = {
      ...msgInput,
      id: uid('msg'),
      timestamp: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, msg],
    }));
  };

  const markNotificationsRead = () => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  };

  const createOrCloneRole = (roleInput: Omit<Role, 'id'>): Role => {
    const newRole: Role = { ...roleInput, id: uid('role') };
    setState((prev) => ({
      ...prev,
      roles: [...prev.roles, newRole],
      auditEvents: [
        makeAudit(prev, 'ROLE_CREATED', 'role', newRole.id, `Rol creado: ${newRole.name} (${newRole.permissions.length} permisos)`),
        ...prev.auditEvents,
      ],
    }));
    return newRole;
  };

  const updateRolePermissions = (roleId: string, permissions: PermissionCode[]) => {
    setState((prev) => {
      const target = prev.roles.find((r) => r.id === roleId);
      return {
        ...prev,
        roles: prev.roles.map((r) => (r.id === roleId ? { ...r, permissions } : r)),
        auditEvents: [
          makeAudit(prev, 'ROLE_PERMISSIONS_UPDATED', 'role', roleId, `Permisos actualizados para rol ${target?.name ?? roleId} (${permissions.length} activos)`),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const assignUserRole = (userId: string, organizationId: string, roleId: string) => {
    setState((prev) => {
      const role = prev.roles.find((r) => r.id === roleId);
      const user = prev.users.find((u) => u.id === userId);
      const nextMemberships = prev.memberships.map((m) =>
        m.userId === userId && m.organizationId === organizationId ? { ...m, roleId } : m
      );
      const nextPersonas = prev.personas.map((p) =>
        p.userId === userId && p.organizationId === organizationId ? { ...p, roleId } : p
      );
      return {
        ...prev,
        memberships: nextMemberships,
        personas: nextPersonas,
        auditEvents: [
          makeAudit(prev, 'USER_ROLE_ASSIGNED', 'membership', userId, `Usuario ${user?.fullName ?? userId} asignado al rol ${role?.name ?? roleId}`),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const toggleProfessionalAssignment = (
    clientId: string,
    userId: string,
    firmOrgId: string,
    discipline: 'ACCOUNTING' | 'ADVISORY',
    canViewPersonalData: boolean
  ) => {
    setState((prev) => {
      const exists = prev.assignments.find(
        (a) => a.clientId === clientId && a.userId === userId && a.discipline === discipline
      );
      const nextAssignments = exists
        ? prev.assignments.filter((a) => a.id !== exists.id)
        : [
            ...prev.assignments,
            {
              id: uid('asg'),
              clientId,
              firmOrgId,
              userId,
              discipline,
              canViewPersonalData,
              assignedAt: new Date().toISOString().slice(0, 10),
            },
          ];
      return {
        ...prev,
        assignments: nextAssignments,
        auditEvents: [
          makeAudit(prev, exists ? 'ASSIGNMENT_REMOVED' : 'ASSIGNMENT_ADDED', 'professional_assignment', clientId, `Asignación ${discipline} actualizada para cliente ${clientId}`, clientId),
          ...prev.auditEvents,
        ],
      };
    });
  };

  const updateSimulatedChannels = (updates: Partial<VegenAppState['simulatedChannels']>) => {
    setState((prev) => ({
      ...prev,
      simulatedChannels: { ...prev.simulatedChannels, ...updates },
    }));
  };

  return (
    <AppStoreContext.Provider
      value={{
        state,
        activePersona,
        activeRole,
        accessibleClients,
        can,
        switchPersona,
        setSelectedClientId,
        resetDemoData,
        uploadClientDocument,
        updateDocumentExtraction,
        approveDocumentAndGenerateEntry,
        rejectDocument,
        createDraftJournalEntry,
        approveAndPostJournalEntry,
        reversePostedJournalEntry,
        closeAccountingPeriod,
        toggleTaxObligationApproval,
        recalculateModel303Draft,
        advanceTaxDeclarationStatus,
        saveDraftInvoice,
        importBankCsvRows,
        approveReconciliationMatch,
        resolveReconciliationException,
        addGoalContribution,
        createGoal,
        updateOrCreateFinancialPlan,
        publishFinancialPlan,
        createClientTask,
        updateTaskStatus,
        sendMessage,
        markNotificationsRead,
        createOrCloneRole,
        updateRolePermissions,
        assignUserRole,
        toggleProfessionalAssignment,
        updateSimulatedChannels,
      }}
    >
      {children}
    </AppStoreContext.Provider>
  );
};

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used inside AppStoreProvider');
  return ctx;
}
