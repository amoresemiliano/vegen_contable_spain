import {
  BaseRoleCode,
  ClientEntityType,
  ClientProfile,
  DemoPersona,
  OrganizationType,
  PermissionCode,
  Role,
  VegenAppState,
} from '../types/domain';

export interface PermissionMeta {
  code: PermissionCode;
  module: string;
  label: string;
  description: string;
  sensitive?: boolean;
}

export const PERMISSION_CATALOG: PermissionMeta[] = [
  { code: 'documents.upload', module: 'Documentos', label: 'Subir documentos', description: 'Permite subir facturas, tickets y justificantes.' },
  { code: 'documents.read', module: 'Documentos', label: 'Ver documentos', description: 'Permite consultar la bandeja documental.' },
  { code: 'documents.review', module: 'Documentos', label: 'Revisar y corregir extracción', description: 'Permite editar campos extraídos y aprobar documentos.' },
  { code: 'documents.delete', module: 'Documentos', label: 'Eliminar / archivar documentos', description: 'Permite archivar o descartar documentos.' },
  { code: 'invoices.read', module: 'Facturación', label: 'Ver facturas', description: 'Consulta facturas emitidas, recibidas y presupuestos.' },
  { code: 'invoices.create', module: 'Facturación', label: 'Crear y editar borradores', description: 'Crea facturas borrador de demostración y contactos.' },
  { code: 'invoices.export', module: 'Facturación', label: 'Exportar vistas previas', description: 'Permite exportar PDF/CSV de demostración.' },
  { code: 'accounting.entries.read', module: 'Contabilidad', label: 'Ver asientos y libros', description: 'Acceso a diario, mayor y plan contable.' },
  { code: 'accounting.entries.create', module: 'Contabilidad', label: 'Crear asientos borrador', description: 'Permite redactar o generar propuestas de asientos.' },
  { code: 'accounting.entries.approve', module: 'Contabilidad', label: 'Aprobar y contabilizar asientos', description: 'Valida asientos cuadrados y los pasa a libro diario.', sensitive: true },
  { code: 'accounting.periods.close', module: 'Contabilidad', label: 'Cerrar periodos contables', description: 'Bloquea periodos contables tras cierre.', sensitive: true },
  { code: 'accounting.reports.read', module: 'Contabilidad', label: 'Ver informes contables', description: 'Acceso a PyG, Balance y Sumas y Saldos.' },
  { code: 'tax.obligations.manage', module: 'Fiscalidad', label: 'Gestionar obligaciones fiscales', description: 'Aprueba modelos aplicables por cliente.' },
  { code: 'tax.drafts.generate', module: 'Fiscalidad', label: 'Generar borradores fiscales', description: 'Calcula borradores indicativos (ej. Modelo 303).' },
  { code: 'tax.drafts.approve', module: 'Fiscalidad', label: 'Aprobar borradores fiscales', description: 'Marca declaraciones como listas para presentación externa.', sensitive: true },
  { code: 'treasury.read', module: 'Tesorería', label: 'Ver bancos y liquidez', description: 'Consulta saldos, movimientos y previsiones.' },
  { code: 'treasury.transactions.import', module: 'Tesorería', label: 'Importar extractos CSV', description: 'Importa extractos bancarios de demostración.' },
  { code: 'treasury.reconciliation.approve', module: 'Tesorería', label: 'Aprobar conciliaciones', description: 'Confirma emparejamientos banco-factura.' },
  { code: 'finance.profile.read', module: 'Planificación', label: 'Ver perfil y diagnóstico financiero', description: 'Consulta situación patrimonial y de liquidez.' },
  { code: 'finance.plans.create', module: 'Planificación', label: 'Crear planes y escenarios', description: 'Diseña escenarios conservador, base y optimista.' },
  { code: 'finance.plans.publish', module: 'Planificación', label: 'Publicar planes al cliente', description: 'Hace visible un plan financiero al cliente.' },
  { code: 'finance.goals.propose', module: 'Objetivos', label: 'Proponer objetivos', description: 'Permite al cliente proponer nuevos objetivos financieros.' },
  { code: 'finance.goals.manage', module: 'Objetivos', label: 'Gestionar objetivos y contribuciones', description: 'Crea, aprueba y vincula objetivos financieros.' },
  { code: 'finance.personal.read', module: 'Privacidad', label: 'Ver datos financieros personales', description: 'Acceso autorizado a patrimonio y finanzas personales.', sensitive: true },
  { code: 'messages.client.read', module: 'Colaboración', label: 'Ver mensajes con cliente', description: 'Lee solicitudes y notas visibles al cliente.' },
  { code: 'messages.client.send', module: 'Colaboración', label: 'Enviar mensajes y solicitudes', description: 'Envía solicitudes documentales y respuestas.' },
  { code: 'messages.internal.read', module: 'Colaboración', label: 'Ver notas internas de firma', description: 'Acceso a notas privadas entre profesionales.', sensitive: true },
  { code: 'users.manage', module: 'Administración', label: 'Gestionar usuarios e invitaciones', description: 'Alta y edición de usuarios dentro de su ámbito.' },
  { code: 'roles.manage', module: 'Administración', label: 'Gestionar roles y permisos', description: 'Crea, clona y edita permisos RBAC.', sensitive: true },
  { code: 'organizations.manage', module: 'Administración', label: 'Gestionar organizaciones', description: 'Administración global de despachos y empresas.', sensitive: true },
  { code: 'assignments.manage', module: 'Administración', label: 'Asignar profesionales a clientes', description: 'Asigna contables y asesores financieros.' },
  { code: 'audit.read', module: 'Auditoría', label: 'Consultar registro de auditoría', description: 'Visualiza trazabilidad de acciones privilegiadas.', sensitive: true },
  { code: 'system.config.manage', module: 'Sistema', label: 'Configuración global y datos demo', description: 'Control de canales, invariantes y reinicio demo.', sensitive: true },
];

export function getActivePersona(state: VegenAppState): DemoPersona {
  return state.personas.find((p) => p.id === state.activePersonaId) ?? state.personas[0];
}

export function getActiveUserRole(state: VegenAppState): Role | undefined {
  const persona = getActivePersona(state);
  const membership = state.memberships.find(
    (m) => m.userId === persona.userId && m.organizationId === persona.organizationId && m.active
  );
  const roleId = membership?.roleId ?? persona.roleId;
  return state.roles.find((r) => r.id === roleId);
}

export function hasPermission(state: VegenAppState, permission: PermissionCode): boolean {
  const role = getActiveUserRole(state);
  if (!role) return false;
  return role.permissions.includes(permission);
}

export function hasAnyPermission(state: VegenAppState, permissions: PermissionCode[]): boolean {
  return permissions.some((perm) => hasPermission(state, perm));
}

export function getAccessibleClients(state: VegenAppState): ClientProfile[] {
  const persona = getActivePersona(state);
  const role = getActiveUserRole(state);
  const org = state.organizations.find((o) => o.id === persona.organizationId);

  if (!role || !org) return [];

  // Platform superadmin with organizations.manage sees all clients
  if (role.code === BaseRoleCode.PLATFORM_SUPERADMIN || hasPermission(state, 'organizations.manage')) {
    return state.clientProfiles;
  }

  // Client organization members only see their own client profile
  if (org.type === OrganizationType.CLIENT_ENTITY) {
    return state.clientProfiles.filter((c) => c.organizationId === org.id);
  }

  // Firm Admin sees clients linked to their accounting or advisory firm
  if (role.scope === 'FIRM' && hasPermission(state, 'assignments.manage')) {
    return state.clientProfiles.filter(
      (c) => c.accountingFirmId === org.id || c.advisoryFirmId === org.id
    );
  }

  // Professionals see only assigned clients
  const assignedClientIds = new Set(
    state.assignments
      .filter((a) => a.userId === persona.userId && a.firmOrgId === org.id)
      .map((a) => a.clientId)
  );
  return state.clientProfiles.filter((c) => assignedClientIds.has(c.id));
}

export function canAccessClient(state: VegenAppState, clientId: string): boolean {
  return getAccessibleClients(state).some((c) => c.id === clientId);
}

export function canViewClientPersonalData(state: VegenAppState, clientId: string): boolean {
  if (!hasPermission(state, 'finance.personal.read')) return false;
  const client = state.clientProfiles.find((c) => c.id === clientId);
  if (!client) return false;

  const persona = getActivePersona(state);
  const org = state.organizations.find((o) => o.id === persona.organizationId);
  const role = getActiveUserRole(state);

  if (role?.code === BaseRoleCode.PLATFORM_SUPERADMIN) return true;
  if (org?.type === OrganizationType.CLIENT_ENTITY) {
    return client.organizationId === org.id;
  }

  if (
    client.entityType === ClientEntityType.INDIVIDUAL ||
    client.entityType === ClientEntityType.AUTONOMO ||
    client.allowsConsolidatedPersonalView
  ) {
    const assignment = state.assignments.find(
      (a) => a.clientId === clientId && a.userId === persona.userId
    );
    if (assignment) return assignment.canViewPersonalData;
    if (hasPermission(state, 'assignments.manage')) return true;
  }

  return false;
}

export function isModuleVisibleForClient(
  client: ClientProfile,
  moduleId: string
): boolean {
  // Individuals do not see corporate B2B invoicing or corporate tax unless applicable
  if (client.entityType === ClientEntityType.INDIVIDUAL) {
    if (moduleId === 'facturas' || moduleId === 'contabilidad') {
      return false;
    }
  }
  return true;
}
