import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Camera,
  CheckSquare,
  Compass,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Home,
  Inbox,
  Landmark,
  Layers,
  Lock,
  Menu,
  MessageSquare,
  Moon,
  PieChart,
  Scale,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  Target,
  TrendingUp,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../services/useAppStore';
import { useTheme } from '../hooks/useTheme';
import { isModuleVisibleForClient } from '../domain/rbac';
import { DemoPersona, PermissionCode } from '../types/domain';
import { DemoEntryScreen } from '../features/entry/DemoEntryScreen';
import { ClientPortalHome, ClientProfileSettingsView } from '../features/client-pwa/ClientPortalHome';
import { DocumentInboxView } from '../features/documents/DocumentInboxView';
import { DocumentUploadModal } from '../features/documents/DocumentUploadModal';
import { InvoicingWorkspace } from '../features/invoicing/InvoicingWorkspace';
import { AccountingWorkspace } from '../features/accounting/AccountingWorkspace';
import { TaxWorkspace } from '../features/tax/TaxWorkspace';
import { TreasuryWorkspace } from '../features/treasury/TreasuryWorkspace';
import { GoalsView } from '../features/goals/GoalsView';
import { AdvisoryWorkspace } from '../features/advisory/AdvisoryWorkspace';
import { CollaborationView } from '../features/collaboration/CollaborationView';
import { AdminWorkspace } from '../features/admin/AdminWorkspace';
import { OfflineIndicator, PWAInstallButton } from '../components/ui/PWAComponents';
import { Panel } from '../components/ui/Surface';
import { VegenLogo } from '../components/ui/VegenLogo';
import { PersonaSelectorPopover } from '../components/ui/PersonaSelectorPopover';

type WorkspaceKind = DemoPersona['workspaceKind'];

interface NavItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: PermissionCode;
  sectionGroup?: string;
}

const CLIENT_NAV: NavItem[] = [
  { id: 'inicio', label: 'Inicio', shortLabel: 'Inicio', icon: Home },
  { id: 'documentos', label: 'Documentos', shortLabel: 'Docs', icon: Inbox, requiredPermission: 'documents.read' },
  { id: 'facturas', label: 'Facturas', shortLabel: 'Facturas', icon: FileText, requiredPermission: 'invoices.read' },
  { id: 'bancos', label: 'Bancos y Tesorería', shortLabel: 'Bancos', icon: Landmark, requiredPermission: 'treasury.read' },
  { id: 'contabilidad', label: 'Contabilidad', shortLabel: 'Contab.', icon: BookOpen, requiredPermission: 'accounting.entries.read' },
  { id: 'impuestos', label: 'Impuestos', shortLabel: 'Impuestos', icon: FileCheck2, requiredPermission: 'tax.drafts.generate' },
  { id: 'objetivos', label: 'Objetivos', shortLabel: 'Metas', icon: Target, requiredPermission: 'finance.goals.manage' },
  { id: 'plan', label: 'Mi Plan Financiero', shortLabel: 'Mi Plan', icon: Compass, requiredPermission: 'finance.profile.read' },
  { id: 'mensajes', label: 'Mensajes y Solicitudes', shortLabel: 'Mensajes', icon: MessageSquare, requiredPermission: 'messages.client.send' },
  { id: 'perfil', label: 'Perfil y Configuración', shortLabel: 'Perfil', icon: UserCircle },
];

const ACCOUNTING_NAV: NavItem[] = [
  { id: 'panel', label: 'Panel de Gestoría', shortLabel: 'Panel', icon: Activity, sectionGroup: 'Operativa' },
  { id: 'clientes', label: 'Cartera de Clientes', shortLabel: 'Clientes', icon: Users, sectionGroup: 'Operativa' },
  { id: 'bandeja', label: 'Bandeja de Documentos', shortLabel: 'Docs', icon: Inbox, requiredPermission: 'documents.read', sectionGroup: 'Operativa' },
  { id: 'facturas', label: 'Facturas', shortLabel: 'Facturas', icon: FileText, requiredPermission: 'invoices.read', sectionGroup: 'Operativa' },
  { id: 'asientos', label: 'Asientos Contables', shortLabel: 'Asientos', icon: BookOpen, requiredPermission: 'accounting.entries.read', sectionGroup: 'Contabilidad PGC' },
  { id: 'plan', label: 'Plan Contable', shortLabel: 'PGC', icon: Layers, requiredPermission: 'accounting.entries.read', sectionGroup: 'Contabilidad PGC' },
  { id: 'libros', label: 'Libros Contables', shortLabel: 'Libros', icon: Scale, requiredPermission: 'accounting.reports.read', sectionGroup: 'Contabilidad PGC' },
  { id: 'conciliacion', label: 'Conciliación', shortLabel: 'Bancos', icon: Landmark, requiredPermission: 'treasury.reconciliation.approve', sectionGroup: 'Tesorería y Fiscal' },
  { id: 'obligaciones', label: 'Obligaciones Fiscales', shortLabel: 'Oblig.', icon: CheckSquare, requiredPermission: 'tax.obligations.manage', sectionGroup: 'Tesorería y Fiscal' },
  { id: 'declaraciones', label: 'Declaraciones (Mod. 303)', shortLabel: 'Mod. 303', icon: FileCheck2, requiredPermission: 'tax.drafts.generate', sectionGroup: 'Tesorería y Fiscal' },
  { id: 'informes', label: 'Informes Contables', shortLabel: 'Informes', icon: BarChart3, requiredPermission: 'accounting.reports.read', sectionGroup: 'Tesorería y Fiscal' },
  { id: 'mensajes', label: 'Incidencias y Solicitudes', shortLabel: 'Mensajes', icon: MessageSquare, sectionGroup: 'Colaboración' },
  { id: 'auditoria', label: 'Auditoría', shortLabel: 'Auditoría', icon: Shield, requiredPermission: 'audit.read', sectionGroup: 'Colaboración' },
];

const ADVISORY_NAV: NavItem[] = [
  { id: 'panel', label: 'Panel Financiero', shortLabel: 'Panel', icon: Activity, sectionGroup: 'Cartera' },
  { id: 'clientes', label: 'Cartera de Clientes', shortLabel: 'Clientes', icon: Users, sectionGroup: 'Cartera' },
  { id: 'diagnostico', label: 'Diagnóstico Financiero', shortLabel: 'Diagnóstico', icon: PieChart, requiredPermission: 'finance.profile.read', sectionGroup: 'Análisis' },
  { id: 'tesoreria', label: 'Tesorería y Liquidez', shortLabel: 'Liquidez', icon: Landmark, requiredPermission: 'treasury.read', sectionGroup: 'Análisis' },
  { id: 'patrimonio', label: 'Patrimonio', shortLabel: 'Patrimonio', icon: Briefcase, requiredPermission: 'finance.profile.read', sectionGroup: 'Análisis' },
  { id: 'presupuestos', label: 'Presupuestos', shortLabel: 'Presup.', icon: FileSpreadsheet, requiredPermission: 'finance.profile.read', sectionGroup: 'Planificación' },
  { id: 'objetivos', label: 'Objetivos', shortLabel: 'Objetivos', icon: Target, requiredPermission: 'finance.goals.propose', sectionGroup: 'Planificación' },
  { id: 'planes', label: 'Planes Financieros', shortLabel: 'Planes', icon: Compass, requiredPermission: 'finance.plans.create', sectionGroup: 'Planificación' },
  { id: 'escenarios', label: 'Escenarios', shortLabel: 'Escenarios', icon: TrendingUp, requiredPermission: 'finance.plans.create', sectionGroup: 'Planificación' },
  { id: 'inversiones', label: 'Inversiones', shortLabel: 'Inversión', icon: Layers, requiredPermission: 'finance.profile.read', sectionGroup: 'Seguimiento' },
  { id: 'seguimiento', label: 'Seguimiento', shortLabel: 'Control', icon: CheckSquare, requiredPermission: 'finance.profile.read', sectionGroup: 'Seguimiento' },
  { id: 'informes', label: 'Informes', shortLabel: 'Informes', icon: BarChart3, requiredPermission: 'finance.profile.read', sectionGroup: 'Seguimiento' },
  { id: 'mensajes', label: 'Comunicación con Clientes', shortLabel: 'Mensajes', icon: MessageSquare, sectionGroup: 'Seguimiento' },
];

const ADMIN_NAV: NavItem[] = [
  { id: 'organizaciones', label: 'Organizaciones', shortLabel: 'Orgs', icon: Building2, sectionGroup: 'Plataforma' },
  { id: 'usuarios', label: 'Usuarios e Invitaciones', shortLabel: 'Usuarios', icon: Users, requiredPermission: 'users.manage', sectionGroup: 'Plataforma' },
  { id: 'roles', label: 'Roles y Permisos RBAC', shortLabel: 'RBAC', icon: Shield, requiredPermission: 'roles.manage', sectionGroup: 'Seguridad' },
  { id: 'asignaciones', label: 'Asignaciones', shortLabel: 'Asign.', icon: SlidersHorizontal, requiredPermission: 'assignments.manage', sectionGroup: 'Seguridad' },
  { id: 'auditoria', label: 'Auditoría', shortLabel: 'Auditoría', icon: Activity, requiredPermission: 'audit.read', sectionGroup: 'Gobernanza' },
  { id: 'sistema', label: 'Sistema, Invariantes y SQL', shortLabel: 'Sistema', icon: Settings, requiredPermission: 'system.config.manage', sectionGroup: 'Gobernanza' },
];

function getDefaultRoute(kind: WorkspaceKind): string {
  if (kind === 'CLIENT_PWA') return 'inicio';
  if (kind === 'ADMIN') return 'roles';
  return 'panel';
}

export const AppShell: React.FC = () => {
  const {
    state,
    activePersona,
    activeRole,
    accessibleClients,
    can,
    switchPersona,
    setSelectedClientId,
  } = useAppStore();
  const { theme, toggleTheme } = useTheme();

  const [showEntryScreen, setShowEntryScreen] = useState(true);
  const [activeWorkspaceOverride, setActiveWorkspaceOverride] = useState<WorkspaceKind | null>(null);
  const [activeRoute, setActiveRoute] = useState<string>('inicio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickUploadOpen, setQuickUploadOpen] = useState(false);

  const effectiveWorkspace: WorkspaceKind =
    activeWorkspaceOverride ?? activePersona.workspaceKind;

  const selectedClient = useMemo(
    () => accessibleClients.find((c) => c.id === state.selectedClientId) ?? accessibleClients[0],
    [accessibleClients, state.selectedClientId]
  );

  // Sync default route when persona changes
  useEffect(() => {
    setActiveWorkspaceOverride(null);
  }, [activePersona.id]);

  const rawNavItems = useMemo(() => {
    if (effectiveWorkspace === 'CLIENT_PWA') return CLIENT_NAV;
    if (effectiveWorkspace === 'ACCOUNTING') return ACCOUNTING_NAV;
    if (effectiveWorkspace === 'ADVISORY') return ADVISORY_NAV;
    return ADMIN_NAV;
  }, [effectiveWorkspace]);

  const visibleNavItems = useMemo(() => {
    return rawNavItems.filter((item) => {
      if (item.requiredPermission && !can(item.requiredPermission)) {
        return false;
      }
      if (effectiveWorkspace === 'CLIENT_PWA' && selectedClient) {
        return isModuleVisibleForClient(selectedClient, item.id);
      }
      return true;
    });
  }, [rawNavItems, can, effectiveWorkspace, selectedClient]);

  // Keep activeRoute valid if RBAC permissions or client profile change
  useEffect(() => {
    if (visibleNavItems.length > 0 && !visibleNavItems.some((n) => n.id === activeRoute)) {
      setActiveRoute(visibleNavItems[0].id);
    }
  }, [visibleNavItems, activeRoute]);

  const handleEnterWorkspace = (initialRoute?: string) => {
    setShowEntryScreen(false);
    setActiveWorkspaceOverride(null);
    setActiveRoute(initialRoute || getDefaultRoute(activePersona.workspaceKind));
  };

  const handleSwitchPersona = (personaId: string) => {
    const nextP = state.personas.find((p) => p.id === personaId);
    switchPersona(personaId);
    setActiveWorkspaceOverride(null);
    if (nextP) {
      setActiveRoute(getDefaultRoute(nextP.workspaceKind));
    }
    setMobileMenuOpen(false);
  };

  const canSwitchToAdmin =
    can('roles.manage') || can('users.manage') || can('assignments.manage') || can('system.config.manage');
  const canSwitchToAccounting =
    activePersona.workspaceKind !== 'CLIENT_PWA' &&
    (can('accounting.entries.read') || can('documents.review'));

  if (showEntryScreen) {
    return (
      <>
        <DemoEntryScreen onEnterWorkspace={handleEnterWorkspace} />
        <OfflineIndicator />
      </>
    );
  }

  const workspaceLabel =
    effectiveWorkspace === 'CLIENT_PWA'
      ? 'Portal del Cliente'
      : effectiveWorkspace === 'ACCOUNTING'
      ? 'Gestoría Contable y Fiscal'
      : effectiveWorkspace === 'ADVISORY'
      ? 'Asesoría Financiera'
      : 'Administración y RBAC';

  const renderMainContent = () => {
    if (!selectedClient && effectiveWorkspace !== 'ADMIN') {
      return (
        <Panel className="space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Lock className="h-4 w-4" />
            <span>Sin clientes asignados o autorizados</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Tu usuario actual no tiene clientes asignados en la matriz de aislamiento. Cambia de persona o asigna un cliente en Administración.
          </p>
        </Panel>
      );
    }

    if (effectiveWorkspace === 'CLIENT_PWA' && selectedClient) {
      switch (activeRoute) {
        case 'inicio':
          return <ClientPortalHome onNavigate={setActiveRoute} />;
        case 'documentos':
          return (
            <DocumentInboxView
              clientId={selectedClient.id}
              isClientMode
              onNavigateToAccounting={() => setActiveRoute('contabilidad')}
            />
          );
        case 'facturas':
          return <InvoicingWorkspace clientId={selectedClient.id} />;
        case 'bancos':
          return <TreasuryWorkspace clientIdFilter={selectedClient.id} defaultTab="OVERVIEW" />;
        case 'contabilidad':
          return <AccountingWorkspace activeSection="asientos" clientIdFilter={selectedClient.id} onNavigate={setActiveRoute} />;
        case 'impuestos':
          return <TaxWorkspace mode="DECLARATIONS" clientIdFilter={selectedClient.id} />;
        case 'objetivos':
          return <GoalsView clientIdFilter={selectedClient.id} />;
        case 'plan':
          return <AdvisoryWorkspace activeSection="client_plan" clientIdFilter={selectedClient.id} />;
        case 'mensajes':
          return <CollaborationView clientIdFilter={selectedClient.id} />;
        case 'perfil':
          return <ClientProfileSettingsView />;
        default:
          return <ClientPortalHome onNavigate={setActiveRoute} />;
      }
    }

    if (effectiveWorkspace === 'ACCOUNTING') {
      switch (activeRoute) {
        case 'panel':
        case 'clientes':
        case 'asientos':
        case 'plan':
        case 'libros':
        case 'informes':
          return (
            <AccountingWorkspace
              activeSection={activeRoute}
              onNavigate={setActiveRoute}
            />
          );
        case 'bandeja':
        case 'documentos':
          return (
            <DocumentInboxView
              onNavigateToAccounting={() => setActiveRoute('asientos')}
            />
          );
        case 'facturas':
          return <InvoicingWorkspace />;
        case 'conciliacion':
          return <TreasuryWorkspace defaultTab="RECONCILIATION" />;
        case 'obligaciones':
          return <TaxWorkspace mode="OBLIGATIONS" />;
        case 'declaraciones':
          return <TaxWorkspace mode="DECLARATIONS" />;
        case 'mensajes':
          return <CollaborationView />;
        case 'auditoria':
          return <AdminWorkspace activeSection="auditoria" />;
        default:
          return <AccountingWorkspace activeSection="panel" onNavigate={setActiveRoute} />;
      }
    }

    if (effectiveWorkspace === 'ADVISORY') {
      switch (activeRoute) {
        case 'panel':
        case 'clientes':
        case 'diagnostico':
        case 'patrimonio':
        case 'presupuestos':
        case 'planes':
        case 'escenarios':
        case 'inversiones':
        case 'seguimiento':
        case 'informes':
          return (
            <AdvisoryWorkspace
              activeSection={activeRoute}
              onNavigate={setActiveRoute}
            />
          );
        case 'tesoreria':
          return <TreasuryWorkspace defaultTab="FORECAST" />;
        case 'objetivos':
          return <GoalsView />;
        case 'mensajes':
          return <CollaborationView />;
        default:
          return <AdvisoryWorkspace activeSection="panel" onNavigate={setActiveRoute} />;
      }
    }

    // ADMIN WORKSPACE
    switch (activeRoute) {
      case 'organizaciones':
      case 'usuarios':
      case 'roles':
      case 'asignaciones':
      case 'auditoria':
      case 'sistema':
        return <AdminWorkspace activeSection={activeRoute} />;
      default:
        return <AdminWorkspace activeSection="roles" />;
    }
  };

  // Primary mobile bottom tabs (max 4 + Más)
  const mobileBottomItems = visibleNavItems.slice(0, effectiveWorkspace === 'CLIENT_PWA' ? 2 : 3);
  const mobileBottomTail =
    effectiveWorkspace === 'CLIENT_PWA'
      ? visibleNavItems.filter((i) => i.id === 'objetivos' || i.id === 'mensajes').slice(0, 1)
      : [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Compact Sticky Top Bar (48px) */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menú de navegación"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowEntryScreen(true)}
            className="flex items-center rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Volver a la pantalla de acceso demo"
          >
            <VegenLogo compact />
          </button>

          <span className="hidden text-xs text-slate-300 dark:text-slate-700 sm:inline">|</span>
          <span className="hidden truncate text-xs font-medium text-slate-600 dark:text-slate-300 sm:inline">
            {workspaceLabel}
          </span>

          {/* Persistent unobtrusive demo mode indicator */}
          <span className="hidden rounded border border-amber-300/80 bg-amber-50/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 lg:inline-block whitespace-nowrap">
            ENTORNO DEMOSTRACIÓN
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Client context selector for multi-client professionals */}
          {accessibleClients.length > 1 && effectiveWorkspace !== 'ADMIN' && (
            <select
              aria-label="Seleccionar cliente activo"
              value={selectedClient?.id ?? ''}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="hidden max-w-[175px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 lg:block"
            >
              {accessibleClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          )}

          {/* Compact Persona Selector Popover (Desktop & Mobile) */}
          <PersonaSelectorPopover
            onSelectPersona={handleSwitchPersona}
            onReturnToLogin={() => setShowEntryScreen(true)}
          />

          <div className="hidden sm:block">
            <PWAInstallButton compact />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 shrink-0"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        {/* Desktop Sidebar */}
        <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:flex">
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Active role & workspace summary */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activePersona.label}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Rol: {activeRole?.name ?? 'Sin rol'}
              </div>
              {(canSwitchToAdmin || canSwitchToAccounting) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-800">
                  {canSwitchToAccounting && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceOverride('ACCOUNTING');
                        setActiveRoute('panel');
                      }}
                      className={`rounded px-2 py-1 text-[11px] font-medium ${
                        effectiveWorkspace === 'ACCOUNTING'
                          ? 'bg-[#1E293B] text-white dark:bg-[#228B22]'
                          : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Gestoría
                    </button>
                  )}
                  {canSwitchToAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceOverride('ADMIN');
                        setActiveRoute(can('roles.manage') ? 'roles' : 'organizaciones');
                      }}
                      className={`rounded px-2 py-1 text-[11px] font-medium ${
                        effectiveWorkspace === 'ADMIN'
                          ? 'bg-[#1E293B] text-white dark:bg-[#228B22]'
                          : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Admin RBAC
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Client Quick Upload CTA */}
            {effectiveWorkspace === 'CLIENT_PWA' && can('documents.upload') && (
              <button
                type="button"
                onClick={() => setQuickUploadOpen(true)}
                className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#228B22] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1b701b] dark:bg-[#228B22] dark:hover:bg-[#28C76F]"
              >
                <Camera className="h-4 w-4" />
                <span>Subir documento</span>
              </button>
            )}

            {/* Navigation List */}
            <nav aria-label="Navegación principal" className="space-y-0.5">
              {visibleNavItems.map((item, idx) => {
                const Icon = item.icon;
                const active = activeRoute === item.id;
                const prevGroup = idx > 0 ? visibleNavItems[idx - 1].sectionGroup : undefined;
                const showGroupHeader = item.sectionGroup && item.sectionGroup !== prevGroup;
                return (
                  <React.Fragment key={item.id}>
                    {showGroupHeader && (
                      <div className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {item.sectionGroup}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveRoute(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#28C76F]/12 text-[#228B22] dark:bg-[#28C76F]/15 dark:text-[#4ADE80]'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#228B22] dark:text-[#4ADE80]' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setShowEntryScreen(true)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-center font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Volver al acceso demo
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 md:pb-10">
          {/* Quick client selector for multi-client users on small/tablet screens */}
          {accessibleClients.length > 1 && effectiveWorkspace !== 'ADMIN' && (
            <div className="mb-4 lg:hidden">
              <select
                aria-label="Seleccionar cliente activo móvil"
                value={selectedClient?.id ?? ''}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
              >
                {accessibleClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    Cliente activo: {c.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {renderMainContent()}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (56px, <= 15% combined with 48px header) */}
      <nav
        aria-label="Navegación móvil"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t border-slate-200 bg-white/95 px-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
      >
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveRoute(item.id)}
              className={`flex min-w-[56px] flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium ${
                active ? 'text-[#228B22] dark:text-[#4ADE80]' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.shortLabel || item.label}</span>
            </button>
          );
        })}

        {effectiveWorkspace === 'CLIENT_PWA' && can('documents.upload') && (
          <button
            type="button"
            onClick={() => setQuickUploadOpen(true)}
            className="flex min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-xl bg-[#228B22] px-3 py-1.5 text-[10px] font-semibold text-white"
          >
            <Camera className="h-4 w-4" />
            <span>Subir</span>
          </button>
        )}

        {mobileBottomTail.map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveRoute(item.id)}
              className={`flex min-w-[56px] flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium ${
                active ? 'text-[#228B22] dark:text-[#4ADE80]' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.shortLabel || item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-w-[56px] flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium text-slate-500 dark:text-slate-400"
        >
          <Menu className="h-4 w-4" />
          <span>Más</span>
        </button>
      </nav>

      {/* Mobile Full Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col justify-between bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div className="space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <div className="font-display text-sm font-bold">Vegen Finance Hub</div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400">ENTORNO DEMOSTRACIÓN</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {(canSwitchToAdmin || canSwitchToAccounting) && (
                <div className="flex gap-1.5">
                  {canSwitchToAccounting && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceOverride('ACCOUNTING');
                        setActiveRoute('panel');
                        setMobileMenuOpen(false);
                      }}
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium dark:border-slate-700"
                    >
                      Gestoría
                    </button>
                  )}
                  {canSwitchToAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceOverride('ADMIN');
                        setActiveRoute(can('roles.manage') ? 'roles' : 'organizaciones');
                        setMobileMenuOpen(false);
                      }}
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium dark:border-slate-700"
                    >
                      Admin RBAC
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeRoute === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveRoute(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium ${
                        active
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowEntryScreen(true);
                }}
                className="w-full rounded-lg border border-slate-300 py-2 text-xs font-medium dark:border-slate-700"
              >
                Volver al selector de personas
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <DocumentUploadModal
          open={quickUploadOpen}
          onClose={() => setQuickUploadOpen(false)}
          clientId={selectedClient.id}
        />
      )}

      <OfflineIndicator />
    </div>
  );
};
