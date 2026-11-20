import React, { useRef, useState } from 'react';
import { Camera, CheckCircle2, FileText, Image as ImageIcon, Upload, AlertCircle } from 'lucide-react';
import { ModalDialog } from '../../components/ui/Surface';
import { DocumentType } from '../../types/domain';
import { useAppStore } from '../../services/useAppStore';
import { formatEUR, round2 } from '../../domain/formatters';

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  linkedTaskId?: string;
}

const PLAIN_CLIENT_TYPES: { type: DocumentType; label: string; hint: string }[] = [
  { type: DocumentType.SUPPLIER_INVOICE, label: 'Factura de compra o proveedor', hint: 'Facturas que has recibido de un proveedor o servicio' },
  { type: DocumentType.EXPENSE_RECEIPT, label: 'Ticket o recibo de gasto', hint: 'Comidas, transporte, material o compras rápidas' },
  { type: DocumentType.CUSTOMER_INVOICE, label: 'Factura emitida a cliente', hint: 'Facturas enviadas fuera de la plataforma' },
  { type: DocumentType.PAYROLL, label: 'Nómina o Seguridad Social', hint: 'Documentos laborales o recibos TC1' },
  { type: DocumentType.BANK_STATEMENT, label: 'Extracto o recibo bancario', hint: 'PDF o extracto de tu banco' },
  { type: DocumentType.CONTRACT, label: 'Contrato u otro justificante', hint: 'Alquiler, préstamos o documentación general' },
];

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  open,
  onClose,
  clientId,
  linkedTaskId,
}) => {
  const { uploadClientDocument } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<DocumentType>(DocumentType.SUPPLIER_INVOICE);
  const [supplierHint, setSupplierHint] = useState('Servicios Cloud Ibérica SL (Demo)');
  const [amountHint, setAmountHint] = useState('420');
  const [vatRateHint, setVatRateHint] = useState('21');
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedDocs, setSubmittedDocs] = useState<string[]>([]);

  const handleFilesSelected = (files: FileList | null) => {
    setErrorMsg(null);
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const oversized = list.find((f) => f.size > 15 * 1024 * 1024);
    if (oversized) {
      setErrorMsg(`El archivo ${oversized.name} supera el límite de demostración de 15 MB.`);
      return;
    }
    setSelectedFiles((prev) => [...prev, ...list]);
  };

  const handleSimulateSampleFile = () => {
    setErrorMsg(null);
    const fakeBlob = new Blob(['VEGEN DEMO DOCUMENTO'], { type: 'application/pdf' });
    const sampleFile = new File([fakeBlob], `factura_proveedor_${Date.now().toString().slice(-4)}.pdf`, {
      type: 'application/pdf',
    });
    setSelectedFiles((prev) => [...prev, sampleFile]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const filesToProcess =
      selectedFiles.length > 0
        ? selectedFiles
        : [
            new File([new Blob(['DEMO'])], `documento_movil_${Date.now().toString().slice(-4)}.pdf`, {
              type: 'application/pdf',
            }),
          ];

    const numericBase = Number.parseFloat(amountHint.replace(',', '.'));
    if (!Number.isFinite(numericBase) || numericBase <= 0) {
      setErrorMsg('Introduce un importe base válido mayor que 0 EUR.');
      return;
    }

    setProgress(35);
    setTimeout(() => {
      setProgress(80);
      const createdNames: string[] = [];
      filesToProcess.forEach((file) => {
        const isImage = file.type.startsWith('image/');
        const doc = uploadClientDocument({
          clientId,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          fileSizeKb: Math.max(48, Math.round(file.size / 1024) || 320),
          type: docType,
          sourceChannel: isImage ? 'PWA_CAMERA' : 'WEB_UPLOAD',
          linkedTaskId,
          customExtraction: {
            counterpartyName: supplierHint.trim() || 'Proveedor Demo SL',
            taxableBase: round2(numericBase),
            vatRate: Number(vatRateHint) || 21,
            description: `${PLAIN_CLIENT_TYPES.find((t) => t.type === docType)?.label ?? 'Gasto'} (${file.name})`,
          },
        });
        createdNames.push(doc.fileName);
      });
      setProgress(100);
      setSubmittedDocs(createdNames);
    }, 240);
  };

  const resetAndClose = () => {
    setSelectedFiles([]);
    setProgress(0);
    setErrorMsg(null);
    setSubmittedDocs([]);
    onClose();
  };

  const previewBase = Number.parseFloat(amountHint.replace(',', '.')) || 0;
  const previewTotal = round2(previewBase * (1 + (Number(vatRateHint) || 0) / 100));

  return (
    <ModalDialog open={open} onClose={resetAndClose} title="Subir documento">
      {submittedDocs.length > 0 ? (
        <div className="space-y-5 py-2">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div>
              <h3 className="font-display text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Documento enviado a tu gestoría correctamente
              </h3>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                La extracción asistida por IA ha leído los campos principales y el documento ya figura en la Bandeja del Contable en estado «Requiere revisión».
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
            {submittedDocs.map((name) => (
              <li key={name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                <span className="font-medium truncate">{name}</span>
                <span className="font-mono text-teal-700 dark:text-teal-400">Extraído (IA)</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              Volver al portal
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Haz una foto con tu móvil, selecciona una imagen o sube uno o varios PDFs. No necesitas conocer términos contables: nosotros lo clasificamos.
          </p>

          {/* Touch-friendly upload triggers */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Camera className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>Hacer foto</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Upload className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>PDF o Foto (múltiple)</span>
            </button>
            <button
              type="button"
              onClick={handleSimulateSampleFile}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-dashed border-teal-500/60 bg-teal-50/40 px-3 py-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300"
            >
              <FileText className="h-4 w-4" />
              <span>Adjuntar factura ejemplo</span>
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          {/* Selected File Preview */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Archivos listos ({selectedFiles.length})
              </div>
              {selectedFiles.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 truncate text-slate-800 dark:text-slate-200">
                    {f.type.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-rose-600 hover:underline dark:text-rose-400"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Document type selection */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
              ¿Qué estás subiendo?
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PLAIN_CLIENT_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setDocType(item.type)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    docType === item.type
                      ? 'border-teal-600 bg-teal-50/50 dark:border-teal-500 dark:bg-teal-950/30'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Demo extraction hints so evaluators can test any amount/supplier */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-3">
            <div className="sm:col-span-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Simulación de contenido del documento (para probar extracción y cálculo IVA)
            </div>
            <label className="block text-xs">
              <span className="text-slate-600 dark:text-slate-400">Proveedor / Emisor</span>
              <input
                type="text"
                value={supplierHint}
                onChange={(e) => setSupplierHint(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 dark:text-slate-400">Base imponible (€)</span>
              <input
                type="number"
                step="0.01"
                value={amountHint}
                onChange={(e) => setAmountHint(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 dark:text-slate-400">IVA (%)</span>
              <select
                value={vatRateHint}
                onChange={(e) => setVatRateHint(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="21">21% (General)</option>
                <option value="10">10% (Reducido)</option>
                <option value="4">4% (Superreducido)</option>
                <option value="0">0% (Exento)</option>
              </select>
            </label>
          </div>

          {progress > 0 && progress < 100 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>Subiendo y extrayendo campos...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Total estimado: <strong className="font-mono text-slate-900 dark:text-slate-100">{formatEUR(previewTotal)}</strong>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetAndClose}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                Enviar documento
              </button>
            </div>
          </div>
        </form>
      )}
    </ModalDialog>
  );
};
