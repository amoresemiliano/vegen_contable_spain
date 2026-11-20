import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  Compass,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { useTheme } from '../../hooks/useTheme';
import { VegenLogo } from '../../components/ui/VegenLogo';
import { Panel } from '../../components/ui/Surface';

interface DemoEntryScreenProps {
  onEnterWorkspace: (initialRoute?: string) => void;
}

export const DemoEntryScreen: React.FC<DemoEntryScreenProps> = ({ onEnterWorkspace }) => {
  const { state } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Synthetic demo access: empty credentials are intentionally permitted.
    onEnterWorkspace();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Minimal Top Bar */}
      <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <VegenLogo size="md" />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-medium text-amber-800 dark:text-amber-300 sm:inline">
              ENTORNO DEMOSTRACIÓN · DATOS SINTÉTICOS
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Centered Split Login */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-8 sm:px-8 lg:py-12">
        <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left: Product Positioning & Domain Architecture */}
          <div className="space-y-6 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#228B22] dark:text-[#28C76F]">
                Ingeniería financiera y cumplimiento para España
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl text-balance">
                Vegen Finance Hub
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                Plataforma operativa unificada que conecta el portal documental del cliente, la
                contabilidad PGC y fiscalidad del despacho, la tesorería bancaria y la
                planificación financiera patrimonial en un único entorno trazable.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#228B22] dark:text-[#28C76F]" />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Portal del Cliente / PWA
                  </div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Liquidez disponible, subida rápida de documentos, metas y plan publicado.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-[#228B22] dark:text-[#28C76F]" />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Gestoría Contable y Fiscal
                  </div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Revisión IA, asientos PGC cuadrados, conciliación bancaria y borrador 303.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#228B22] dark:text-[#28C76F]" />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Asesoría Financiera
                  </div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Diagnóstico, separación empresa/personal, 3 escenarios y publicación al cliente.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#228B22] dark:text-[#28C76F]" />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Gobernanza RBAC y Auditoría
                  </div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Roles configurables en vivo, aislamiento multi-cliente y registro de auditoría.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{state.clientProfiles.length} perfiles cliente demo</span>
              <span aria-hidden="true">·</span>
              <span>{state.invoices.length} facturas</span>
              <span aria-hidden="true">·</span>
              <span>{state.journalEntries.length} asientos PGC</span>
              <span aria-hidden="true">·</span>
              <span>{state.personas.length} personas evaluables desde la cabecera</span>
            </div>
          </div>

          {/* Right: Demo Login Card */}
          <div className="lg:col-span-5">
            <Panel padding="lg" className="shadow-sm">
              <div className="mb-6">
                <VegenLogo size="md" />
                <h2 className="mt-5 font-display text-xl font-semibold text-slate-900 dark:text-slate-50">
                  Acceso de demostración
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Introduce cualquier dato de prueba o deja los campos vacíos para acceder directamente al entorno interactivo.
                </p>
              </div>

              {/* Explicit Demo Security Disclaimer */}
              <div
                role="note"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/80 p-3.5 text-xs text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="leading-relaxed">
                  <strong>Mecanismo de acceso solo para demostración (MVP):</strong> no es una
                  autenticación de producción, no valida credenciales reales ni protege datos
                  privados. Todos los registros mostrados son sintéticos.
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Usuario o correo electrónico
                  </span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Opcional en demo (ej. a.vega@vegendigital-demo.es)"
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#228B22] focus:outline-none focus:ring-2 focus:ring-[#28C76F]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Contraseña
                  </span>
                  <div className="relative mt-1.5">
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Opcional en entorno de demostración"
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#228B22] focus:outline-none focus:ring-2 focus:ring-[#28C76F]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <Lock
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1E293B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#228B22] focus-visible:outline-2 focus-visible:outline-[#228B22] dark:bg-[#228B22] dark:hover:bg-[#28C76F]"
                >
                  <span>Iniciar sesión (Modo Demo)</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>

              <p className="mt-4 border-t border-slate-200 pt-3.5 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Una vez dentro, utiliza el selector de personas en la esquina superior derecha para
                alternar entre perfiles de Cliente, Gestoría Contable, Asesor Financiero y
                Superadministrador.
              </p>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
};
