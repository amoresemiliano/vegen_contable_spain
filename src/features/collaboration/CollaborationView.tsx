import React, { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Plus, Send, Upload } from 'lucide-react';
import { useAppStore } from '../../services/useAppStore';
import { formatDateEs, formatDateTimeEs } from '../../domain/formatters';
import { EmptyState, ModalDialog, PageHeader, Panel, StatusLabel } from '../../components/ui/Surface';
import { DocumentUploadModal } from '../documents/DocumentUploadModal';
import { BaseRoleCode, CollaborationMessage } from '../../types/domain';

interface CollaborationViewProps {
  clientIdFilter?: string;
}

export const CollaborationView: React.FC<CollaborationViewProps> = ({ clientIdFilter }) => {
  const {
    state,
    activePersona,
    activeRole,
    accessibleClients,
    can,
    createClientTask,
    updateTaskStatus,
    sendMessage,
  } = useAppStore();

  const targetClientId = clientIdFilter || state.selectedClientId || accessibleClients[0]?.id;
  const client = state.clientProfiles.find((c) => c.id === targetClientId);

  const [msgText, setMsgText] = useState('');
  const [visibility, setVisibility] = useState<CollaborationMessage['visibility']>('CLIENT_VISIBLE');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('Solicitar factura de suministro pendiente');
  const [taskDesc, setTaskDesc] = useState('Necesitamos este documento para completar la deducción del IVA.');
  const [uploadTaskId, setUploadTaskId] = useState<string | undefined>(undefined);
  const [uploadOpen, setUploadOpen] = useState(false);

  const isClientUser =
    activeRole?.code === BaseRoleCode.CLIENT_ADMIN ||
    activeRole?.code === BaseRoleCode.CLIENT_COLLABORATOR;
  const canSeeInternal = can('messages.internal.read');
  const isAccountantSide =
    activeRole?.code === BaseRoleCode.ACCOUNTANT || activeRole?.code === BaseRoleCode.FIRM_ADMIN;
  const isAdvisorSide = activeRole?.code === BaseRoleCode.FINANCIAL_ADVISOR;
  const isSuperadmin = activeRole?.code === BaseRoleCode.PLATFORM_SUPERADMIN;

  const clientTasks = useMemo(
    () => state.tasks.filter((t) => t.clientId === targetClientId),
    [state.tasks, targetClientId]
  );

  // Strict privacy isolation: never expose private advisory notes to unrelated accounting users, nor internal notes to clients
  const visibleMessages = useMemo(() => {
    return state.messages.filter((m) => {
      if (m.clientId !== targetClientId) return false;
      if (m.visibility === 'CLIENT_VISIBLE') return true;
      if (!canSeeInternal || isClientUser) return false;
      if (m.visibility === 'INTERNAL_ACCOUNTING') return isAccountantSide || isSuperadmin;
      if (m.visibility === 'INTERNAL_ADVISORY') return isAdvisorSide || isSuperadmin;
      return false;
    });
  }, [state.messages, targetClientId, canSeeInternal, isClientUser, isAccountantSide, isAdvisorSide, isSuperadmin]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;
    const user = state.users.find((u) => u.id === activePersona.userId);
    sendMessage({
      clientId: targetClientId,
      authorUserId: activePersona.userId,
      authorName: user?.fullName ?? activePersona.label,
      authorRoleLabel: activeRole?.name ?? activePersona.label,
      visibility: isClientUser ? 'CLIENT_VISIBLE' : visibility,
      category: isClientUser
        ? 'CLIENT_RESPONSE'
        : isAdvisorSide
        ? 'ADVISOR_RECOMMENDATION'
        : 'ACCOUNTING_NOTE',
      body: msgText.trim(),
    });
    setMsgText('');
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    const user = state.users.find((u) => u.id === activePersona.userId);
    createClientTask({
      clientId: targetClientId,
      title: taskTitle,
      description: taskDesc,
      type: 'DOCUMENT_REQUEST',
      status: 'OPEN',
      assignedToRole: 'CLIENT',
      createdByUserId: activePersona.userId,
      createdByName: user?.fullName ?? activePersona.label,
      dueDate: '2026-11-30',
    });
    setNewTaskOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Mensajes, Solicitudes y Tareas · ${client?.displayName ?? ''}`}
        subtitle="Timeline colaborativo entre cliente, despacho contable y asesor financiero con aislamiento de notas privadas."
        actions={
          !isClientUser && can('messages.client.send') ? (
            <button
              type="button"
              onClick={() => setNewTaskOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap dark:bg-teal-600"
            >
              <Plus className="h-4 w-4" />
              <span>Solicitar documento</span>
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Tasks / Document Requests */}
        <Panel className="space-y-4 lg:col-span-2">
          <h2 className="font-display text-base font-semibold">
            Solicitudes abiertas y tareas ({clientTasks.length})
          </h2>
          {clientTasks.length === 0 ? (
            <EmptyState
              title="Sin solicitudes pendientes"
              description="No hay documentos pendientes ni incidencias abiertas para este cliente."
            />
          ) : (
            <div className="space-y-3">
              {clientTasks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                    <StatusLabel
                      text={
                        t.status === 'RESOLVED'
                          ? 'Resuelta'
                          : t.status === 'SUBMITTED'
                          ? 'Doc. enviado'
                          : 'Pendiente'
                      }
                      tone={
                        t.status === 'RESOLVED'
                          ? 'success'
                          : t.status === 'SUBMITTED'
                          ? 'info'
                          : 'warning'
                      }
                    />
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{t.description}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      Por {t.createdByName} · Vence {formatDateEs(t.dueDate)}
                    </span>
                    {t.status === 'OPEN' && isClientUser && can('documents.upload') && (
                      <button
                        type="button"
                        onClick={() => {
                          setUploadTaskId(t.id);
                          setUploadOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-700"
                      >
                        <Upload className="h-3.5 w-3.5" /> Subir documento
                      </button>
                    )}
                    {!isClientUser && t.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(t.id, 'RESOLVED')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Marcar resuelta
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Shared & Scoped Timeline */}
        <Panel className="flex flex-col justify-between space-y-4 lg:col-span-3">
          <div>
            <h2 className="mb-3 font-display text-base font-semibold">Timeline de comunicación</h2>
            <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
              {visibleMessages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3.5 text-xs ${
                    m.visibility !== 'CLIENT_VISIBLE'
                      ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {m.authorName} · <span className="font-normal text-slate-500">{m.authorRoleLabel}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      {m.visibility !== 'CLIENT_VISIBLE' && <Lock className="h-3 w-3 text-amber-600" />}
                      {m.visibility === 'CLIENT_VISIBLE'
                        ? 'Visible al cliente'
                        : m.visibility === 'INTERNAL_ACCOUNTING'
                        ? 'Nota interna gestoría'
                        : 'Nota privada asesoría'}
                      {' · '}
                      {formatDateTimeEs(m.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1.5 leading-relaxed text-slate-700 dark:text-slate-300">{m.body}</p>
                </div>
              ))}
            </div>
          </div>

          {can('messages.client.send') && (
            <form onSubmit={handleSend} className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
              {!isClientUser && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">Visibilidad:</span>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as CollaborationMessage['visibility'])}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="CLIENT_VISIBLE">Visible al cliente y equipo</option>
                    {(isAccountantSide || isSuperadmin) && (
                      <option value="INTERNAL_ACCOUNTING">Solo interno Gestoría</option>
                    )}
                    {(isAdvisorSide || isSuperadmin) && (
                      <option value="INTERNAL_ADVISORY">Solo privado Asesoría</option>
                    )}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Escribe un mensaje o respuesta..."
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-teal-600"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar</span>
                </button>
              </div>
            </form>
          )}
        </Panel>
      </div>

      <ModalDialog open={newTaskOpen} onClose={() => setNewTaskOpen(false)} title="Nueva solicitud documental al cliente">
        <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
          <label className="block">
            <span>Título de la solicitud</span>
            <input type="text" required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="block">
            <span>Detalle / Instrucciones para el cliente</span>
            <textarea rows={3} required value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setNewTaskOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
              Enviar solicitud al cliente
            </button>
          </div>
        </form>
      </ModalDialog>

      <DocumentUploadModal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setUploadTaskId(undefined);
        }}
        clientId={targetClientId}
        linkedTaskId={uploadTaskId}
      />
    </div>
  );
};
