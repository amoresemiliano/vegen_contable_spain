import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Database,
  Plus,
  RefreshCw,
  Shield,
  Users,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { PERMISSION_CATALOG } from '../../domain/rbac';
import { runDomainInvariantChecks } from '../../domain/invariants';
import { FEATURE_STATUS_REGISTRY } from '../../data/catalogs';
import { DRAFT_MYSQL_SCHEMA_SQL, PHP_REST_API_ENDPOINTS } from '../../services/mysqlAndApiSpec';
import { formatDateTimeEs } from '../../domain/formatters';
import {
  LegalNoticeBanner,
  ModalDialog,
  PageHeader,
  Panel,
  StatusLabel,
} from '../../components/ui/Surface';
import { BaseRoleCode, PermissionCode, Role } from '../../types/domain';

interface AdminWorkspaceProps {
  activeSection:
    | 'organizaciones'
    | 'usuarios'
    | 'roles'
    | 'asignaciones'
    | 'auditoria'
    | 'sistema';
}

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({ activeSection }) => {
  const {
    state,
    activePersona,
    activeRole,
    accessibleClients,
    can,
    createOrCloneRole,
    updateRolePermissions,
    assignUserRole,
    toggleProfessionalAssignment,
    resetDemoData,
  } = useAppStore();

  const isSuperadmin = activeRole?.code === BaseRoleCode.PLATFORM_SUPERADMIN;
  const [selectedRoleId, setSelectedRoleId] = useState<string>(state.roles[0]?.id ?? '');
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('Contable Junior (Solo Lectura + Revisión)');
  const [newRoleScope, setNewRoleScope] = useState<Role['scope']>('FIRM');
  const [cloneFromRoleId, setCloneFromRoleId] = useState<string>('role-accountant');
  const [specTab, setSpecTab] = useState<'INVARIANTS' | 'FEATURES' | 'MYSQL' | 'API'>('INVARIANTS');

  const invariantResults = useMemo(() => runDomainInvariantChecks(state), [state]);

  const selectedRole = state.roles.find((r) => r.id === selectedRoleId) ?? state.roles[0];

  const scopedUsers = useMemo(() => {
    if (isSuperadmin) return state.users;
    return state.users.filter((u) => u.primaryOrgId === activePersona.organizationId);
  }, [state.users, isSuperadmin, activePersona.organizationId]);

  const handleTogglePermission = (role: Role, perm: PermissionCode) => {
    if (!can('roles.manage')) return;
    const exists = role.permissions.includes(perm);
    const next = exists
      ? role.permissions.filter((p) => p !== perm)
      : [...role.permissions, perm];
    updateRolePermissions(role.id, next);
  };

  const handleCreateOrCloneRole = (e: React.FormEvent) => {
    e.preventDefault();
    const baseRole = state.roles.find((r) => r.id === cloneFromRoleId);
    const created = createOrCloneRole({
      code: `CUSTOM_${Date.now().toString().slice(-4)}`,
      name: newRoleName,
      description: baseRole ? `Clonado de ${baseRole.name}` : 'Rol personalizado RBAC',
      scope: newRoleScope,
      isSystem: false,
      permissions: baseRole ? [...baseRole.permissions] : ['documents.read'],
    });
    setSelectedRoleId(created.id);
    setNewRoleOpen(false);
  };

  if (activeSection === 'organizaciones') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Organizaciones del Ecosistema"
          subtitle={
            isSuperadmin
              ? 'Vista global de plataforma, despachos contables, firmas de asesoramiento y empresas clientes.'
              : 'Ámbito restringido a tu organización de despacho.'
          }
        />
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Organización</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">NIF / CIF</th>
                  <th className="px-4 py-3 font-medium">Ciudad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {state.organizations
                  .filter((o) => isSuperadmin || o.id === activePersona.organizationId)
                  .map((org) => (
                    <tr key={org.id}>
                      <td className="px-4 py-3 font-medium">{org.name}</td>
                      <td className="px-4 py-3 font-mono">{org.type}</td>
                      <td className="px-4 py-3 font-mono">{org.taxId}</td>
                      <td className="px-4 py-3">{org.city}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  if (activeSection === 'usuarios') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Usuarios, Membresías e Invitaciones"
          subtitle={
            isSuperadmin
              ? 'Asigna roles RBAC a cualquier usuario de demostración y observa el cambio al cambiar de persona.'
              : 'Gestión de usuarios dentro del ámbito de tu despacho.'
          }
        />
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Email Demo</th>
                  <th className="px-4 py-3 font-medium">Organización</th>
                  <th className="px-4 py-3 font-medium">Rol RBAC asignado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {scopedUsers.map((user) => {
                  const membership = state.memberships.find((m) => m.userId === user.id);
                  const org = state.organizations.find((o) => o.id === user.primaryOrgId);
                  return (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-medium">{user.fullName}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{user.email}</td>
                      <td className="px-4 py-3">{org?.name}</td>
                      <td className="px-4 py-3">
                        <select
                          disabled={!can('roles.manage') && !can('users.manage')}
                          value={membership?.roleId ?? ''}
                          onChange={(e) => assignUserRole(user.id, user.primaryOrgId, e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          {state.roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.permissions.length} perm.)
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  if (activeSection === 'asignaciones') {
    const professionals = state.users.filter(
      (u) => u.primaryOrgId === 'org-firm-acc' || u.primaryOrgId === 'org-firm-adv'
    );
    return (
      <div className="space-y-6">
        <PageHeader
          title="Asignaciones Profesionales y Aislamiento"
          subtitle="Controla qué contables y asesores financieros tienen acceso a cada cliente y si están autorizados a ver finanzas personales."
        />
        <div className="space-y-4">
          {accessibleClients.map((cli) => (
            <Panel key={cli.id}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-sm font-semibold">{cli.displayName}</h3>
                  <div className="text-xs text-slate-500">{cli.taxId}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {professionals.map((prof) => {
                  const isAdv = prof.primaryOrgId === 'org-firm-adv';
                  const discipline = isAdv ? 'ADVISORY' : 'ACCOUNTING';
                  const assigned = state.assignments.find(
                    (a) => a.clientId === cli.id && a.userId === prof.id && a.discipline === discipline
                  );
                  return (
                    <div
                      key={prof.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                    >
                      <div>
                        <div className="font-medium">{prof.fullName}</div>
                        <div className="text-[11px] text-slate-500">
                          {discipline === 'ADVISORY' ? 'Asesoría Financiera' : 'Contabilidad y Fiscal'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          toggleProfessionalAssignment(
                            cli.id,
                            prof.id,
                            prof.primaryOrgId,
                            discipline,
                            isAdv
                          )
                        }
                        className={`rounded-lg px-3 py-1 font-medium ${
                          assigned
                            ? 'bg-teal-600 text-white'
                            : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {assigned ? 'Asignado' : 'Asignar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>
      </div>
    );
  }

  if (activeSection === 'auditoria') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Registro de Auditoría"
          subtitle="Trazabilidad completa de acciones privilegiadas, cierres de periodo, cambios RBAC y aprobaciones."
        />
        <Panel padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                  <th className="px-4 py-3 font-medium">Fecha y hora</th>
                  <th className="px-4 py-3 font-medium">Actor / Rol</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {state.auditEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">{formatDateTimeEs(ev.timestamp)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{ev.actorName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{ev.actorRole}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-teal-700 dark:text-teal-400">{ev.action}</td>
                    <td className="px-4 py-2.5">{ev.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  if (activeSection === 'sistema') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Configuración, Invariantes y Arquitectura Técnica"
          subtitle="Verificación automática del modelo de datos, registro de madurez de módulos, esquema MySQL y API PHP 8.x."
          actions={
            can('system.config.manage') ? (
              <button
                type="button"
                onClick={resetDemoData}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-rose-300 px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Restablecer datos demo iniciales</span>
              </button>
            ) : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 w-fit">
          {[
            { k: 'INVARIANTS', l: 'Invariantes de Dominio (QA)' },
            { k: 'FEATURES', l: 'Registro de Madurez' },
            { k: 'MYSQL', l: 'Esquema MySQL (Borrador)' },
            { k: 'API', l: 'Contrato API PHP 8.x' },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setSpecTab(t.k as typeof specTab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                specTab === t.k
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        {specTab === 'INVARIANTS' && (
          <Panel className="space-y-3">
            <h2 className="font-display text-base font-semibold">
              Comprobación en vivo de invariantes de negocio ({invariantResults.filter((r) => r.passed).length}/{invariantResults.length} superados)
            </h2>
            <div className="divide-y divide-slate-200 text-xs dark:divide-slate-800">
              {invariantResults.map((res) => (
                <div key={res.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">{res.name}</div>
                    <div className="text-slate-600 dark:text-slate-400">{res.details}</div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 font-medium shrink-0">
                    {res.passed ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700 dark:text-emerald-400">Superado</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-rose-600" />
                        <span className="text-rose-700 dark:text-rose-400">Fallo</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {specTab === 'FEATURES' && (
          <Panel padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-4 py-3 font-medium">Módulo</th>
                    <th className="px-4 py-3 font-medium">Funcionalidad</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {FEATURE_STATUS_REGISTRY.map((f) => (
                    <tr key={f.id}>
                      <td className="px-4 py-2.5 font-medium">{f.module}</td>
                      <td className="px-4 py-2.5">{f.feature}</td>
                      <td className="px-4 py-2.5">
                        <StatusLabel
                          text={f.status}
                          tone={
                            f.status === 'FUNCTIONAL_DEMO'
                              ? 'success'
                              : f.status === 'SIMULATED_INTEGRATION'
                              ? 'warning'
                              : f.status === 'BLOCKED'
                              ? 'danger'
                              : 'info'
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {specTab === 'MYSQL' && (
          <Panel className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Database className="h-4 w-4" />
              <span>Especificación DDL MySQL 8.x para Fase 2 (sujeta a verificación previa del entorno Bluehost).</span>
            </div>
            <pre className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-[11px] text-slate-100 dark:border-slate-800">
              {DRAFT_MYSQL_SCHEMA_SQL}
            </pre>
          </Panel>
        )}

        {specTab === 'API' && (
          <Panel padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
                    <th className="px-4 py-3 font-medium">Método</th>
                    <th className="px-4 py-3 font-medium">Endpoint REST</th>
                    <th className="px-4 py-3 font-medium">Permiso RBAC</th>
                    <th className="px-4 py-3 font-medium">Responsabilidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {PHP_REST_API_ENDPOINTS.map((ep) => (
                    <tr key={ep.path}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-teal-700 dark:text-teal-400">{ep.method}</td>
                      <td className="px-4 py-2.5 font-mono">{ep.path}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{ep.requiredPermission}</td>
                      <td className="px-4 py-2.5">{ep.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    );
  }

  // Default: ROLES Y PERMISOS RBAC
  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles y Permisos RBAC"
        subtitle="Crea, clona y configura permisos granulares. Los cambios tienen efecto inmediato en la navegación y capacidades de cada usuario."
        actions={
          can('roles.manage') ? (
            <button
              type="button"
              onClick={() => setNewRoleOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-600"
            >
              <Plus className="h-4 w-4" />
              <span>Crear o clonar rol</span>
            </button>
          ) : undefined
        }
      />

      {!can('roles.manage') && (
        <LegalNoticeBanner
          text="Tu rol actual no tiene permiso roles.manage. Puedes consultar la matriz en modo lectura; cambia a Superadministrador de Plataforma para crear o editar permisos."
          tone="info"
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Role List */}
        <Panel className="space-y-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Shield className="h-4 w-4" />
            <span>Roles definidos ({state.roles.length})</span>
          </div>
          {state.roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRoleId(r.id)}
              className={`w-full rounded-xl border p-3 text-left text-xs transition-colors ${
                selectedRole?.id === r.id
                  ? 'border-teal-600 bg-teal-50/40 dark:border-teal-500 dark:bg-teal-950/20'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</span>
                <span className="font-mono text-[11px] text-slate-500">{r.permissions.length}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Ámbito {r.scope} · {r.isSystem ? 'Base' : 'Personalizado'}
              </div>
            </button>
          ))}
        </Panel>

        {/* Permission Matrix for Selected Role */}
        <Panel className="space-y-4 lg:col-span-2">
          {selectedRole && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold">{selectedRole.name}</h2>
                  <p className="text-xs text-slate-500">
                    Código: <span className="font-mono">{selectedRole.code}</span> · {selectedRole.description}
                  </p>
                </div>
                {can('roles.manage') && (
                  <button
                    type="button"
                    onClick={() => {
                      setCloneFromRoleId(selectedRole.id);
                      setNewRoleName(`${selectedRole.name} (Copia)`);
                      setNewRoleScope(selectedRole.scope);
                      setNewRoleOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" /> Clonar rol
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMISSION_CATALOG.map((perm) => {
                  const checked = selectedRole.permissions.includes(perm.code);
                  return (
                    <label
                      key={perm.code}
                      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                        checked
                          ? 'border-teal-500/50 bg-teal-50/30 dark:bg-teal-950/20'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!can('roles.manage')}
                        checked={checked}
                        onChange={() => handleTogglePermission(selectedRole, perm.code)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600"
                      />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {perm.label}
                          {perm.sensitive && (
                            <span className="ml-1.5 text-[10px] font-mono text-amber-700 dark:text-amber-400">
                              [Sensible]
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">{perm.code}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      </div>

      <ModalDialog open={newRoleOpen} onClose={() => setNewRoleOpen(false)} title="Crear o clonar rol RBAC">
        <form onSubmit={handleCreateOrCloneRole} className="space-y-4 text-xs">
          <label className="block">
            <span>Nombre del nuevo rol</span>
            <input
              type="text"
              required
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span>Ámbito</span>
              <select
                value={newRoleScope}
                onChange={(e) => setNewRoleScope(e.target.value as Role['scope'])}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="FIRM">Despacho / Firma</option>
                <option value="CLIENT">Organización Cliente</option>
                <option value="PLATFORM">Plataforma</option>
              </select>
            </label>
            <label className="block">
              <span>Clonar permisos base desde</span>
              <select
                value={cloneFromRoleId}
                onChange={(e) => setCloneFromRoleId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {state.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setNewRoleOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700">
              Cancelar
            </button>
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
              <Users className="h-4 w-4" /> Crear rol
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
