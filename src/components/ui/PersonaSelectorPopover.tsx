import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Calculator,
  Check,
  ChevronDown,
  Compass,
  LogOut,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';

interface PersonaSelectorPopoverProps {
  onSelectPersona: (personaId: string) => void;
  onReturnToLogin: () => void;
}

const WORKSPACE_LABELS: Record<string, string> = {
  CLIENT_PWA: 'Portal Cliente',
  ACCOUNTING: 'Gestoría',
  ADVISORY: 'Asesoría',
  ADMIN: 'Administración',
};

function iconForWorkspace(kind: string) {
  if (kind === 'ACCOUNTING') return Calculator;
  if (kind === 'ADVISORY') return Compass;
  if (kind === 'ADMIN') return ShieldCheck;
  return Building2;
}

export const PersonaSelectorPopover: React.FC<PersonaSelectorPopoverProps> = ({
  onSelectPersona,
  onReturnToLogin,
}) => {
  const { state, activePersona, activeRole } = useAppStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const ActiveIcon = iconForWorkspace(activePersona.workspaceKind);
  const activeOrg = state.organizations.find((o) => o.id === activePersona.organizationId);

  return (
    <div ref={containerRef} className="relative">
      {/* Compact Header Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Cambiar persona de demostración"
        className="inline-flex min-h-[36px] max-w-[185px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#228B22] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:max-w-[260px]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#28C76F]/15 text-[#228B22] dark:text-[#4ADE80]">
          <ActiveIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate font-semibold">{activePersona.label}</span>
        <span className="hidden shrink-0 text-[11px] text-slate-500 dark:text-slate-400 md:inline">
          · {WORKSPACE_LABELS[activePersona.workspaceKind]}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Popover Panel (Responsive Desktop Popover / Mobile Sheet) */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/35 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Selector de personas de demostración"
            className="fixed inset-x-3 top-14 z-50 flex max-h-[82vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[660px]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#228B22] dark:text-[#28C76F]" aria-hidden="true" />
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Cambiar persona de demostración
                  </h2>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  Sesión activa: <strong>{activePersona.label}</strong> · {activeOrg?.name} · Rol:{' '}
                  {activeRole?.name ?? 'Sin rol'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar selector de personas"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Persona Cards Grid */}
            <div className="grid grid-cols-1 gap-2.5 overflow-y-auto p-3.5 sm:grid-cols-2">
              {state.personas.map((persona) => {
                const Icon = iconForWorkspace(persona.workspaceKind);
                const org = state.organizations.find((o) => o.id === persona.organizationId);
                const membership = state.memberships.find(
                  (m) =>
                    m.userId === persona.userId &&
                    m.organizationId === persona.organizationId &&
                    m.active
                );
                const role = state.roles.find((r) => r.id === (membership?.roleId ?? persona.roleId));
                const isCurrent = state.activePersonaId === persona.id;

                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => {
                      onSelectPersona(persona.id);
                      setOpen(false);
                    }}
                    className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#228B22] ${
                      isCurrent
                        ? 'border-[#228B22] bg-[#28C76F]/10 dark:border-[#28C76F] dark:bg-[#28C76F]/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <Icon
                            className={`h-3.5 w-3.5 ${
                              isCurrent
                                ? 'text-[#228B22] dark:text-[#4ADE80]'
                                : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{WORKSPACE_LABELS[persona.workspaceKind]}</span>
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#228B22] dark:text-[#4ADE80]">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Activa</span>
                          </span>
                        )}
                      </div>

                      <div className="mt-2 font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {persona.label}
                      </div>

                      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                        {org?.name ?? 'Organización demo'}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
                      <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                        {role?.name ?? 'Rol asignado'}
                      </span>
                      <span className="shrink-0 font-mono text-slate-500 dark:text-slate-400">
                        {role?.permissions.length ?? 0} permisos
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              <span>Los cambios de persona aplican permisos RBAC y aislamiento al instante.</span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onReturnToLogin();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pantalla de acceso demo</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
