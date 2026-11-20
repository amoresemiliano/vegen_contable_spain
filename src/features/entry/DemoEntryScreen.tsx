import React from 'react';
import {
  ArrowRight,
  Building2,
  Calculator,
  Compass,
  Landmark,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { Panel } from '../../components/ui/Surface';

interface DemoEntryScreenProps {
  onEnterWorkspace: (initialRoute?: string) => void;
}

export const DemoEntryScreen: React.FC<DemoEntryScreenProps> = ({ onEnterWorkspace }) => {
  const { state, switchPersona } = useAppStore();

  const handleSelectPersona = (personaId: string, route?: string) => {
    switchPersona(personaId);
    onEnterWorkspace(route);
  };

  const journeys = [
    {
      num: '01',
      title: 'Documento a Contabilidad',
      desc: 'El cliente sube una factura, la IA extrae campos, el contable corrige y genera el asiento cuadrado.',
      personaId: 'persona-client-a-admin',
      route: 'documentos',
      actionLabel: 'Iniciar como Cliente',
    },
    {
      num: '02',
      title: 'Contabilidad a Modelo 303',
      desc: 'Cálculo simplificado de IVA repercutido y soportado desde facturas validadas hasta borrador listo.',
      personaId: 'persona-accountant',
      route: 'declaraciones',
      actionLabel: 'Abrir Centro Fiscal',
    },
    {
      num: '03',
      title: 'Banco a Tesorería y Conciliación',
      desc: 'Importa un extracto CSV con rechazo de duplicados y valida propuestas deterministas banco-factura.',
      personaId: 'persona-accountant',
      route: 'conciliacion',
      actionLabel: 'Conciliar Bancos',
    },
    {
      num: '04',
      title: 'Tesorería a Plan Financiero',
      desc: 'El asesor analiza liquidez, define metas, compara 3 escenarios y publica el plan al cliente.',
      personaId: 'persona-advisor',
      route: 'planes',
      actionLabel: 'Abrir Planificador',
    },
    {
      num: '05',
      title: 'Administración y Permisos RBAC',
      desc: 'Crea o clona roles, ajusta permisos granulares y comprueba la restricción inmediata al cambiar de persona.',
      personaId: 'persona-superadmin',
      route: 'roles',
      actionLabel: 'Gestionar RBAC',
    },
    {
      num: '06',
      title: 'Comunicación y Solicitudes',
      desc: 'El contable solicita un justificante, el cliente responde desde la PWA y el estado se actualiza.',
      personaId: 'persona-client-a-admin',
      route: 'mensajes',
      actionLabel: 'Ver Timeline',
    },
  ];

  const iconForWorkspace = (kind: string) => {
    if (kind === 'ACCOUNTING') return Calculator;
    if (kind === 'ADVISORY') return Compass;
    if (kind === 'ADMIN') return ShieldCheck;
    return Building2;
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Hero */}
        <div className="flex flex-col gap-6 border-b border-slate-200 pb-8 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
              ENTORNO DEMOSTRACIÓN · ESPAÑA · DATOS SINTÉTICOS
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl text-balance">
              VEGEN Finance Spain
            </h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Plataforma SaaS integral que conecta en un único modelo de datos la gestión documental del cliente,
              la contabilidad PGC y cumplimiento fiscal del despacho, la tesorería bancaria y la planificación
              financiera personalizada.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 lg:max-w-sm">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Alcance verificado del MVP Fase 1
            </div>
            <p className="mt-1 leading-relaxed">
              Todos los registros fiscales, bancarios y de facturación son sintéticos. No realiza envíos a AEAT,
              conexiones bancarias reales ni facturación VERI*FACTU oficial.
            </p>
          </div>
        </div>

        {/* Persona Selection */}
        <section aria-labelledby="personas-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="personas-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Seleccionar persona de demostración
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Cada perfil adapta la navegación, el aislamiento por cliente, los permisos RBAC y las acciones disponibles.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {state.personas.map((persona) => {
              const Icon = iconForWorkspace(persona.workspaceKind);
              const role = state.roles.find((r) => r.id === persona.roleId);
              const isCurrent = state.activePersonaId === persona.id;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => handleSelectPersona(persona.id)}
                  className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    isCurrent
                      ? 'border-teal-600 bg-teal-50/40 dark:border-teal-500 dark:bg-teal-950/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {persona.workspaceKind === 'CLIENT_PWA'
                          ? 'Portal Cliente'
                          : persona.workspaceKind === 'ACCOUNTING'
                          ? 'Gestoría'
                          : persona.workspaceKind === 'ADVISORY'
                          ? 'Asesoría'
                          : 'Administración'}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {persona.label}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {persona.subtitle}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {role?.permissions.length ?? 0} permisos
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-teal-700 group-hover:translate-x-0.5 transition-transform dark:text-teal-400">
                      Entrar <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Guided End-to-End Stakeholder Journeys */}
        <section aria-labelledby="journeys-heading">
          <div className="mb-4">
            <h2 id="journeys-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recorridos guiados de validación (End-to-End)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Todos los módulos comparten el mismo estado vivo: cualquier cambio contable, bancario o documental repercute en el resto de pantallas.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {journeys.map((j) => (
              <Panel key={j.num} padding="sm" className="flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono font-medium text-teal-700 dark:text-teal-400">
                    {j.num}. Recorrido verificado
                  </div>
                  <h3 className="mt-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {j.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {j.desc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectPersona(j.personaId, j.route)}
                  className="mt-4 inline-flex min-h-[40px] items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span>{j.actionLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </Panel>
            ))}
          </div>
        </section>

        {/* Value Summary Footer */}
        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-6 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:grid-cols-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400 shrink-0" />
            <span>4 perfiles cliente (SL, Hostelería, Autónoma, Particular)</span>
          </div>
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{state.invoices.length} facturas · {state.bankTransactions.length} mov. bancarios</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{state.journalEntries.length} asientos PGC · 19 modelos fiscales</span>
          </div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{state.financialPlans.length} planes · {state.financialGoals.length} objetivos activos</span>
          </div>
        </div>
      </div>
    </div>
  );
};
