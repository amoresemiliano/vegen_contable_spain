/**
 * Core Domain Types & Enums for VEGEN Finance Spain MVP.
 * Models the full relational architecture (organizations, RBAC, documents,
 * Spanish PGC accounting, tax obligations, treasury, financial planning,
 * collaboration, and audit trails).
 */

export enum ClientEntityType {
  SL = 'SL',
  OTHER_COMPANY = 'OTHER_COMPANY',
  AUTONOMO = 'AUTONOMO',
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS_OWNER_PERSONAL = 'BUSINESS_OWNER_PERSONAL',
}

export enum OrganizationType {
  PLATFORM = 'PLATFORM',
  ACCOUNTING_FIRM = 'ACCOUNTING_FIRM',
  ADVISORY_FIRM = 'ADVISORY_FIRM',
  CLIENT_ENTITY = 'CLIENT_ENTITY',
}

export enum BaseRoleCode {
  PLATFORM_SUPERADMIN = 'PLATFORM_SUPERADMIN',
  FIRM_ADMIN = 'FIRM_ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  FINANCIAL_ADVISOR = 'FINANCIAL_ADVISOR',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  CLIENT_COLLABORATOR = 'CLIENT_COLLABORATOR',
}

export type PermissionCode =
  | 'documents.upload'
  | 'documents.read'
  | 'documents.review'
  | 'documents.delete'
  | 'invoices.read'
  | 'invoices.create'
  | 'invoices.export'
  | 'accounting.entries.read'
  | 'accounting.entries.create'
  | 'accounting.entries.approve'
  | 'accounting.periods.close'
  | 'accounting.reports.read'
  | 'tax.obligations.manage'
  | 'tax.drafts.generate'
  | 'tax.drafts.approve'
  | 'treasury.read'
  | 'treasury.transactions.import'
  | 'treasury.reconciliation.approve'
  | 'finance.profile.read'
  | 'finance.plans.create'
  | 'finance.plans.publish'
  | 'finance.goals.propose'
  | 'finance.goals.manage'
  | 'finance.personal.read'
  | 'messages.client.read'
  | 'messages.client.send'
  | 'messages.internal.read'
  | 'users.manage'
  | 'roles.manage'
  | 'organizations.manage'
  | 'assignments.manage'
  | 'audit.read'
  | 'system.config.manage';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  taxId: string;
  city: string;
  isDemo: boolean;
  createdAt: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  scope: 'PLATFORM' | 'FIRM' | 'CLIENT';
  isSystem: boolean;
  permissions: PermissionCode[];
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  avatarInitials: string;
  primaryOrgId: string;
  active: boolean;
}

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  roleId: string;
  active: boolean;
}

export interface ProfessionalAssignment {
  id: string;
  clientId: string;
  firmOrgId: string;
  userId: string;
  discipline: 'ACCOUNTING' | 'ADVISORY';
  canViewPersonalData: boolean;
  assignedAt: string;
}

export interface ClientProfile {
  id: string;
  organizationId: string;
  displayName: string;
  legalName: string;
  taxId: string;
  entityType: ClientEntityType;
  vatRegime: 'GENERAL' | 'EXEMPT' | 'NOT_APPLICABLE';
  directTaxRegime: 'IS' | 'IRPF_DIRECTA' | 'IRPF_PERSONAL';
  hasEmployees: boolean;
  hasRentals: boolean;
  hasIntracommunityOps: boolean;
  paysProfessionalFees: boolean;
  cnaeCode: string;
  cnaeDescription: string;
  accountingFirmId?: string;
  advisoryFirmId?: string;
  allowsConsolidatedPersonalView: boolean;
  ownerIndividualClientId?: string;
}

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  EXTRACTED = 'EXTRACTED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  ACCOUNTED = 'ACCOUNTED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

export enum DocumentType {
  SUPPLIER_INVOICE = 'SUPPLIER_INVOICE',
  CUSTOMER_INVOICE = 'CUSTOMER_INVOICE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  EXPENSE_RECEIPT = 'EXPENSE_RECEIPT',
  BANK_STATEMENT = 'BANK_STATEMENT',
  CONTRACT = 'CONTRACT',
  PAYROLL = 'PAYROLL',
  TAX_DOCUMENT = 'TAX_DOCUMENT',
  OTHER = 'OTHER',
}

export type SourceChannel =
  | 'PWA_CAMERA'
  | 'WEB_UPLOAD'
  | 'CSV_IMPORT'
  | 'EMAIL_SIMULATED'
  | 'WHATSAPP_SIMULATED';

export interface ExtractionFieldConfidence {
  field: string;
  confidence: number; // 0 to 1
  uncertain: boolean;
  reason?: string;
}

export interface DocumentExtraction {
  id: string;
  documentId: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: 'EUR';
  taxableBase: number;
  vatRate: number;
  vatAmount: number;
  withholdingAmount: number;
  totalAmount: number;
  paymentMethod: string;
  description: string;
  suggestedCategory: string;
  suggestedAccountCode: string;
  overallConfidence: number;
  fieldConfidences: ExtractionFieldConfidence[];
  duplicateCandidateDocId?: string;
  appliedRuleId?: string;
}

export interface DocumentReviewLog {
  id: string;
  documentId: string;
  reviewerUserId: string;
  reviewerName: string;
  timestamp: string;
  action: 'CORRECTED' | 'APPROVED' | 'REJECTED' | 'JOURNAL_GENERATED';
  changesSummary: string;
}

export interface DocumentRecord {
  id: string;
  organizationId: string;
  clientId: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  fileSizeKb: number;
  uploadedAt: string;
  uploadedByUserId: string;
  uploadedByName: string;
  sourceChannel: SourceChannel;
  accountingPeriod: string; // e.g., '2026-Q4'
  status: DocumentStatus;
  linkedInvoiceId?: string;
  linkedJournalEntryId?: string;
  linkedRequestId?: string;
  previewSummary: string;
  extraction?: DocumentExtraction;
  reviewHistory: DocumentReviewLog[];
}

export interface ExtractionPreferenceRule {
  id: string;
  clientId: string;
  supplierTaxIdPattern: string;
  supplierName: string;
  preferredAccountCode: string;
  preferredCategory: string;
  preferredVatRate: number;
  createdFromDocumentId: string;
  createdByUserId: string;
  createdAt: string;
  note: string;
}

export interface Contact {
  id: string;
  clientId: string;
  kind: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  name: string;
  taxId: string;
  email: string;
  paymentTermDays: number;
  defaultAccountCode: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  withholdingRate: number;
  accountCode: string;
  lineSubtotal: number;
  lineVat: number;
  lineWithholding: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  clientId: string;
  direction: 'ISSUED' | 'RECEIVED';
  kind: 'INVOICE' | 'CREDIT_NOTE' | 'QUOTE';
  status: 'DRAFT' | 'VALIDATED' | 'PAID' | 'PARTIAL' | 'OVERDUE';
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  contactTaxId: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  taxableBase: number;
  vatAmount: number;
  withholdingAmount: number;
  totalAmount: number;
  paidAmount: number;
  lines: InvoiceLine[];
  linkedDocumentId?: string;
  linkedJournalEntryId?: string;
  isRecurringTemplate?: boolean;
  notes?: string;
}

export interface ChartAccount {
  code: string;
  name: string;
  group: number; // PGC 1-7
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'EXPENSE' | 'REVENUE';
  normalBalance: 'DEBIT' | 'CREDIT';
}

export enum JournalEntryStatus {
  DRAFT = 'DRAFT',
  PROPOSED = 'PROPOSED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  clientId: string;
  entryNumber: number;
  date: string;
  periodId: string;
  concept: string;
  status: JournalEntryStatus;
  lines: JournalEntryLine[];
  sourceDocumentId?: string;
  sourceInvoiceId?: string;
  createdByUserId: string;
  approvedByUserId?: string;
  reversedEntryId?: string;
  auditNote?: string;
}

export interface AccountingPeriod {
  id: string;
  clientId: string;
  code: string; // e.g., '2026-Q3', '2026-Q4'
  label: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSING_REVIEW' | 'CLOSED';
  closedAt?: string;
  closedByUserId?: string;
}

export type TaxRuleValidationStatus = 'VERIFIED_DEMO_SIMPLIFIED' | 'PENDIENTE_VALIDACION_NORMATIVA';

export interface TaxModelDefinition {
  modelNumber: string;
  officialName: string;
  category: 'IVA' | 'IRPF' | 'SOCIEDADES' | 'INFORMATIVA' | 'CENSO' | 'PATRIMONIO';
  frequency: 'TRIMESTRAL' | 'ANUAL' | 'PAGO_FRACCIONADO' | 'EVENTUAL';
  applicabilityCriteria: string;
  typicalDueWindow: string;
  officialSourceUrl: string;
  ruleVersion: string;
  validationStatus: TaxRuleValidationStatus;
  requiredInformation: string[];
  exportFormat: 'Borrador PDF Demo' | 'Resumen CSV Demo' | 'Plantilla Visual';
  requiresProfessionalApproval: boolean;
}

export enum TaxDeclarationStatus {
  PENDING_DATA = 'PENDING_DATA',
  READY_TO_PREPARE = 'READY_TO_PREPARE',
  DRAFT = 'DRAFT',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  READY_FOR_EXTERNAL_FILING = 'READY_FOR_EXTERNAL_FILING',
  FILED_EXTERNALLY = 'FILED_EXTERNALLY',
  OVERDUE = 'OVERDUE',
}

export interface TaxObligation {
  id: string;
  clientId: string;
  modelNumber: string;
  proposedByEngine: boolean;
  approvedByAccountant: boolean;
  applicable: boolean;
  rationale: string;
  assignedAccountantId?: string;
}

export interface TaxDeclaration {
  id: string;
  clientId: string;
  modelNumber: string;
  periodCode: string; // '2026-Q4'
  dueDate: string;
  status: TaxDeclarationStatus;
  completenessPercent: number;
  missingDataNotes: string[];
  calculatedSummary: {
    outputVatBase?: number;
    outputVatAmount?: number;
    inputVatBase?: number;
    inputVatDeductible?: number;
    netResultAmount?: number;
    isSimplifiedCalculation: boolean;
  };
  linkedInvoiceIds: string[];
  linkedEntryIds: string[];
  reviewedByUserId?: string;
  approvedByUserId?: string;
  externalReceiptRef?: string;
  externalFiledAt?: string;
  updatedAt: string;
}

export interface BankAccount {
  id: string;
  clientId: string;
  bankName: string;
  alias: string;
  ibanMasked: string;
  accountType: 'OPERATING' | 'SAVINGS' | 'RESTRICTED_RESERVE';
  pgcAccountCode: string;
  currentBalance: number;
  availableBalance: number;
  restrictedAmount: number;
  lastUpdated: string;
  ownershipScope: 'BUSINESS' | 'PERSONAL';
}

export interface BankTransaction {
  id: string;
  clientId: string;
  bankAccountId: string;
  date: string;
  valueDate: string;
  description: string;
  counterparty: string;
  reference: string;
  amount: number; // positive = inflow, negative = outflow
  category: string;
  reconciliationStatus: 'UNMATCHED' | 'PROPOSED_MATCH' | 'RECONCILED' | 'EXCEPTION';
  proposedInvoiceId?: string;
  reconciledInvoiceId?: string;
  matchConfidence?: number;
  matchReason?: string;
  importBatchId?: string;
  fingerprint: string; // for duplicate detection
}

export interface BankImportBatch {
  id: string;
  clientId: string;
  bankAccountId: string;
  fileName: string;
  importedAt: string;
  importedByUserId: string;
  totalRows: number;
  importedRows: number;
  duplicateRowsRejected: number;
}

export interface FinancialAsset {
  id: string;
  clientId: string;
  scope: 'BUSINESS' | 'PERSONAL';
  name: string;
  category: 'CASH' | 'REAL_ESTATE' | 'EQUIPMENT' | 'INVESTMENT_MANUAL' | 'RECEIVABLES';
  currentValue: number;
  liquidityTier: 'IMMEDIATE' | 'SHORT_TERM' | 'ILLIQUID';
  notes: string;
}

export interface FinancialLiability {
  id: string;
  clientId: string;
  scope: 'BUSINESS' | 'PERSONAL';
  name: string;
  category: 'LOAN' | 'MORTGAGE' | 'CREDIT_LINE' | 'TAX_PAYABLE' | 'SUPPLIER_PAYABLE';
  outstandingBalance: number;
  monthlyPayment: number;
  interestRateApr: number;
  maturityDate: string;
}

export interface FinancialProfile {
  id: string;
  clientId: string;
  scope: 'BUSINESS' | 'PERSONAL';
  monthlyGrossIncome: number;
  monthlyFixedExpenses: number;
  monthlyVariableExpenses: number;
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'GROWTH';
  planningHorizonYears: number;
  emergencyReserveTargetMonths: number;
  constraintsNote: string;
  nextMeetingDate: string;
}

export interface GoalMilestone {
  id: string;
  label: string;
  targetAmount: number;
  reached: boolean;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  date: string;
  amount: number;
  sourceType: 'EVIDENCE_BANK_ACCOUNT' | 'MANUAL_ENTRY';
  attributedByUserName: string;
  note: string;
}

export interface FinancialGoal {
  id: string;
  clientId: string;
  scope: 'BUSINESS' | 'PERSONAL';
  name: string;
  category:
    | 'EMERGENCY_FUND'
    | 'EQUIPMENT'
    | 'EXPANSION'
    | 'DEBT_REDUCTION'
    | 'HOME_PURCHASE'
    | 'EDUCATION'
    | 'RETIREMENT'
    | 'SAVINGS';
  targetAmount: number;
  evidenceFundedAmount: number;
  manualFundedAmount: number;
  startDate: string;
  targetDate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  monthlyContributionPlanned: number;
  responsibleAdvisorId: string;
  linkedPlanId?: string;
  status: 'PROPOSED_BY_CLIENT' | 'ACTIVE' | 'AT_RISK' | 'COMPLETED';
  notes: string;
  milestones: GoalMilestone[];
  contributions: GoalContribution[];
}

export type ScenarioType = 'CONSERVATIVE' | 'BASE' | 'OPTIMISTIC';

export interface FinancialScenario {
  id: string;
  type: ScenarioType;
  label: string;
  annualIncomeGrowthRate: number;
  annualExpenseInflationRate: number;
  expectedAnnualReturnRate: number;
  monthlySavingsCapacity: number;
  projected12mBalance: number;
  projected36mBalance: number;
  projected60mBalance: number;
  assumptionsSummary: string;
}

export interface FinancialPlan {
  id: string;
  clientId: string;
  scope: 'BUSINESS' | 'PERSONAL' | 'CONSOLIDATED';
  title: string;
  advisorId: string;
  advisorName: string;
  status: 'DRAFT' | 'READY_FOR_PUBLICATION' | 'PUBLISHED';
  createdAt: string;
  publishedAt?: string;
  horizonMonths: number;
  baselineLiquidity: number;
  baselineMonthlySavingsCapacity: number;
  executiveNotes: string;
  disclaimer: string;
  scenarios: FinancialScenario[];
  linkedGoalIds: string[];
}

export interface ClientTask {
  id: string;
  clientId: string;
  title: string;
  description: string;
  type: 'DOCUMENT_REQUEST' | 'MISSING_INFO' | 'ACCOUNTING_REVIEW' | 'ADVISORY_ACTION';
  status: 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'RESOLVED';
  assignedToRole: 'CLIENT' | 'ACCOUNTANT' | 'ADVISOR';
  createdByUserId: string;
  createdByName: string;
  dueDate: string;
  linkedDocumentId?: string;
  createdAt: string;
}

export interface CollaborationMessage {
  id: string;
  clientId: string;
  authorUserId: string;
  authorName: string;
  authorRoleLabel: string;
  visibility: 'CLIENT_VISIBLE' | 'INTERNAL_ACCOUNTING' | 'INTERNAL_ADVISORY';
  category: 'DOCUMENT_REQUEST' | 'ACCOUNTING_NOTE' | 'ADVISOR_RECOMMENDATION' | 'CLIENT_RESPONSE';
  body: string;
  timestamp: string;
  linkedTaskId?: string;
}

export interface AppNotification {
  id: string;
  clientId?: string;
  targetUserId?: string;
  title: string;
  detail: string;
  severity: 'INFO' | 'WARNING' | 'ACTION_REQUIRED';
  read: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  organizationId: string;
  clientId?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}

export interface DemoPersona {
  id: string;
  label: string;
  subtitle: string;
  userId: string;
  roleId: string;
  organizationId: string;
  defaultClientId?: string;
  workspaceKind: 'CLIENT_PWA' | 'ACCOUNTING' | 'ADVISORY' | 'ADMIN';
}

export type FeatureMaturity =
  | 'FUNCTIONAL_DEMO'
  | 'SIMULATED_INTEGRATION'
  | 'PLANNED'
  | 'BLOCKED';

export interface FeatureRegistryItem {
  id: string;
  module: string;
  feature: string;
  status: FeatureMaturity;
  notes: string;
}

export interface VegenAppState {
  organizations: Organization[];
  roles: Role[];
  users: User[];
  memberships: Membership[];
  assignments: ProfessionalAssignment[];
  clientProfiles: ClientProfile[];
  documents: DocumentRecord[];
  extractionRules: ExtractionPreferenceRule[];
  contacts: Contact[];
  invoices: Invoice[];
  chartOfAccounts: ChartAccount[];
  accountingPeriods: AccountingPeriod[];
  journalEntries: JournalEntry[];
  taxModels: TaxModelDefinition[];
  taxObligations: TaxObligation[];
  taxDeclarations: TaxDeclaration[];
  bankAccounts: BankAccount[];
  bankImports: BankImportBatch[];
  bankTransactions: BankTransaction[];
  financialProfiles: FinancialProfile[];
  financialAssets: FinancialAsset[];
  financialLiabilities: FinancialLiability[];
  financialGoals: FinancialGoal[];
  financialPlans: FinancialPlan[];
  tasks: ClientTask[];
  messages: CollaborationMessage[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
  personas: DemoPersona[];
  activePersonaId: string;
  selectedClientId: string;
  simulatedChannels: {
    emailEnabled: boolean;
    emailAddress: string;
    whatsappEnabled: boolean;
    whatsappNumber: string;
  };
}
