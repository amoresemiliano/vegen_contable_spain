import {
  AccountingPeriod,
  AppNotification,
  AuditEvent,
  BankAccount,
  BankImportBatch,
  BankTransaction,
  ClientTask,
  CollaborationMessage,
  Contact,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  ExtractionPreferenceRule,
  FinancialAsset,
  FinancialGoal,
  FinancialLiability,
  FinancialPlan,
  FinancialProfile,
  Invoice,
  InvoiceLine,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  TaxDeclaration,
  TaxDeclarationStatus,
  TaxObligation,
  VegenAppState,
} from '../types/domain';
import { round2 } from '../domain/formatters';
import { buildScenarioProjections } from '../domain/planning';
import { calculateModel303Draft } from '../domain/tax';
import { makeBankTxFingerprint } from '../domain/treasury';
import {
  SEED_ASSIGNMENTS,
  SEED_CLIENT_PROFILES,
  SEED_MEMBERSHIPS,
  SEED_ORGANIZATIONS,
  SEED_PERSONAS,
  SEED_ROLES,
  SEED_USERS,
  SPANISH_CHART_OF_ACCOUNTS,
  SPANISH_TAX_MODEL_REGISTRY,
} from './catalogs';

function buildInvoiceLine(
  id: string,
  description: string,
  quantity: number,
  unitPrice: number,
  vatRate: number,
  withholdingRate: number,
  accountCode: string,
  discountPercent = 0
): InvoiceLine {
  const gross = round2(quantity * unitPrice);
  const lineSubtotal = round2(gross * (1 - discountPercent / 100));
  const lineVat = round2(lineSubtotal * (vatRate / 100));
  const lineWithholding = round2(lineSubtotal * (withholdingRate / 100));
  const lineTotal = round2(lineSubtotal + lineVat - lineWithholding);
  return {
    id,
    description,
    quantity,
    unitPrice,
    discountPercent,
    vatRate,
    withholdingRate,
    accountCode,
    lineSubtotal,
    lineVat,
    lineWithholding,
    lineTotal,
  };
}

function makeInvoice(params: {
  id: string;
  clientId: string;
  direction: 'ISSUED' | 'RECEIVED';
  status: Invoice['status'];
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  contactTaxId: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  lines: InvoiceLine[];
  paidAmount?: number;
  linkedDocumentId?: string;
  linkedJournalEntryId?: string;
}): Invoice {
  const taxableBase = round2(params.lines.reduce((s, l) => s + l.lineSubtotal, 0));
  const vatAmount = round2(params.lines.reduce((s, l) => s + l.lineVat, 0));
  const withholdingAmount = round2(params.lines.reduce((s, l) => s + l.lineWithholding, 0));
  const totalAmount = round2(taxableBase + vatAmount - withholdingAmount);
  const paidAmount =
    params.paidAmount !== undefined
      ? params.paidAmount
      : params.status === 'PAID'
      ? totalAmount
      : 0;

  return {
    id: params.id,
    clientId: params.clientId,
    direction: params.direction,
    kind: 'INVOICE',
    status: params.status,
    invoiceNumber: params.invoiceNumber,
    contactId: params.contactId,
    contactName: params.contactName,
    contactTaxId: params.contactTaxId,
    issueDate: params.issueDate,
    dueDate: params.dueDate,
    paymentMethod: params.paymentMethod,
    taxableBase,
    vatAmount,
    withholdingAmount,
    totalAmount,
    paidAmount,
    lines: params.lines,
    linkedDocumentId: params.linkedDocumentId,
    linkedJournalEntryId: params.linkedJournalEntryId,
  };
}

function makeJournalFromInvoice(
  entryId: string,
  entryNumber: number,
  inv: Invoice,
  periodId: string,
  status: JournalEntryStatus = JournalEntryStatus.POSTED
): JournalEntry {
  const lines: JournalEntryLine[] = [];
  const mainAccount = inv.lines[0]?.accountCode ?? (inv.direction === 'ISSUED' ? '7050' : '6290');
  const mainAccountObj = SPANISH_CHART_OF_ACCOUNTS.find((a) => a.code === mainAccount);
  const mainAccountName = mainAccountObj?.name ?? 'Cuenta PGC';

  if (inv.direction === 'ISSUED') {
    lines.push({
      id: `${entryId}-l1`,
      accountCode: '4300',
      accountName: 'Clientes',
      description: `Cobro pendiente ${inv.contactName}`,
      debit: inv.totalAmount,
      credit: 0,
    });
    if (inv.withholdingAmount > 0) {
      lines.push({
        id: `${entryId}-l1b`,
        accountCode: '4730',
        accountName: 'Hacienda Pública, retenciones y pagos a cuenta',
        description: `Retención IRPF soportada ${inv.invoiceNumber}`,
        debit: inv.withholdingAmount,
        credit: 0,
      });
    }
    lines.push({
      id: `${entryId}-l2`,
      accountCode: mainAccount,
      accountName: mainAccountName,
      description: `${inv.invoiceNumber} · ${inv.lines[0]?.description ?? 'Servicios'}`,
      debit: 0,
      credit: inv.taxableBase,
    });
    if (inv.vatAmount > 0) {
      lines.push({
        id: `${entryId}-l3`,
        accountCode: '4770',
        accountName: 'Hacienda Pública, IVA repercutido',
        description: `IVA repercutido ${inv.invoiceNumber}`,
        debit: 0,
        credit: inv.vatAmount,
      });
    }
  } else {
    lines.push({
      id: `${entryId}-l1`,
      accountCode: mainAccount,
      accountName: mainAccountName,
      description: `${inv.invoiceNumber} · ${inv.lines[0]?.description ?? 'Gasto'}`,
      debit: inv.taxableBase,
      credit: 0,
    });
    if (inv.vatAmount > 0) {
      lines.push({
        id: `${entryId}-l2`,
        accountCode: '4720',
        accountName: 'Hacienda Pública, IVA soportado',
        description: `IVA soportado ${inv.invoiceNumber}`,
        debit: inv.vatAmount,
        credit: 0,
      });
    }
    if (inv.withholdingAmount > 0) {
      lines.push({
        id: `${entryId}-l3`,
        accountCode: '4751',
        accountName: 'Hacienda Pública, acreedora por retenciones practicadas',
        description: `Retención IRPF ${inv.invoiceNumber}`,
        debit: 0,
        credit: inv.withholdingAmount,
      });
    }
    const payableAccount = mainAccount === '6000' ? '4000' : '4100';
    const payableName = mainAccount === '6000' ? 'Proveedores' : 'Acreedores por prestaciones de servicios';
    lines.push({
      id: `${entryId}-l4`,
      accountCode: payableAccount,
      accountName: payableName,
      description: `Obligación pago ${inv.contactName}`,
      debit: 0,
      credit: inv.totalAmount,
    });
  }

  return {
    id: entryId,
    clientId: inv.clientId,
    entryNumber,
    date: inv.issueDate,
    periodId,
    concept: `${inv.direction === 'ISSUED' ? 'Factura emitida' : 'Factura recibida'} ${inv.invoiceNumber} (${inv.contactName})`,
    status,
    lines,
    sourceDocumentId: inv.linkedDocumentId,
    sourceInvoiceId: inv.id,
    createdByUserId: 'u-accountant',
    approvedByUserId: status === JournalEntryStatus.POSTED || status === JournalEntryStatus.APPROVED ? 'u-accountant' : undefined,
  };
}

export function createInitialDemoState(): VegenAppState {
  const contacts: Contact[] = [
    { id: 'cnt-a-c1', clientId: 'client-a', kind: 'CUSTOMER', name: 'Grupo Solaria Energía Demo SL', taxId: 'B-90010011 DEMO', email: 'facturacion@solaria-demo.es', paymentTermDays: 30, defaultAccountCode: '4300' },
    { id: 'cnt-a-c2', clientId: 'client-a', kind: 'CUSTOMER', name: 'Atlántico Logística SA (Demo)', taxId: 'A-90010022 DEMO', email: 'cuentas@atlantico-demo.es', paymentTermDays: 30, defaultAccountCode: '4300' },
    { id: 'cnt-a-c3', clientId: 'client-a', kind: 'CUSTOMER', name: 'Clinica Vitalia Salud SL (Demo)', taxId: 'B-90010033 DEMO', email: 'admin@vitalia-demo.es', paymentTermDays: 15, defaultAccountCode: '4300' },
    { id: 'cnt-a-s1', clientId: 'client-a', kind: 'SUPPLIER', name: 'Nube Europea Cloud GmbH (Demo)', taxId: 'DE-90020011 DEMO', email: 'billing@nubeeuropea-demo.eu', paymentTermDays: 15, defaultAccountCode: '6290' },
    { id: 'cnt-a-s2', clientId: 'client-a', kind: 'SUPPLIER', name: 'Inmobiliaria Castellana Oficina SL (Demo)', taxId: 'B-90020022 DEMO', email: 'alquiler@castellana-demo.es', paymentTermDays: 5, defaultAccountCode: '6210' },
    { id: 'cnt-a-s3', clientId: 'client-a', kind: 'SUPPLIER', name: 'Iberia Telecomunicaciones Demo SA', taxId: 'A-90020033 DEMO', email: 'empresas@iberiatel-demo.es', paymentTermDays: 15, defaultAccountCode: '6280' },
    { id: 'cnt-a-s4', clientId: 'client-a', kind: 'SUPPLIER', name: 'Estudio Legal Serrano Abogados (Demo)', taxId: 'B-90020044 DEMO', email: 'despacho@serrano-demo.es', paymentTermDays: 30, defaultAccountCode: '6230' },
    { id: 'cnt-b-c1', clientId: 'client-b', kind: 'CUSTOMER', name: 'Eventos Corporativos Turia SL (Demo)', taxId: 'B-91010011 DEMO', email: 'eventos@turia-demo.es', paymentTermDays: 15, defaultAccountCode: '4300' },
    { id: 'cnt-b-s1', clientId: 'client-b', kind: 'SUPPLIER', name: 'Mercados Levante Alimentación SL (Demo)', taxId: 'B-91020011 DEMO', email: 'pedidos@levante-demo.es', paymentTermDays: 15, defaultAccountCode: '6000' },
    { id: 'cnt-b-s2', clientId: 'client-b', kind: 'SUPPLIER', name: 'Energía Mediterránea Demo SA', taxId: 'A-91020022 DEMO', email: 'facturas@enermed-demo.es', paymentTermDays: 10, defaultAccountCode: '6280' },
    { id: 'cnt-c-c1', clientId: 'client-c', kind: 'CUSTOMER', name: 'Editorial Sur Digital SL (Demo)', taxId: 'B-92010011 DEMO', email: 'pagos@editorialsur-demo.es', paymentTermDays: 30, defaultAccountCode: '4300' },
    { id: 'cnt-c-s1', clientId: 'client-c', kind: 'SUPPLIER', name: 'Coworking Triana Espacios SL (Demo)', taxId: 'B-92020011 DEMO', email: 'hola@triana-demo.es', paymentTermDays: 5, defaultAccountCode: '6210' },
  ];

  const accountingPeriods: AccountingPeriod[] = [
    { id: 'per-a-q3', clientId: 'client-a', code: '2026-Q3', label: '3T 2026 (Jul–Sep)', startDate: '2026-07-01', endDate: '2026-09-30', status: 'CLOSED', closedAt: '2026-10-22', closedByUserId: 'u-accountant' },
    { id: 'per-a-q4', clientId: 'client-a', code: '2026-Q4', label: '4T 2026 (Oct–Dic)', startDate: '2026-10-01', endDate: '2026-12-31', status: 'OPEN' },
    { id: 'per-b-q4', clientId: 'client-b', code: '2026-Q4', label: '4T 2026 (Oct–Dic)', startDate: '2026-10-01', endDate: '2026-12-31', status: 'OPEN' },
    { id: 'per-c-q4', clientId: 'client-c', code: '2026-Q4', label: '4T 2026 (Oct–Dic)', startDate: '2026-10-01', endDate: '2026-12-31', status: 'OPEN' },
  ];

  const invoices: Invoice[] = [];
  const journalEntries: JournalEntry[] = [];
  let entrySeq = 1;

  // --- CLIENT A: 12 Customer invoices (issued) & 14 Supplier invoices (received) ---
  const clientACustomerSpecs = [
    { n: 'F-2026-041', date: '2026-08-12', due: '2026-09-11', c: contacts[0], amt: 6400, desc: 'Consultoría Arquitectura Cloud (Agosto)', status: 'PAID' as const, per: 'per-a-q3' },
    { n: 'F-2026-042', date: '2026-09-05', due: '2026-10-05', c: contacts[1], amt: 4800, desc: 'Integración ERP y Cuadros de Mando', status: 'PAID' as const, per: 'per-a-q3' },
    { n: 'F-2026-043', date: '2026-09-20', due: '2026-10-20', c: contacts[2], amt: 3200, desc: 'Auditoría Seguridad Aplicaciones', status: 'PAID' as const, per: 'per-a-q3' },
    { n: 'F-2026-044', date: '2026-10-03', due: '2026-11-02', c: contacts[0], amt: 7200, desc: 'Desarrollo Plataforma Analítica Fase 1', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'F-2026-045', date: '2026-10-14', due: '2026-11-13', c: contacts[1], amt: 5400, desc: 'Automatización Procesos Logísticos', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'F-2026-046', date: '2026-10-28', due: '2026-11-27', c: contacts[2], amt: 3900, desc: 'Soporte Evolutivo Portal Paciente', status: 'VALIDATED' as const, per: 'per-a-q4' },
    { n: 'F-2026-047', date: '2026-11-04', due: '2026-12-04', c: contacts[0], amt: 8500, desc: 'Desarrollo Plataforma Analítica Fase 2', status: 'VALIDATED' as const, per: 'per-a-q4' },
    { n: 'F-2026-048', date: '2026-11-09', due: '2026-12-09', c: contacts[1], amt: 4100, desc: 'Mantenimiento Mensual Sistemas', status: 'VALIDATED' as const, per: 'per-a-q4' },
    { n: 'F-2026-049', date: '2026-11-15', due: '2026-11-30', c: contacts[2], amt: 2950, desc: 'Migración Base de Datos MySQL', status: 'OVERDUE' as const, per: 'per-a-q4' },
    { n: 'F-2026-050', date: '2026-11-18', due: '2026-12-18', c: contacts[0], amt: 5600, desc: 'Licenciamiento y Formación Equipo', status: 'VALIDATED' as const, per: 'per-a-q4' },
  ];

  clientACustomerSpecs.forEach((sp, idx) => {
    const invId = `inv-a-c-${idx + 1}`;
    const docId = `doc-a-c-${idx + 1}`;
    const jeId = `je-a-c-${idx + 1}`;
    const line = buildInvoiceLine(`${invId}-l1`, sp.desc, 1, sp.amt, 21, 0, '7050');
    const inv = makeInvoice({
      id: invId,
      clientId: 'client-a',
      direction: 'ISSUED',
      status: sp.status,
      invoiceNumber: sp.n,
      contactId: sp.c.id,
      contactName: sp.c.name,
      contactTaxId: sp.c.taxId,
      issueDate: sp.date,
      dueDate: sp.due,
      paymentMethod: 'Transferencia 30 días',
      lines: [line],
      linkedDocumentId: docId,
      linkedJournalEntryId: jeId,
    });
    invoices.push(inv);
    journalEntries.push(makeJournalFromInvoice(jeId, entrySeq++, inv, sp.per, JournalEntryStatus.POSTED));
  });

  const clientASupplierSpecs = [
    { n: 'PROV-NE-881', date: '2026-08-18', due: '2026-09-02', c: contacts[3], amt: 680, vat: 21, irpf: 0, acc: '6290', desc: 'Infraestructura Cloud Servidores Agosto', status: 'PAID' as const, per: 'per-a-q3' },
    { n: 'PROV-ALQ-09', date: '2026-09-01', due: '2026-09-05', c: contacts[4], amt: 1850, vat: 21, irpf: 19, acc: '6210', desc: 'Alquiler Oficina Madrid Septiembre', status: 'PAID' as const, per: 'per-a-q3' },
    { n: 'PROV-TEL-301', date: '2026-09-12', due: '2026-09-27', c: contacts[5], amt: 240, vat: 21, irpf: 0, acc: '6280', desc: 'Fibra Óptica y Líneas Corporativas', status: 'PAID' as const, per: 'per-a-q3' },
    { n: 'PROV-NE-902', date: '2026-10-02', due: '2026-10-17', c: contacts[3], amt: 740, vat: 21, irpf: 0, acc: '6290', desc: 'Infraestructura Cloud Servidores Octubre', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'PROV-ALQ-10', date: '2026-10-01', due: '2026-10-05', c: contacts[4], amt: 1850, vat: 21, irpf: 19, acc: '6210', desc: 'Alquiler Oficina Madrid Octubre', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'PROV-LEG-14', date: '2026-10-16', due: '2026-11-15', c: contacts[6], amt: 1200, vat: 21, irpf: 15, acc: '6230', desc: 'Revisión Contratos Mercantiles RGPD', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'PROV-TEL-329', date: '2026-10-20', due: '2026-11-04', c: contacts[5], amt: 255, vat: 21, irpf: 0, acc: '6280', desc: 'Telecomunicaciones Octubre', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'PROV-ALQ-11', date: '2026-11-01', due: '2026-11-05', c: contacts[4], amt: 1850, vat: 21, irpf: 19, acc: '6210', desc: 'Alquiler Oficina Madrid Noviembre', status: 'PAID' as const, per: 'per-a-q4' },
    { n: 'PROV-NE-945', date: '2026-11-04', due: '2026-11-19', c: contacts[3], amt: 820, vat: 21, irpf: 0, acc: '6290', desc: 'Infraestructura Cloud Noviembre', status: 'VALIDATED' as const, per: 'per-a-q4' },
    { n: 'PROV-LEG-22', date: '2026-11-10', due: '2026-12-10', c: contacts[6], amt: 950, vat: 21, irpf: 15, acc: '6230', desc: 'Asesoramiento Pacto de Socios', status: 'VALIDATED' as const, per: 'per-a-q4' },
    { n: 'PROV-TEL-355', date: '2026-11-12', due: '2026-11-27', c: contacts[5], amt: 260, vat: 21, irpf: 0, acc: '6280', desc: 'Fibra y Telefonía Noviembre', status: 'VALIDATED' as const, per: 'per-a-q4' },
    { n: 'PROV-EQ-019', date: '2026-11-14', due: '2026-11-29', c: contacts[3], amt: 1480, vat: 21, irpf: 0, acc: '6290', desc: 'Licencias Anuales Suite Desarrollo', status: 'VALIDATED' as const, per: 'per-a-q4' },
  ];

  clientASupplierSpecs.forEach((sp, idx) => {
    const invId = `inv-a-s-${idx + 1}`;
    const docId = `doc-a-s-${idx + 1}`;
    const jeId = `je-a-s-${idx + 1}`;
    const line = buildInvoiceLine(`${invId}-l1`, sp.desc, 1, sp.amt, sp.vat, sp.irpf, sp.acc);
    const inv = makeInvoice({
      id: invId,
      clientId: 'client-a',
      direction: 'RECEIVED',
      status: sp.status,
      invoiceNumber: sp.n,
      contactId: sp.c.id,
      contactName: sp.c.name,
      contactTaxId: sp.c.taxId,
      issueDate: sp.date,
      dueDate: sp.due,
      paymentMethod: 'Domiciliación / Transferencia',
      lines: [line],
      linkedDocumentId: docId,
      linkedJournalEntryId: idx < 10 ? jeId : undefined, // leave last 2 unposted for demo review!
    });
    invoices.push(inv);
    if (idx < 10) {
      journalEntries.push(makeJournalFromInvoice(jeId, entrySeq++, inv, sp.per, JournalEntryStatus.POSTED));
    }
  });

  // --- CLIENT B: Taberna El Mirador Hostelería SL (10 customer invoices, 12 supplier invoices) ---
  for (let i = 1; i <= 10; i++) {
    const day = String((i * 2) % 26 + 1).padStart(2, '0');
    const month = i <= 4 ? '10' : '11';
    const invId = `inv-b-c-${i}`;
    const jeId = `je-b-c-${i}`;
    const amt = 1150 + i * 240;
    const line = buildInvoiceLine(`${invId}-l1`, `Servicio catering y sala lote #${i}`, 1, amt, 10, 0, '7000');
    const inv = makeInvoice({
      id: invId,
      clientId: 'client-b',
      direction: 'ISSUED',
      status: i <= 7 ? 'PAID' : 'VALIDATED',
      invoiceNumber: `MIR-2026-${100 + i}`,
      contactId: contacts[7].id,
      contactName: contacts[7].name,
      contactTaxId: contacts[7].taxId,
      issueDate: `2026-${month}-${day}`,
      dueDate: `2026-${month}-${day}`,
      paymentMethod: 'TPV / Transferencia',
      lines: [line],
      linkedJournalEntryId: i <= 6 ? jeId : undefined,
    });
    invoices.push(inv);
    if (i <= 6) {
      journalEntries.push(makeJournalFromInvoice(jeId, entrySeq++, inv, 'per-b-q4', JournalEntryStatus.POSTED));
    }
  }

  for (let i = 1; i <= 12; i++) {
    const day = String((i * 2) % 25 + 1).padStart(2, '0');
    const month = i <= 5 ? '10' : '11';
    const isFood = i % 3 !== 0;
    const contact = isFood ? contacts[8] : contacts[9];
    const amt = isFood ? 640 + i * 75 : 490 + i * 30;
    const vat = isFood ? 10 : 21;
    const acc = isFood ? '6000' : '6280';
    const invId = `inv-b-s-${i}`;
    const jeId = `je-b-s-${i}`;
    const line = buildInvoiceLine(
      `${invId}-l1`,
      isFood ? `Aprovisionamiento cocina y bodega #${i}` : `Suministro eléctrico cocina industrial #${i}`,
      1,
      amt,
      vat,
      0,
      acc
    );
    const inv = makeInvoice({
      id: invId,
      clientId: 'client-b',
      direction: 'RECEIVED',
      status: i <= 8 ? 'PAID' : 'VALIDATED',
      invoiceNumber: `PROV-MIR-${200 + i}`,
      contactId: contact.id,
      contactName: contact.name,
      contactTaxId: contact.taxId,
      issueDate: `2026-${month}-${day}`,
      dueDate: `2026-11-${day}`,
      paymentMethod: 'Recibo domiciliado',
      lines: [line],
      linkedJournalEntryId: i <= 5 ? jeId : undefined,
    });
    invoices.push(inv);
    if (i <= 5) {
      journalEntries.push(makeJournalFromInvoice(jeId, entrySeq++, inv, 'per-b-q4', JournalEntryStatus.POSTED));
    }
  }

  // --- CLIENT C: Elena Navarro Diseño (6 customer invoices, 8 supplier invoices) ---
  for (let i = 1; i <= 6; i++) {
    const day = String(i * 4).padStart(2, '0');
    const month = i <= 3 ? '10' : '11';
    const invId = `inv-c-c-${i}`;
    const jeId = `je-c-c-${i}`;
    const amt = 1400 + i * 250;
    const line = buildInvoiceLine(`${invId}-l1`, `Diseño UX/UI Sprint #${i}`, 1, amt, 21, 15, '7050');
    const inv = makeInvoice({
      id: invId,
      clientId: 'client-c',
      direction: 'ISSUED',
      status: i <= 4 ? 'PAID' : 'VALIDATED',
      invoiceNumber: `ELN-2026-0${i}`,
      contactId: contacts[10].id,
      contactName: contacts[10].name,
      contactTaxId: contacts[10].taxId,
      issueDate: `2026-${month}-${day}`,
      dueDate: `2026-11-${day}`,
      paymentMethod: 'Transferencia 30 días',
      lines: [line],
      linkedJournalEntryId: i <= 3 ? jeId : undefined,
    });
    invoices.push(inv);
    if (i <= 3) {
      journalEntries.push(makeJournalFromInvoice(jeId, entrySeq++, inv, 'per-c-q4', JournalEntryStatus.POSTED));
    }
  }

  for (let i = 1; i <= 8; i++) {
    const day = String(i * 3).padStart(2, '0');
    const month = i <= 4 ? '10' : '11';
    const invId = `inv-c-s-${i}`;
    const amt = 180 + i * 35;
    const line = buildInvoiceLine(`${invId}-l1`, `Cuota coworking / herramientas diseño #${i}`, 1, amt, 21, 0, '6210');
    invoices.push(
      makeInvoice({
        id: invId,
        clientId: 'client-c',
        direction: 'RECEIVED',
        status: i <= 6 ? 'PAID' : 'VALIDATED',
        invoiceNumber: `COW-2026-${30 + i}`,
        contactId: contacts[11].id,
        contactName: contacts[11].name,
        contactTaxId: contacts[11].taxId,
        issueDate: `2026-${month}-${day}`,
        dueDate: `2026-11-${day}`,
        paymentMethod: 'Tarjeta profesional',
        lines: [line],
      })
    );
  }
  // Total: 26 customer invoices (10+10+6) & 32 supplier invoices (12+12+8) = 58 invoices!

  // Add payroll journal entry for Client A so P&L and Balance Sheet feel authentically Spanish PGC
  journalEntries.push({
    id: 'je-a-payroll-10',
    clientId: 'client-a',
    entryNumber: entrySeq++,
    date: '2026-10-31',
    periodId: 'per-a-q4',
    concept: 'Nóminas personal técnico Octubre 2026 (VEGEN Digital SL)',
    status: JournalEntryStatus.POSTED,
    createdByUserId: 'u-accountant',
    approvedByUserId: 'u-accountant',
    lines: [
      { id: 'je-p-1', accountCode: '6400', accountName: 'Sueldos y salarios', description: 'Salario bruto Octubre', debit: 8400, credit: 0 },
      { id: 'je-p-2', accountCode: '6420', accountName: 'Seguridad Social a cargo de la empresa', description: 'SS Empresa Octubre', debit: 2520, credit: 0 },
      { id: 'je-p-3', accountCode: '4751', accountName: 'Hacienda Pública, acreedora por retenciones practicadas', description: 'IRPF Nóminas Octubre', debit: 0, credit: 1680 },
      { id: 'je-p-4', accountCode: '5720', accountName: 'Bancos e instituciones de crédito c/c vista, euros', description: 'Pago líquido nóminas y SS', debit: 0, credit: 9240 },
    ],
  });

  // Add opening balance entry for Client A so Balance Sheet balances cleanly
  journalEntries.push({
    id: 'je-a-opening',
    clientId: 'client-a',
    entryNumber: entrySeq++,
    date: '2026-07-01',
    periodId: 'per-a-q3',
    concept: 'Asiento de apertura saldos iniciales ejercicio demo 2026',
    status: JournalEntryStatus.POSTED,
    createdByUserId: 'u-accountant',
    approvedByUserId: 'u-accountant',
    lines: [
      { id: 'je-op-1', accountCode: '5720', accountName: 'Bancos e instituciones de crédito c/c vista, euros', description: 'Saldo inicial bancos', debit: 42500, credit: 0 },
      { id: 'je-op-2', accountCode: '2170', accountName: 'Equipos para procesos de información', description: 'Equipos informáticos oficina', debit: 14500, credit: 0 },
      { id: 'je-op-3', accountCode: '1000', accountName: 'Capital social / Patrimonio neto', description: 'Capital social suscrito', debit: 0, credit: 30000 },
      { id: 'je-op-4', accountCode: '1130', accountName: 'Reservas voluntarias', description: 'Reservas acumuladas', debit: 0, credit: 15000 },
      { id: 'je-op-5', accountCode: '1700', accountName: 'Deudas a largo plazo con entidades de crédito', description: 'Préstamo ICO crecimiento', debit: 0, credit: 12000 },
    ],
  });

  // --- DOCUMENTS (including NEEDS_REVIEW exceptions and duplicate candidate) ---
  const documents: DocumentRecord[] = [
    {
      id: 'doc-review-1',
      organizationId: 'org-client-a',
      clientId: 'client-a',
      type: DocumentType.SUPPLIER_INVOICE,
      fileName: 'factura_cloud_aws_nov2026.pdf',
      mimeType: 'application/pdf',
      fileSizeKb: 412,
      uploadedAt: '2026-11-18T10:25:00Z',
      uploadedByUserId: 'u-client-a-admin',
      uploadedByName: 'Alejandro Vega',
      sourceChannel: 'PWA_CAMERA',
      accountingPeriod: '2026-Q4',
      status: DocumentStatus.NEEDS_REVIEW,
      previewSummary: 'Factura servicios nube europea — NIF proveedor con baja confianza OCR e IVA 21% pendiente de confirmar inversión sujeto pasivo.',
      extraction: {
        id: 'ext-rev-1',
        documentId: 'doc-review-1',
        counterpartyName: 'Nube Europea Cloud GmbH (Demo)',
        counterpartyTaxId: 'DE-90020011?',
        invoiceNumber: 'NE-2026-991',
        issueDate: '2026-11-17',
        dueDate: '2026-12-02',
        currency: 'EUR',
        taxableBase: 890,
        vatRate: 21,
        vatAmount: 186.9,
        withholdingAmount: 0,
        totalAmount: 1076.9,
        paymentMethod: 'Tarjeta corporativa',
        description: 'Alojamiento servidores producción Noviembre',
        suggestedCategory: 'Servicios cloud y hosting',
        suggestedAccountCode: '6290',
        overallConfidence: 0.78,
        fieldConfidences: [
          { field: 'counterpartyTaxId', confidence: 0.61, uncertain: true, reason: 'Carácter final poco legible en captura móvil' },
          { field: 'vatRate', confidence: 0.72, uncertain: true, reason: 'Proveedor intracomunitario: verificar tratamiento IVA' },
          { field: 'totalAmount', confidence: 0.96, uncertain: false },
        ],
      },
      reviewHistory: [],
    },
    {
      id: 'doc-review-2',
      organizationId: 'org-client-a',
      clientId: 'client-a',
      type: DocumentType.SUPPLIER_INVOICE,
      fileName: 'duplicado_iberiatel_oct.pdf',
      mimeType: 'application/pdf',
      fileSizeKb: 285,
      uploadedAt: '2026-11-19T08:40:00Z',
      uploadedByUserId: 'u-client-a-collab',
      uploadedByName: 'Marta Ruiz',
      sourceChannel: 'WEB_UPLOAD',
      accountingPeriod: '2026-Q4',
      status: DocumentStatus.NEEDS_REVIEW,
      previewSummary: 'Posible factura duplicada detectada automáticamente frente a PROV-TEL-329 (mismo proveedor e importe 308,55 EUR).',
      extraction: {
        id: 'ext-rev-2',
        documentId: 'doc-review-2',
        counterpartyName: 'Iberia Telecomunicaciones Demo SA',
        counterpartyTaxId: 'A-90020033 DEMO',
        invoiceNumber: 'PROV-TEL-329',
        issueDate: '2026-10-20',
        dueDate: '2026-11-04',
        currency: 'EUR',
        taxableBase: 255,
        vatRate: 21,
        vatAmount: 53.55,
        withholdingAmount: 0,
        totalAmount: 308.55,
        paymentMethod: 'Domiciliación bancaria',
        description: 'Telecomunicaciones Octubre (Posible duplicado)',
        suggestedCategory: 'Suministros telecomunicaciones',
        suggestedAccountCode: '6280',
        overallConfidence: 0.91,
        duplicateCandidateDocId: 'doc-a-s-7',
        fieldConfidences: [
          { field: 'invoiceNumber', confidence: 0.98, uncertain: true, reason: 'Número de factura coincide exactamente con documento ya contabilizado' },
        ],
      },
      reviewHistory: [],
    },
    {
      id: 'doc-review-3',
      organizationId: 'org-client-b',
      clientId: 'client-b',
      type: DocumentType.EXPENSE_RECEIPT,
      fileName: 'ticket_ferreteria_cocina.jpg',
      mimeType: 'image/jpeg',
      fileSizeKb: 640,
      uploadedAt: '2026-11-19T14:10:00Z',
      uploadedByUserId: 'u-client-b-admin',
      uploadedByName: 'Raúl Paredes',
      sourceChannel: 'PWA_CAMERA',
      accountingPeriod: '2026-Q4',
      status: DocumentStatus.EXTRACTED,
      previewSummary: 'Ticket de menaje y reposición cocina capturado desde móvil.',
      extraction: {
        id: 'ext-rev-3',
        documentId: 'doc-review-3',
        counterpartyName: 'Suministros Hosteleros Valencia SL (Demo)',
        counterpartyTaxId: 'B-91033311 DEMO',
        invoiceNumber: 'T-88412',
        issueDate: '2026-11-18',
        dueDate: '2026-11-18',
        currency: 'EUR',
        taxableBase: 145,
        vatRate: 21,
        vatAmount: 30.45,
        withholdingAmount: 0,
        totalAmount: 175.45,
        paymentMethod: 'Tarjeta empresa',
        description: 'Menaje acero inoxidable cocina',
        suggestedCategory: 'Reposición utillaje',
        suggestedAccountCode: '6290',
        overallConfidence: 0.84,
        fieldConfidences: [
          { field: 'taxableBase', confidence: 0.74, uncertain: true, reason: 'Ticket térmico con contraste medio' },
        ],
      },
      reviewHistory: [],
    },
    {
      id: 'doc-a-s-7',
      organizationId: 'org-client-a',
      clientId: 'client-a',
      type: DocumentType.SUPPLIER_INVOICE,
      fileName: 'iberiatel_oct_2026.pdf',
      mimeType: 'application/pdf',
      fileSizeKb: 310,
      uploadedAt: '2026-10-21T09:15:00Z',
      uploadedByUserId: 'u-client-a-admin',
      uploadedByName: 'Alejandro Vega',
      sourceChannel: 'WEB_UPLOAD',
      accountingPeriod: '2026-Q4',
      status: DocumentStatus.ACCOUNTED,
      linkedInvoiceId: 'inv-a-s-7',
      linkedJournalEntryId: 'je-a-s-7',
      previewSummary: 'Factura telecomunicaciones Octubre contabilizada en cuenta 6280.',
      extraction: {
        id: 'ext-ok-7',
        documentId: 'doc-a-s-7',
        counterpartyName: 'Iberia Telecomunicaciones Demo SA',
        counterpartyTaxId: 'A-90020033 DEMO',
        invoiceNumber: 'PROV-TEL-329',
        issueDate: '2026-10-20',
        dueDate: '2026-11-04',
        currency: 'EUR',
        taxableBase: 255,
        vatRate: 21,
        vatAmount: 53.55,
        withholdingAmount: 0,
        totalAmount: 308.55,
        paymentMethod: 'Domiciliación',
        description: 'Telecomunicaciones Octubre',
        suggestedCategory: 'Suministros',
        suggestedAccountCode: '6280',
        overallConfidence: 0.97,
        fieldConfidences: [],
      },
      reviewHistory: [
        {
          id: 'rev-log-1',
          documentId: 'doc-a-s-7',
          reviewerUserId: 'u-accountant',
          reviewerName: 'Lucía Serrano',
          timestamp: '2026-10-22T11:00:00Z',
          action: 'APPROVED',
          changesSummary: 'Validado y contabilizado en asiento #17.',
        },
      ],
    },
    {
      id: 'doc-c-pending-1',
      organizationId: 'org-client-c',
      clientId: 'client-c',
      type: DocumentType.SUPPLIER_INVOICE,
      fileName: 'adobe_creative_nov2026.pdf',
      mimeType: 'application/pdf',
      fileSizeKb: 204,
      uploadedAt: '2026-11-16T17:20:00Z',
      uploadedByUserId: 'u-client-c',
      uploadedByName: 'Elena Navarro',
      sourceChannel: 'PWA_CAMERA',
      accountingPeriod: '2026-Q4',
      status: DocumentStatus.NEEDS_REVIEW,
      previewSummary: 'Suscripción software diseño — revisar deducibilidad IVA.',
      extraction: {
        id: 'ext-c-1',
        documentId: 'doc-c-pending-1',
        counterpartyName: 'Creative Suite Irlanda Ltd (Demo)',
        counterpartyTaxId: 'IE-88001122 DEMO',
        invoiceNumber: 'CS-2026-7712',
        issueDate: '2026-11-15',
        dueDate: '2026-11-15',
        currency: 'EUR',
        taxableBase: 64.99,
        vatRate: 21,
        vatAmount: 13.65,
        withholdingAmount: 0,
        totalAmount: 78.64,
        paymentMethod: 'Tarjeta débito',
        description: 'Licencia mensual herramientas diseño',
        suggestedCategory: 'Software profesional',
        suggestedAccountCode: '6290',
        overallConfidence: 0.81,
        fieldConfidences: [
          { field: 'vatRate', confidence: 0.65, uncertain: true, reason: 'Factura emitida en Irlanda: confirmar ROI' },
        ],
      },
      reviewHistory: [],
    },
  ];

  const extractionRules: ExtractionPreferenceRule[] = [
    {
      id: 'rule-1',
      clientId: 'client-a',
      supplierTaxIdPattern: 'A-90020033',
      supplierName: 'Iberia Telecomunicaciones Demo SA',
      preferredAccountCode: '6280',
      preferredCategory: 'Suministros telecomunicaciones',
      preferredVatRate: 21,
      createdFromDocumentId: 'doc-a-s-7',
      createdByUserId: 'u-accountant',
      createdAt: '2026-10-22T11:02:00Z',
      note: 'Regla explícita: asignar siempre cuenta 6280 (Suministros) para este proveedor.',
    },
  ];

  // --- BANK ACCOUNTS & 84 COHERENT TRANSACTIONS ---
  const bankAccounts: BankAccount[] = [
    {
      id: 'ba-a-1',
      clientId: 'client-a',
      bankName: 'Banco Atlántico Demo',
      alias: 'Cuenta Operativa Principal SL',
      ibanMasked: 'ES91 •••• •••• •••• 4412',
      accountType: 'OPERATING',
      pgcAccountCode: '5720',
      currentBalance: 64850.4,
      availableBalance: 57350.4,
      restrictedAmount: 7500, // Reserva fiscal IVA/IS
      lastUpdated: '2026-11-19',
      ownershipScope: 'BUSINESS',
    },
    {
      id: 'ba-a-2',
      clientId: 'client-a',
      bankName: 'Banca Digital Ibérica Demo',
      alias: 'Cuenta Reserva Impuestos y Crecimiento',
      ibanMasked: 'ES44 •••• •••• •••• 8891',
      accountType: 'RESTRICTED_RESERVE',
      pgcAccountCode: '5720',
      currentBalance: 18500,
      availableBalance: 12000,
      restrictedAmount: 6500,
      lastUpdated: '2026-11-19',
      ownershipScope: 'BUSINESS',
    },
    {
      id: 'ba-b-1',
      clientId: 'client-b',
      bankName: 'Caixa Levante Demo',
      alias: 'Cuenta Restaurante El Mirador',
      ibanMasked: 'ES12 •••• •••• •••• 3019',
      accountType: 'OPERATING',
      pgcAccountCode: '5720',
      currentBalance: 22410.75,
      availableBalance: 19410.75,
      restrictedAmount: 3000,
      lastUpdated: '2026-11-19',
      ownershipScope: 'BUSINESS',
    },
    {
      id: 'ba-c-1',
      clientId: 'client-c',
      bankName: 'Banco Sur Demo',
      alias: 'Cuenta Profesional Autónoma',
      ibanMasked: 'ES77 •••• •••• •••• 5520',
      accountType: 'OPERATING',
      pgcAccountCode: '5720',
      currentBalance: 14920.5,
      availableBalance: 12920.5,
      restrictedAmount: 2000,
      lastUpdated: '2026-11-19',
      ownershipScope: 'BUSINESS',
    },
    {
      id: 'ba-d-1',
      clientId: 'client-d',
      bankName: 'Banco Norte Personal Demo',
      alias: 'Cuenta Corriente Hogar',
      ibanMasked: 'ES31 •••• •••• •••• 7701',
      accountType: 'OPERATING',
      pgcAccountCode: '5720',
      currentBalance: 19400,
      availableBalance: 19400,
      restrictedAmount: 0,
      lastUpdated: '2026-11-19',
      ownershipScope: 'PERSONAL',
    },
  ];

  const bankTransactions: BankTransaction[] = [];
  let txCounter = 1;

  // Generate matched transactions for paid invoices + unmatched/proposed/exception transactions to reach 84 total
  for (const inv of invoices) {
    const targetBankId =
      inv.clientId === 'client-a'
        ? 'ba-a-1'
        : inv.clientId === 'client-b'
        ? 'ba-b-1'
        : 'ba-c-1';

    if (inv.status === 'PAID') {
      const signedAmt = inv.direction === 'ISSUED' ? inv.totalAmount : -inv.totalAmount;
      const ref = `${inv.invoiceNumber}`;
      const desc = `${inv.direction === 'ISSUED' ? 'TRANSF RECIBIDA' : 'ADEUDO'} ${inv.invoiceNumber} ${inv.contactName}`;
      bankTransactions.push({
        id: `tx-${txCounter++}`,
        clientId: inv.clientId,
        bankAccountId: targetBankId,
        date: inv.dueDate,
        valueDate: inv.dueDate,
        description: desc,
        counterparty: inv.contactName,
        reference: ref,
        amount: signedAmt,
        category: inv.direction === 'ISSUED' ? 'Cobro de clientes' : 'Pago a proveedores',
        reconciliationStatus: 'RECONCILED',
        reconciledInvoiceId: inv.id,
        matchConfidence: 0.99,
        matchReason: 'Importe exacto · Referencia de factura coincidente',
        fingerprint: makeBankTxFingerprint(inv.dueDate, signedAmt, ref, desc),
      });
    }
  }

  // Add proposed matches and explicit reconciliation exceptions for Client A & B so Journey 3 is rich!
  const unlinkedClientAInv = invoices.find((i) => i.id === 'inv-a-c-6'); // F-2026-046: 3900 + 21% = 4719.00
  if (unlinkedClientAInv) {
    bankTransactions.push({
      id: `tx-${txCounter++}`,
      clientId: 'client-a',
      bankAccountId: 'ba-a-1',
      date: '2026-11-18',
      valueDate: '2026-11-18',
      description: `TRANSF CLINICA VITALIA ${unlinkedClientAInv.invoiceNumber}`,
      counterparty: 'Clinica Vitalia Salud SL',
      reference: unlinkedClientAInv.invoiceNumber,
      amount: unlinkedClientAInv.totalAmount,
      category: 'Cobro pendiente de conciliar',
      reconciliationStatus: 'PROPOSED_MATCH',
      proposedInvoiceId: unlinkedClientAInv.id,
      matchConfidence: 0.96,
      matchReason: 'Importe exacto · Referencia coincidente',
      fingerprint: `2026-11-18|${unlinkedClientAInv.totalAmount.toFixed(2)}|${unlinkedClientAInv.invoiceNumber}|client-a`,
    });
  }

  const unlinkedSupA = invoices.find((i) => i.id === 'inv-a-s-9'); // PROV-NE-945: 820 + 21% = 992.20
  if (unlinkedSupA) {
    bankTransactions.push({
      id: `tx-${txCounter++}`,
      clientId: 'client-a',
      bankAccountId: 'ba-a-1',
      date: '2026-11-19',
      valueDate: '2026-11-19',
      description: 'CARGO TARJETA NUBE EUROPEA CLOUD',
      counterparty: 'Nube Europea Cloud',
      reference: 'CARD-99220',
      amount: -unlinkedSupA.totalAmount,
      category: 'Servicios cloud',
      reconciliationStatus: 'PROPOSED_MATCH',
      proposedInvoiceId: unlinkedSupA.id,
      matchConfidence: 0.78,
      matchReason: 'Importe exacto · Contraparte coincidente (sin nº factura en extracto)',
      fingerprint: `2026-11-19|${(-unlinkedSupA.totalAmount).toFixed(2)}|CARD-99220|client-a`,
    });
  }

  // Reconciliation exceptions (ambiguous / missing doc / commission)
  const extraTxs: Omit<BankTransaction, 'id' | 'fingerprint'>[] = [
    { clientId: 'client-a', bankAccountId: 'ba-a-1', date: '2026-11-17', valueDate: '2026-11-17', description: 'COMISIÓN MANTENIMIENTO CUENTA Y TRANSFERENCIAS', counterparty: 'Banco Atlántico Demo', reference: 'COM-1126', amount: -42.5, category: 'Comisiones bancarias', reconciliationStatus: 'EXCEPTION', matchReason: 'Sin factura vinculada: requiere contabilización directa a cuenta 626' },
    { clientId: 'client-a', bankAccountId: 'ba-a-1', date: '2026-11-16', valueDate: '2026-11-16', description: 'ABONO PARCIAL SIN REFERENCIA CLIENTE', counterparty: 'Transferencia Varios', reference: 'SIN-REF-44', amount: 1500.0, category: 'Cobros por identificar', reconciliationStatus: 'EXCEPTION', matchReason: 'Importe parcial ambiguo: no coincide exactamente con ninguna factura abierta' },
    { clientId: 'client-a', bankAccountId: 'ba-a-1', date: '2026-10-31', valueDate: '2026-10-31', description: 'REMESA NÓMINAS OCTUBRE VEGEN DIGITAL', counterparty: 'Empleados VEGEN', reference: 'NOM-2026-10', amount: -9240.0, category: 'Nóminas y SS', reconciliationStatus: 'RECONCILED', matchReason: 'Vinculado a asiento de nóminas Octubre' },
    { clientId: 'client-a', bankAccountId: 'ba-a-2', date: '2026-10-15', valueDate: '2026-10-15', description: 'TRASPASO INTERNO RESERVA FISCAL 4T', counterparty: 'VEGEN Digital SL', reference: 'TRASP-01', amount: 4500.0, category: 'Traspaso interno', reconciliationStatus: 'RECONCILED', matchReason: 'Movimiento entre cuentas propias' },
    { clientId: 'client-b', bankAccountId: 'ba-b-1', date: '2026-11-18', valueDate: '2026-11-18', description: 'LIQUIDACIÓN TPV DIARIA TURNO NOCHE', counterparty: 'RedSys TPV Demo', reference: 'TPV-1118', amount: 1840.5, category: 'Ventas TPV sala', reconciliationStatus: 'UNMATCHED' },
    { clientId: 'client-b', bankAccountId: 'ba-b-1', date: '2026-11-17', valueDate: '2026-11-17', description: 'LIQUIDACIÓN TPV DIARIA TURNO COMIDA', counterparty: 'RedSys TPV Demo', reference: 'TPV-1117', amount: 1390.2, category: 'Ventas TPV sala', reconciliationStatus: 'UNMATCHED' },
    { clientId: 'client-b', bankAccountId: 'ba-b-1', date: '2026-11-15', valueDate: '2026-11-15', description: 'CARGO SEGURIDAD SOCIAL TC1 HOSTELERÍA', counterparty: 'TGSS Demo', reference: 'TGSS-1126', amount: -2480.0, category: 'Seguridad Social', reconciliationStatus: 'EXCEPTION', matchReason: 'Cargo oficial sin documento TC1 adjunto en bandeja' },
  ];

  // Add personal & household transactions for Client D and additional business ops to surpass 80 transactions cleanly
  for (let m = 1; m <= 12; m++) {
    const day = String((m * 2) % 27 + 1).padStart(2, '0');
    extraTxs.push({
      clientId: 'client-d',
      bankAccountId: 'ba-d-1',
      date: `2026-11-${day}`,
      valueDate: `2026-11-${day}`,
      description: m === 1 ? 'NÓMINA MENSUAL DIRECCIÓN TECNOLÓGICA' : m === 2 ? 'CUOTA HIPOTECA VIVIENDA HABITUAL' : m === 3 ? 'APORTACIÓN FONDO EMERGENCIA' : `GASTO HOGAR / SUMINISTROS #${m}`,
      counterparty: m === 1 ? 'Pagador Nómina Demo' : m === 2 ? 'Banco Norte Hipotecas' : 'Comercio Local Demo',
      reference: `PERS-11-${m}`,
      amount: m === 1 ? 4200 : m === 2 ? -980 : m === 3 ? -600 : -(85 + m * 18),
      category: m === 1 ? 'Ingresos salariales' : m === 2 ? 'Hipoteca' : 'Gastos personales',
      reconciliationStatus: 'RECONCILED',
    });
  }

  // Pad Client A, B, C operating history up to 85+ transactions
  const fillerSamples = [
    { cid: 'client-a', bid: 'ba-a-1', desc: 'SUSCRIPCIÓN HERRAMIENTAS PRODUCTIVIDAD', cp: 'SaaS Tools Demo', amt: -119.0, cat: 'Software' },
    { cid: 'client-a', bid: 'ba-a-1', desc: 'DIETAS DESPLAZAMIENTO CLIENTE MADRID-BCN', cp: 'Renfe / AVE Demo', amt: -164.4, cat: 'Viajes y dietas' },
    { cid: 'client-a', bid: 'ba-a-1', desc: 'CUOTA SEGURIDAD SOCIAL AUTÓNOMO SOCIETARIO', cp: 'TGSS Demo', amt: -428.0, cat: 'Seguridad Social' },
    { cid: 'client-b', bid: 'ba-b-1', desc: 'CAJA EFECTIVO INGRESO VENTAS FIN DE SEMANA', cp: 'Caja Restaurante', amt: 2150.0, cat: 'Ventas sala' },
    { cid: 'client-b', bid: 'ba-b-1', desc: 'SEGURO RESPONSABILIDAD CIVIL LOCAL', cp: 'Aseguradora Ibérica Demo', amt: -195.0, cat: 'Seguros' },
    { cid: 'client-c', bid: 'ba-c-1', desc: 'CUOTA RETA AUTÓNOMOS NOVIEMBRE', cp: 'TGSS Demo', amt: -312.0, cat: 'Seguridad Social' },
    { cid: 'client-c', bid: 'ba-c-1', desc: 'TRASPASO AHORRO OBJETIVO VIVIENDA', cp: 'Cuenta Ahorro Personal', amt: -550.0, cat: 'Ahorro personal' },
    { cid: 'client-d', bid: 'ba-d-1', desc: 'NÓMINA OCTUBRE DIRECCIÓN TECNOLÓGICA', cp: 'Pagador Nómina Demo', amt: 4200.0, cat: 'Ingresos salariales' },
    { cid: 'client-d', bid: 'ba-d-1', desc: 'CUOTA HIPOTECA OCTUBRE', cp: 'Banco Norte Hipotecas', amt: -980.0, cat: 'Hipoteca' },
    { cid: 'client-d', bid: 'ba-d-1', desc: 'SUMINISTRO LUZ Y GAS HOGAR', cp: 'Energía Hogar Demo', amt: -142.3, cat: 'Hogar' },
  ];

  let dayIdx = 1;
  while (bankTransactions.length + extraTxs.length < 85) {
    const tpl = fillerSamples[dayIdx % fillerSamples.length];
    const d = String((dayIdx % 26) + 1).padStart(2, '0');
    const mo = dayIdx % 2 === 0 ? '10' : '09';
    extraTxs.push({
      clientId: tpl.cid,
      bankAccountId: tpl.bid,
      date: `2026-${mo}-${d}`,
      valueDate: `2026-${mo}-${d}`,
      description: `${tpl.desc} (${mo}/2026)`,
      counterparty: tpl.cp,
      reference: `OP-${mo}-${100 + dayIdx}`,
      amount: tpl.amt,
      category: tpl.cat,
      reconciliationStatus: 'RECONCILED',
    });
    dayIdx++;
  }

  for (const et of extraTxs) {
    bankTransactions.push({
      ...et,
      id: `tx-${txCounter++}`,
      fingerprint: makeBankTxFingerprint(et.date, et.amount, et.reference, et.description),
    });
  }

  const bankImports: BankImportBatch[] = [
    {
      id: 'imp-1',
      clientId: 'client-a',
      bankAccountId: 'ba-a-1',
      fileName: 'extracto_banco_atlantico_nov2026_demo.csv',
      importedAt: '2026-11-19T08:00:00Z',
      importedByUserId: 'u-client-a-admin',
      totalRows: 28,
      importedRows: 28,
      duplicateRowsRejected: 0,
    },
  ];

  // --- TAX OBLIGATIONS & DECLARATIONS ---
  const taxObligations: TaxObligation[] = [
    { id: 'obl-a-303', clientId: 'client-a', modelNumber: '303', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'SL en Régimen General de IVA', assignedAccountantId: 'u-accountant' },
    { id: 'obl-a-111', clientId: 'client-a', modelNumber: '111', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'Nóminas y profesionales con retención IRPF', assignedAccountantId: 'u-accountant' },
    { id: 'obl-a-115', clientId: 'client-a', modelNumber: '115', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'Alquiler oficina Madrid con retención 19%', assignedAccountantId: 'u-accountant' },
    { id: 'obl-a-349', clientId: 'client-a', modelNumber: '349', proposedByEngine: true, approvedByAccountant: false, applicable: true, rationale: 'Operaciones intracomunitarias cloud UE (pendiente aprobación perfil)', assignedAccountantId: 'u-accountant' },
    { id: 'obl-a-200', clientId: 'client-a', modelNumber: '200', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'Impuesto sobre Sociedades anual', assignedAccountantId: 'u-accountant' },
    { id: 'obl-b-303', clientId: 'client-b', modelNumber: '303', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'SL hostelería en Régimen General IVA', assignedAccountantId: 'u-accountant' },
    { id: 'obl-b-111', clientId: 'client-b', modelNumber: '111', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'Personal de sala y cocina en nómina', assignedAccountantId: 'u-accountant' },
    { id: 'obl-c-303', clientId: 'client-c', modelNumber: '303', proposedByEngine: true, approvedByAccountant: true, applicable: true, rationale: 'Autónoma en Régimen General IVA', assignedAccountantId: 'u-accountant' },
  ];

  // Dynamically compute Model 303 Q4 summary from shared invoices & journal entries!
  const clientA = SEED_CLIENT_PROFILES[0];
  const clientB = SEED_CLIENT_PROFILES[1];
  const clientC = SEED_CLIENT_PROFILES[2];

  const calcA303 = calculateModel303Draft(
    clientA,
    '2026-Q4',
    invoices,
    journalEntries,
    documents.filter((d) => d.clientId === 'client-a' && d.status === DocumentStatus.NEEDS_REVIEW).length
  );
  const calcB303 = calculateModel303Draft(
    clientB,
    '2026-Q4',
    invoices,
    journalEntries,
    documents.filter((d) => d.clientId === 'client-b' && d.status === DocumentStatus.NEEDS_REVIEW).length
  );
  const calcC303 = calculateModel303Draft(
    clientC,
    '2026-Q4',
    invoices,
    journalEntries,
    documents.filter((d) => d.clientId === 'client-c' && d.status === DocumentStatus.NEEDS_REVIEW).length
  );

  const taxDeclarations: TaxDeclaration[] = [
    {
      id: 'dec-a-303-q3',
      clientId: 'client-a',
      modelNumber: '303',
      periodCode: '2026-Q3',
      dueDate: '2026-10-20',
      status: TaxDeclarationStatus.FILED_EXTERNALLY,
      completenessPercent: 100,
      missingDataNotes: [],
      calculatedSummary: {
        outputVatBase: 14400,
        outputVatAmount: 3024,
        inputVatBase: 2770,
        inputVatDeductible: 581.7,
        netResultAmount: 2442.3,
        isSimplifiedCalculation: true,
      },
      linkedInvoiceIds: ['inv-a-c-1', 'inv-a-c-2', 'inv-a-c-3'],
      linkedEntryIds: ['je-a-c-1', 'je-a-c-2', 'je-a-c-3'],
      reviewedByUserId: 'u-accountant',
      approvedByUserId: 'u-accountant',
      externalReceiptRef: 'JUSTIFICANTE-DEMO-CSV-2026Q3',
      externalFiledAt: '2026-10-19',
      updatedAt: '2026-10-19T12:00:00Z',
    },
    {
      id: 'dec-a-303-q4',
      clientId: 'client-a',
      modelNumber: '303',
      periodCode: '2026-Q4',
      dueDate: '2027-01-30',
      status: TaxDeclarationStatus.NEEDS_REVIEW,
      completenessPercent: calcA303.completenessPercent,
      missingDataNotes: calcA303.missingDataNotes,
      calculatedSummary: {
        outputVatBase: calcA303.outputVatBase,
        outputVatAmount: calcA303.outputVatAmount,
        inputVatBase: calcA303.inputVatBase,
        inputVatDeductible: calcA303.inputVatDeductible,
        netResultAmount: calcA303.netResultAmount,
        isSimplifiedCalculation: true,
      },
      linkedInvoiceIds: calcA303.linkedInvoiceIds,
      linkedEntryIds: calcA303.linkedEntryIds,
      updatedAt: '2026-11-19T10:00:00Z',
    },
    {
      id: 'dec-a-111-q4',
      clientId: 'client-a',
      modelNumber: '111',
      periodCode: '2026-Q4',
      dueDate: '2027-01-20',
      status: TaxDeclarationStatus.DRAFT,
      completenessPercent: 75,
      missingDataNotes: ['Plantilla visual indicativa · Cálculo normativo completo PENDIENTE DE VALIDACIÓN NORMATIVA'],
      calculatedSummary: { netResultAmount: 1920, isSimplifiedCalculation: false },
      linkedInvoiceIds: ['inv-a-s-6', 'inv-a-s-10'],
      linkedEntryIds: ['je-a-payroll-10'],
      updatedAt: '2026-11-18T15:00:00Z',
    },
    {
      id: 'dec-a-115-q4',
      clientId: 'client-a',
      modelNumber: '115',
      periodCode: '2026-Q4',
      dueDate: '2027-01-20',
      status: TaxDeclarationStatus.READY_TO_PREPARE,
      completenessPercent: 80,
      missingDataNotes: ['Falta recibo alquiler Diciembre 2026 para completar trimestre.'],
      calculatedSummary: { netResultAmount: 703, isSimplifiedCalculation: false },
      linkedInvoiceIds: ['inv-a-s-5', 'inv-a-s-8'],
      linkedEntryIds: ['je-a-s-5', 'je-a-s-8'],
      updatedAt: '2026-11-18T15:00:00Z',
    },
    {
      id: 'dec-b-303-q4',
      clientId: 'client-b',
      modelNumber: '303',
      periodCode: '2026-Q4',
      dueDate: '2027-01-30',
      status: TaxDeclarationStatus.PENDING_DATA,
      completenessPercent: calcB303.completenessPercent,
      missingDataNotes: calcB303.missingDataNotes,
      calculatedSummary: {
        outputVatBase: calcB303.outputVatBase,
        outputVatAmount: calcB303.outputVatAmount,
        inputVatBase: calcB303.inputVatBase,
        inputVatDeductible: calcB303.inputVatDeductible,
        netResultAmount: calcB303.netResultAmount,
        isSimplifiedCalculation: true,
      },
      linkedInvoiceIds: calcB303.linkedInvoiceIds,
      linkedEntryIds: calcB303.linkedEntryIds,
      updatedAt: '2026-11-19T09:00:00Z',
    },
    {
      id: 'dec-c-303-q4',
      clientId: 'client-c',
      modelNumber: '303',
      periodCode: '2026-Q4',
      dueDate: '2027-01-30',
      status: TaxDeclarationStatus.DRAFT,
      completenessPercent: calcC303.completenessPercent,
      missingDataNotes: calcC303.missingDataNotes,
      calculatedSummary: {
        outputVatBase: calcC303.outputVatBase,
        outputVatAmount: calcC303.outputVatAmount,
        inputVatBase: calcC303.inputVatBase,
        inputVatDeductible: calcC303.inputVatDeductible,
        netResultAmount: calcC303.netResultAmount,
        isSimplifiedCalculation: true,
      },
      linkedInvoiceIds: calcC303.linkedInvoiceIds,
      linkedEntryIds: calcC303.linkedEntryIds,
      updatedAt: '2026-11-19T09:00:00Z',
    },
  ];

  // --- FINANCIAL PROFILES, ASSETS, LIABILITIES, 12 GOALS & 4 PLANS ---
  const financialProfiles: FinancialProfile[] = [
    { id: 'fp-a', clientId: 'client-a', scope: 'BUSINESS', monthlyGrossIncome: 19500, monthlyFixedExpenses: 11800, monthlyVariableExpenses: 2200, riskTolerance: 'MODERATE', planningHorizonYears: 3, emergencyReserveTargetMonths: 6, constraintsNote: 'Mantener colchón fiscal trimestral IVA/Sociedades en cuenta separada.', nextMeetingDate: '2026-11-28' },
    { id: 'fp-b', clientId: 'client-b', scope: 'BUSINESS', monthlyGrossIncome: 14200, monthlyFixedExpenses: 8900, monthlyVariableExpenses: 3600, riskTolerance: 'CONSERVATIVE', planningHorizonYears: 4, emergencyReserveTargetMonths: 4, constraintsNote: 'Estacionalidad alta en verano; evitar apalancamiento excesivo antes de renovar cocina.', nextMeetingDate: '2026-12-03' },
    { id: 'fp-c', clientId: 'client-c', scope: 'BUSINESS', monthlyGrossIncome: 4400, monthlyFixedExpenses: 1450, monthlyVariableExpenses: 650, riskTolerance: 'MODERATE', planningHorizonYears: 5, emergencyReserveTargetMonths: 6, constraintsNote: 'Separar reserva IRPF/IVA trimestral de la meta de entrada para vivienda.', nextMeetingDate: '2026-12-05' },
    { id: 'fp-d', clientId: 'client-d', scope: 'PERSONAL', monthlyGrossIncome: 4200, monthlyFixedExpenses: 2150, monthlyVariableExpenses: 750, riskTolerance: 'GROWTH', planningHorizonYears: 15, emergencyReserveTargetMonths: 6, constraintsNote: 'Planificación familiar y jubilación personal separada legalmente de VEGEN Digital SL.', nextMeetingDate: '2026-11-28' },
  ];

  const financialAssets: FinancialAsset[] = [
    { id: 'fa-a-1', clientId: 'client-a', scope: 'BUSINESS', name: 'Tesorería total cuentas VEGEN Digital SL', category: 'CASH', currentValue: 83350.4, liquidityTier: 'IMMEDIATE', notes: 'Incluye 14.000 EUR reservados para obligaciones fiscales' },
    { id: 'fa-a-2', clientId: 'client-a', scope: 'BUSINESS', name: 'Equipos informáticos y servidores propios', category: 'EQUIPMENT', currentValue: 14500, liquidityTier: 'ILLIQUID', notes: 'Valor contable neto estimado' },
    { id: 'fa-a-3', clientId: 'client-a', scope: 'BUSINESS', name: 'Derechos de cobro clientes pendientes', category: 'RECEIVABLES', currentValue: 29489.5, liquidityTier: 'SHORT_TERM', notes: 'Facturas emitidas pendientes de vencimiento' },
    { id: 'fa-b-1', clientId: 'client-b', scope: 'BUSINESS', name: 'Saldo cuenta operativa Taberna El Mirador', category: 'CASH', currentValue: 22410.75, liquidityTier: 'IMMEDIATE', notes: 'Cuenta Caixa Levante Demo' },
    { id: 'fa-b-2', clientId: 'client-b', scope: 'BUSINESS', name: 'Maquinaria actual cocina y barra', category: 'EQUIPMENT', currentValue: 34000, liquidityTier: 'ILLIQUID', notes: 'Inventariado en activo fijo' },
    { id: 'fa-c-1', clientId: 'client-c', scope: 'BUSINESS', name: 'Tesorería cuenta profesional Elena Navarro', category: 'CASH', currentValue: 14920.5, liquidityTier: 'IMMEDIATE', notes: 'Liquidez actividad económica' },
    { id: 'fa-c-2', clientId: 'client-c', scope: 'PERSONAL', name: 'Cuenta ahorro vivienda personal Elena', category: 'CASH', currentValue: 26500, liquidityTier: 'IMMEDIATE', notes: 'Patrimonio personal separado de actividad' },
    { id: 'fa-d-1', clientId: 'client-d', scope: 'PERSONAL', name: 'Cuenta corriente hogar Carlos Mendoza', category: 'CASH', currentValue: 19400, liquidityTier: 'IMMEDIATE', notes: 'Fondo líquido familiar' },
    { id: 'fa-d-2', clientId: 'client-d', scope: 'PERSONAL', name: 'Vivienda habitual (valoración orientativa)', category: 'REAL_ESTATE', currentValue: 285000, liquidityTier: 'ILLIQUID', notes: 'Propiedad 100% titularidad personal' },
    { id: 'fa-d-3', clientId: 'client-d', scope: 'PERSONAL', name: 'Cartera fondos indexados (entrada manual)', category: 'INVESTMENT_MANUAL', currentValue: 38200, liquidityTier: 'SHORT_TERM', notes: 'Posiciones registradas manualmente por asesor' },
  ];

  const financialLiabilities: FinancialLiability[] = [
    { id: 'fl-a-1', clientId: 'client-a', scope: 'BUSINESS', name: 'Préstamo ICO Crecimiento Digital', category: 'LOAN', outstandingBalance: 12000, monthlyPayment: 540, interestRateApr: 3.1, maturityDate: '2028-09-30' },
    { id: 'fl-b-1', clientId: 'client-b', scope: 'BUSINESS', name: 'Póliza de crédito circulante hostelería', category: 'CREDIT_LINE', outstandingBalance: 6500, monthlyPayment: 320, interestRateApr: 4.8, maturityDate: '2027-12-31' },
    { id: 'fl-d-1', clientId: 'client-d', scope: 'PERSONAL', name: 'Hipoteca vivienda habitual', category: 'MORTGAGE', outstandingBalance: 142000, monthlyPayment: 980, interestRateApr: 2.65, maturityDate: '2041-06-30' },
  ];

  const financialGoals: FinancialGoal[] = [
    {
      id: 'goal-1', clientId: 'client-a', scope: 'BUSINESS', name: 'Colchón de liquidez operativa (6 meses)', category: 'EMERGENCY_FUND',
      targetAmount: 60000, evidenceFundedAmount: 42000, manualFundedAmount: 0, startDate: '2026-01-15', targetDate: '2027-06-30',
      priority: 'HIGH', monthlyContributionPlanned: 2000, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-a', status: 'ACTIVE',
      notes: 'Respaldado por saldo en cuenta reserva y excedente operativo.',
      milestones: [
        { id: 'm1', label: '3 meses cubiertos (30.000 €)', targetAmount: 30000, reached: true },
        { id: 'm2', label: '6 meses objetivo (60.000 €)', targetAmount: 60000, reached: false },
      ],
      contributions: [
        { id: 'gc-1', goalId: 'goal-1', date: '2026-10-15', amount: 4500, sourceType: 'EVIDENCE_BANK_ACCOUNT', attributedByUserName: 'Sistema Tesorería', note: 'Traspaso verificado a cuenta reserva' },
      ],
    },
    {
      id: 'goal-2', clientId: 'client-a', scope: 'BUSINESS', name: 'Apertura delegación comercial Barcelona', category: 'EXPANSION',
      targetAmount: 35000, evidenceFundedAmount: 11500, manualFundedAmount: 2500, startDate: '2026-05-01', targetDate: '2027-09-01',
      priority: 'MEDIUM', monthlyContributionPlanned: 1500, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-a', status: 'ACTIVE',
      notes: 'Incluye fianza oficina y contratación primer perfil senior.',
      milestones: [
        { id: 'm3', label: 'Reserva inicial 10.000 €', targetAmount: 10000, reached: true },
        { id: 'm4', label: 'Presupuesto completo 35.000 €', targetAmount: 35000, reached: false },
      ],
      contributions: [
        { id: 'gc-2', goalId: 'goal-2', date: '2026-11-01', amount: 2500, sourceType: 'MANUAL_ENTRY', attributedByUserName: 'Alejandro Vega', note: 'Aportación declarada pendiente de traspaso bancario' },
      ],
    },
    {
      id: 'goal-3', clientId: 'client-a', scope: 'BUSINESS', name: 'Amortización anticipada préstamo ICO', category: 'DEBT_REDUCTION',
      targetAmount: 12000, evidenceFundedAmount: 4800, manualFundedAmount: 0, startDate: '2026-06-01', targetDate: '2027-05-01',
      priority: 'LOW', monthlyContributionPlanned: 800, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-a', status: 'ACTIVE',
      notes: 'Reducir carga financiera antes de nueva expansión.',
      milestones: [{ id: 'm5', label: '50% deuda cubierta', targetAmount: 6000, reached: false }],
      contributions: [],
    },
    {
      id: 'goal-4', clientId: 'client-b', scope: 'BUSINESS', name: 'Renovación horno mixto y cámara frigorífica', category: 'EQUIPMENT',
      targetAmount: 18500, evidenceFundedAmount: 9200, manualFundedAmount: 1000, startDate: '2026-04-01', targetDate: '2027-03-15',
      priority: 'HIGH', monthlyContributionPlanned: 1100, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-b', status: 'ACTIVE',
      notes: 'Mejora de eficiencia energética en cocina.',
      milestones: [{ id: 'm6', label: 'Señal proveedor 50%', targetAmount: 9250, reached: true }],
      contributions: [],
    },
    {
      id: 'goal-5', clientId: 'client-b', scope: 'BUSINESS', name: 'Reserva de tesorería temporada baja', category: 'EMERGENCY_FUND',
      targetAmount: 15000, evidenceFundedAmount: 6400, manualFundedAmount: 0, startDate: '2026-07-01', targetDate: '2027-02-28',
      priority: 'HIGH', monthlyContributionPlanned: 900, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-b', status: 'AT_RISK',
      notes: 'Ritmo de ahorro inferior al previsto por subida de suministros.',
      milestones: [],
      contributions: [],
    },
    {
      id: 'goal-6', clientId: 'client-b', scope: 'BUSINESS', name: 'Cancelación póliza circulante', category: 'DEBT_REDUCTION',
      targetAmount: 6500, evidenceFundedAmount: 2100, manualFundedAmount: 0, startDate: '2026-08-01', targetDate: '2027-08-01',
      priority: 'MEDIUM', monthlyContributionPlanned: 450, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-b', status: 'ACTIVE',
      notes: 'Eliminar línea de crédito al 4,8% TAE.',
      milestones: [],
      contributions: [],
    },
    {
      id: 'goal-7', clientId: 'client-c', scope: 'PERSONAL', name: 'Ahorrar 20.000 € de entrada vivienda', category: 'HOME_PURCHASE',
      targetAmount: 20000, evidenceFundedAmount: 14500, manualFundedAmount: 1500, startDate: '2025-11-01', targetDate: '2027-06-01',
      priority: 'HIGH', monthlyContributionPlanned: 650, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-c', status: 'ACTIVE',
      notes: 'Objetivo personal separado de la tesorería profesional.',
      milestones: [{ id: 'm7', label: '75% conseguido (15.000 €)', targetAmount: 15000, reached: true }],
      contributions: [],
    },
    {
      id: 'goal-8', clientId: 'client-c', scope: 'BUSINESS', name: 'Fondo reserva impuestos y baja autónoma (6 meses)', category: 'EMERGENCY_FUND',
      targetAmount: 9000, evidenceFundedAmount: 6800, manualFundedAmount: 0, startDate: '2026-02-01', targetDate: '2027-03-01',
      priority: 'HIGH', monthlyContributionPlanned: 400, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-c', status: 'ACTIVE',
      notes: 'Cubre cuota RETA y gastos fijos mínimos.',
      milestones: [],
      contributions: [],
    },
    {
      id: 'goal-9', clientId: 'client-c', scope: 'BUSINESS', name: 'Renovación equipo MacBook Studio + monitor', category: 'EQUIPMENT',
      targetAmount: 3800, evidenceFundedAmount: 3800, manualFundedAmount: 0, startDate: '2026-01-10', targetDate: '2026-11-01',
      priority: 'LOW', monthlyContributionPlanned: 0, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-c', status: 'COMPLETED',
      notes: 'Objetivo completado al 100%.',
      milestones: [],
      contributions: [],
    },
    {
      id: 'goal-10', clientId: 'client-d', scope: 'PERSONAL', name: 'Fondo de emergencia familiar (6 meses)', category: 'EMERGENCY_FUND',
      targetAmount: 18000, evidenceFundedAmount: 14400, manualFundedAmount: 0, startDate: '2026-01-01', targetDate: '2027-04-01',
      priority: 'HIGH', monthlyContributionPlanned: 600, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-d', status: 'ACTIVE',
      notes: 'Mantenido en cuenta líquida remunerada.',
      milestones: [],
      contributions: [],
    },
    {
      id: 'goal-11', clientId: 'client-d', scope: 'PERSONAL', name: 'Fondo educación universitaria hijos', category: 'EDUCATION',
      targetAmount: 24000, evidenceFundedAmount: 7200, manualFundedAmount: 1200, startDate: '2025-09-01', targetDate: '2033-09-01',
      priority: 'MEDIUM', monthlyContributionPlanned: 250, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-d', status: 'ACTIVE',
      notes: 'Horizonte largo plazo 7 años.',
      milestones: [],
      contributions: [],
    },
    {
      id: 'goal-12', clientId: 'client-d', scope: 'PERSONAL', name: 'Complemento jubilación a largo plazo', category: 'RETIREMENT',
      targetAmount: 120000, evidenceFundedAmount: 31000, manualFundedAmount: 4000, startDate: '2024-01-01', targetDate: '2045-01-01',
      priority: 'MEDIUM', monthlyContributionPlanned: 450, responsibleAdvisorId: 'u-advisor', linkedPlanId: 'plan-d', status: 'ACTIVE',
      notes: 'Proyección estimada sujeta a revisión anual de capacidad de ahorro.',
      milestones: [],
      contributions: [],
    },
  ];

  const disclaimer =
    'Documento de planificación orientativa basado en hipótesis transparentes y datos de demostración. Las proyecciones no constituyen garantía de rentabilidad ni recomendación regulada de valores.';

  const financialPlans: FinancialPlan[] = [
    {
      id: 'plan-a',
      clientId: 'client-a',
      scope: 'BUSINESS',
      title: 'Plan Estratégico Tesorería y Expansión 2027 — VEGEN Digital SL',
      advisorId: 'u-advisor',
      advisorName: 'Mateo Roldán',
      status: 'PUBLISHED',
      createdAt: '2026-11-05',
      publishedAt: '2026-11-12',
      horizonMonths: 36,
      baselineLiquidity: 69350.4,
      baselineMonthlySavingsCapacity: 5500,
      executiveNotes: 'La consultora mantiene un margen operativo saludable. Recomendamos consolidar el colchón de 6 meses antes de comprometer alquiler fijo en Barcelona.',
      disclaimer,
      scenarios: buildScenarioProjections(69350.4, 5500),
      linkedGoalIds: ['goal-1', 'goal-2', 'goal-3'],
    },
    {
      id: 'plan-b',
      clientId: 'client-b',
      scope: 'BUSINESS',
      title: 'Plan Inversión Equipamiento y Estabilidad Estacional — El Mirador SL',
      advisorId: 'u-advisor',
      advisorName: 'Mateo Roldán',
      status: 'READY_FOR_PUBLICATION',
      createdAt: '2026-11-14',
      horizonMonths: 36,
      baselineLiquidity: 19410.75,
      baselineMonthlySavingsCapacity: 1700,
      executiveNotes: 'Priorizar reserva de temporada baja y financiar parcialmente el horno mixto solo si el margen neto supera el 12%.',
      disclaimer,
      scenarios: buildScenarioProjections(19410.75, 1700),
      linkedGoalIds: ['goal-4', 'goal-5', 'goal-6'],
    },
    {
      id: 'plan-c',
      clientId: 'client-c',
      scope: 'CONSOLIDATED',
      title: 'Plan Integral Autónoma + Ahorro Vivienda — Elena Navarro',
      advisorId: 'u-advisor',
      advisorName: 'Mateo Roldán',
      status: 'PUBLISHED',
      createdAt: '2026-11-08',
      publishedAt: '2026-11-15',
      horizonMonths: 60,
      baselineLiquidity: 39420.5,
      baselineMonthlySavingsCapacity: 2300,
      executiveNotes: 'Vista consolidada autorizada manteniendo separación estricta entre reserva fiscal profesional (cuenta sur) y ahorro personal vivienda.',
      disclaimer,
      scenarios: buildScenarioProjections(39420.5, 2300),
      linkedGoalIds: ['goal-7', 'goal-8', 'goal-9'],
    },
    {
      id: 'plan-d',
      clientId: 'client-d',
      scope: 'PERSONAL',
      title: 'Plan Patrimonial Familiar y Jubilación — Carlos Mendoza',
      advisorId: 'u-advisor',
      advisorName: 'Mateo Roldán',
      status: 'PUBLISHED',
      createdAt: '2026-11-10',
      publishedAt: '2026-11-16',
      horizonMonths: 60,
      baselineLiquidity: 19400,
      baselineMonthlySavingsCapacity: 1300,
      executiveNotes: 'Completar el fondo de emergencia de 18.000 EUR en 6 meses y redirigir el excedente mensual hacia objetivos de educación y jubilación.',
      disclaimer,
      scenarios: buildScenarioProjections(19400, 1300),
      linkedGoalIds: ['goal-10', 'goal-11', 'goal-12'],
    },
  ];

  // --- TASKS, MESSAGES, NOTIFICATIONS, AUDIT LOGS ---
  const tasks: ClientTask[] = [
    {
      id: 'task-1',
      clientId: 'client-a',
      title: 'Adjuntar factura recibo alquiler oficina Noviembre (justificante bancario)',
      description: 'Por favor, sube el PDF oficial del recibo de alquiler de noviembre con desglose de retención 19% para cerrar el borrador del Modelo 115.',
      type: 'DOCUMENT_REQUEST',
      status: 'OPEN',
      assignedToRole: 'CLIENT',
      createdByUserId: 'u-accountant',
      createdByName: 'Lucía Serrano (Contable)',
      dueDate: '2026-11-26',
      createdAt: '2026-11-18T09:30:00Z',
    },
    {
      id: 'task-2',
      clientId: 'client-a',
      title: 'Aclarar abono bancario de 1.500,00 EUR del 16/11 sin referencia',
      description: 'Hemos detectado un ingreso en Banco Atlántico de 1.500 EUR sin número de factura. Indícanos a qué cliente o presupuesto corresponde.',
      type: 'MISSING_INFO',
      status: 'IN_PROGRESS',
      assignedToRole: 'CLIENT',
      createdByUserId: 'u-accountant',
      createdByName: 'Lucía Serrano (Contable)',
      dueDate: '2026-11-24',
      createdAt: '2026-11-17T16:15:00Z',
    },
    {
      id: 'task-3',
      clientId: 'client-a',
      title: 'Revisar borrador Modelo 303 (4T 2026) y confirmar IVA intracomunitario',
      description: 'Validar documento Nube Europea Cloud GmbH antes de aprobar el borrador trimestral.',
      type: 'ACCOUNTING_REVIEW',
      status: 'OPEN',
      assignedToRole: 'ACCOUNTANT',
      createdByUserId: 'u-firm-admin',
      createdByName: 'Javier Ortega',
      dueDate: '2026-11-29',
      createdAt: '2026-11-19T08:10:00Z',
    },
    {
      id: 'task-4',
      clientId: 'client-b',
      title: 'Subir justificante TC1 Seguridad Social Noviembre',
      description: 'Necesario para conciliar el adeudo bancario de -2.480,00 EUR.',
      type: 'DOCUMENT_REQUEST',
      status: 'OPEN',
      assignedToRole: 'CLIENT',
      createdByUserId: 'u-accountant',
      createdByName: 'Lucía Serrano (Contable)',
      dueDate: '2026-11-25',
      createdAt: '2026-11-18T11:00:00Z',
    },
  ];

  const messages: CollaborationMessage[] = [
    {
      id: 'msg-1',
      clientId: 'client-a',
      authorUserId: 'u-accountant',
      authorName: 'Lucía Serrano',
      authorRoleLabel: 'Contable · Gestoría Ibérica',
      visibility: 'CLIENT_VISIBLE',
      category: 'DOCUMENT_REQUEST',
      body: 'Hola Alejandro, hemos contabilizado las facturas de octubre. Solo nos falta confirmar la factura de Nube Europea Cloud (la foto está algo borrosa en el NIF) para actualizar tu previsión del Modelo 303.',
      timestamp: '2026-11-18T11:20:00Z',
      linkedTaskId: 'task-1',
    },
    {
      id: 'msg-2',
      clientId: 'client-a',
      authorUserId: 'u-client-a-admin',
      authorName: 'Alejandro Vega',
      authorRoleLabel: 'Administrador · VEGEN Digital SL',
      visibility: 'CLIENT_VISIBLE',
      category: 'CLIENT_RESPONSE',
      body: 'Perfecto Lucía, gracias. Hoy mismo reviso el recibo de noviembre y te confirmo el ingreso de 1.500 € (creo que es un anticipo de Clínica Vitalia).',
      timestamp: '2026-11-18T16:45:00Z',
      linkedTaskId: 'task-2',
    },
    {
      id: 'msg-3',
      clientId: 'client-a',
      authorUserId: 'u-advisor',
      authorName: 'Mateo Roldán',
      authorRoleLabel: 'Asesor Financiero · Patrimonia Vegen',
      visibility: 'CLIENT_VISIBLE',
      category: 'ADVISOR_RECOMMENDATION',
      body: 'He publicado la actualización de tu Plan Estratégico 2027. Con el flujo de caja actual, alcanzarás el colchón de 60.000 € en 9 meses si mantienes la aportación mensual de 2.000 €.',
      timestamp: '2026-11-19T09:15:00Z',
    },
    {
      id: 'msg-4',
      clientId: 'client-a',
      authorUserId: 'u-accountant',
      authorName: 'Lucía Serrano',
      authorRoleLabel: 'Contable (Nota Interna)',
      visibility: 'INTERNAL_ACCOUNTING',
      category: 'ACCOUNTING_NOTE',
      body: 'NOTA INTERNA GESTORÍA: Revisar si Nube Europea Cloud tiene NIF-IVA validado en VIES antes de incluir en el Modelo 349 del 4T.',
      timestamp: '2026-11-19T09:30:00Z',
    },
    {
      id: 'msg-5',
      clientId: 'client-a',
      authorUserId: 'u-advisor',
      authorName: 'Mateo Roldán',
      authorRoleLabel: 'Asesor Financiero (Nota Interna)',
      visibility: 'INTERNAL_ADVISORY',
      category: 'ADVISOR_RECOMMENDATION',
      body: 'NOTA PRIVADA ASESORÍA: El socio plantea retirada de dividendo personal en Q1 2027; analizar impacto en patrimonio personal de Carlos Mendoza en la reunión del día 28.',
      timestamp: '2026-11-19T10:05:00Z',
    },
  ];

  const notifications: AppNotification[] = [
    { id: 'not-1', clientId: 'client-a', title: 'Solicitud de documento pendiente', detail: 'Lucía Serrano ha solicitado el recibo de alquiler de Noviembre.', severity: 'ACTION_REQUIRED', read: false, createdAt: '2026-11-18T11:20:00Z' },
    { id: 'not-2', clientId: 'client-a', title: 'Nuevo Plan Financiero publicado', detail: 'Mateo Roldán publicó el Plan Estratégico Tesorería y Expansión 2027.', severity: 'INFO', read: false, createdAt: '2026-11-19T09:15:00Z' },
    { id: 'not-3', clientId: 'client-a', title: '2 coincidencias bancarias sugeridas', detail: 'Hay movimientos en Banco Atlántico listos para confirmar conciliación.', severity: 'WARNING', read: false, createdAt: '2026-11-19T08:00:00Z' },
  ];

  const auditEvents: AuditEvent[] = [
    { id: 'aud-1', timestamp: '2026-10-22T11:02:00Z', actorUserId: 'u-accountant', actorName: 'Lucía Serrano', actorRole: 'ACCOUNTANT', organizationId: 'org-firm-acc', clientId: 'client-a', action: 'PERIOD_CLOSED', entityType: 'accounting_period', entityId: 'per-a-q3', summary: 'Cierre contable del periodo 2026-Q3 de VEGEN Digital SL' },
    { id: 'aud-2', timestamp: '2026-11-12T17:30:00Z', actorUserId: 'u-advisor', actorName: 'Mateo Roldán', actorRole: 'FINANCIAL_ADVISOR', organizationId: 'org-firm-adv', clientId: 'client-a', action: 'PLAN_PUBLISHED', entityType: 'financial_plan', entityId: 'plan-a', summary: 'Publicación de Plan Estratégico 2027 para cliente VEGEN Digital SL' },
    { id: 'aud-3', timestamp: '2026-11-19T08:40:00Z', actorUserId: 'u-client-a-collab', actorName: 'Marta Ruiz', actorRole: 'CLIENT_COLLABORATOR', organizationId: 'org-client-a', clientId: 'client-a', action: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: 'doc-review-2', summary: 'Subida de duplicado_iberiatel_oct.pdf (marcado posible duplicado)' },
  ];

  return {
    organizations: SEED_ORGANIZATIONS,
    roles: SEED_ROLES,
    users: SEED_USERS,
    memberships: SEED_MEMBERSHIPS,
    assignments: SEED_ASSIGNMENTS,
    clientProfiles: SEED_CLIENT_PROFILES,
    documents,
    extractionRules,
    contacts,
    invoices,
    chartOfAccounts: SPANISH_CHART_OF_ACCOUNTS,
    accountingPeriods,
    journalEntries,
    taxModels: SPANISH_TAX_MODEL_REGISTRY,
    taxObligations,
    taxDeclarations,
    bankAccounts,
    bankImports,
    bankTransactions,
    financialProfiles,
    financialAssets,
    financialLiabilities,
    financialGoals,
    financialPlans,
    tasks,
    messages,
    notifications,
    auditEvents,
    personas: SEED_PERSONAS,
    activePersonaId: 'persona-client-a-admin',
    selectedClientId: 'client-a',
    simulatedChannels: {
      emailEnabled: false,
      emailAddress: 'buzon.vegen-demo@gestoriaiberica.ejemplo',
      whatsappEnabled: false,
      whatsappNumber: '+34 600 000 000 (DEMO)',
    },
  };
}
