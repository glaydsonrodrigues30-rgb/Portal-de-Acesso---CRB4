import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Square, 
  FileDown,
  Database,
  Trash2,
  X,
  Download,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  Info
} from 'lucide-react';
import { db, logAuditoria } from '../lib/firebase';
import { collection, doc, writeBatch, deleteDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const CURRENT_YEAR = new Date().getFullYear();

// Sanitizer for natural keys
const sanitizeKey = (v: string): string => {
  return String(v || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
};

// Brazilian currency parser
export const parseCurrencyBR = (val: any): { valid: boolean; value: number } => {
  if (val === null || val === undefined || val === '') return { valid: false, value: 0 };
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return { valid: false, value: 0 };
    return { valid: true, value: val };
  }
  const str = String(val).trim();
  let cleaned = str.replace(/R\$/gi, '').replace(/\s/g, '');
  
  // Format Brazilian (1.234,56 or 1234,56)
  if (/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleaned) || /^-?\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    // Already standard float format
  } else {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  
  const num = parseFloat(cleaned);
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, value: 0 };
  }
  return { valid: true, value: num };
};

// Date parser supporting dd/mm/aaaa, yyyy-mm-dd, and Excel serial numbers
export const parseDateBR = (val: any): { valid: boolean; iso: string; display: string } => {
  if (val === null || val === undefined || val === '') {
    return { valid: true, iso: '', display: '' };
  }

  // Excel serial number
  if (typeof val === 'number') {
    if (val < 1) return { valid: false, iso: '', display: '' };
    const date = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      const iso = date.toISOString();
      const d = String(date.getUTCDate()).padStart(2, '0');
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const y = date.getUTCFullYear();
      return { valid: true, iso, display: `${d}/${m}/${y}` };
    }
    return { valid: false, iso: '', display: '' };
  }

  const s = String(val).trim();
  if (!s) return { valid: true, iso: '', display: '' };

  // dd/mm/aaaa or dd-mm-aaaa
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10);
    const year = parseInt(ddmmyyyy[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const d = String(day).padStart(2, '0');
      const m = String(month).padStart(2, '0');
      return { valid: true, iso: date.toISOString(), display: `${d}/${m}/${year}` };
    }
    return { valid: false, iso: '', display: s };
  }

  // yyyy-mm-dd
  const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) {
    const year = parseInt(yyyymmdd[1], 10);
    const month = parseInt(yyyymmdd[2], 10);
    const day = parseInt(yyyymmdd[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const d = String(day).padStart(2, '0');
      const m = String(month).padStart(2, '0');
      return { valid: true, iso: date.toISOString(), display: `${d}/${m}/${year}` };
    }
    return { valid: false, iso: '', display: s };
  }

  // Fallback try Date parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return { valid: true, iso: parsed.toISOString(), display: s };
  }
  return { valid: false, iso: '', display: s };
};

// Flexible column finder
const normalizeKey = (key: string): string => {
  return String(key || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const findValue = (item: any, possibleNames: string[]): any => {
  const normalizedPossibles = possibleNames.map(normalizeKey);
  const keys = Object.keys(item || {});
  for (const key of keys) {
    if (normalizedPossibles.includes(normalizeKey(key))) {
      return item[key];
    }
  }
  return undefined;
};

interface ValidRowItem {
  id: string;
  naturalKey: string;
  isUpdate: boolean;
  data: any;
  rowIndex: number;
  previewData: Record<string, any>;
}

interface DuplicateRowItem {
  rowIndex: number;
  key: string;
  reason: string;
  previewData: Record<string, any>;
}

interface ErrorRowItem {
  rowIndex: number;
  key: string;
  reason: string;
  raw: any;
}

interface PreviewRowItem {
  rowIndex: number;
  status: 'NOVO' | 'ATUALIZAR' | 'DUPLICADO' | 'ERRO';
  key: string;
  identificador: string;
  detalhe1: string;
  detalhe2: string;
  detalhe3: string;
  motivoErro?: string;
}

export default function Importacao() {
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [importType, setImportType] = useState<'BASE_FINANCEIRA' | 'OFICIOS' | 'PROCESSOS'>('BASE_FINANCEIRA');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'preview' | 'importing' | 'finished'>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Pre-validation and Analysis state
  const [validRows, setValidRows] = useState<ValidRowItem[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<DuplicateRowItem[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRowItem[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRowItem[]>([]);
  const [stats, setStats] = useState<{
    totalLinhas: number;
    criadas: number;
    atualizadas: number;
    duplicadasNoArquivo: number;
    comErro: number;
  }>({ totalLinhas: 0, criadas: 0, atualizadas: 0, duplicadasNoArquivo: 0, comErro: 0 });

  // Import Execution state
  const [stopRequested, setStopRequested] = useState(false);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [finalSummary, setFinalSummary] = useState<{
    criados: number;
    atualizados: number;
    ignorados: number;
    comErro: number;
  } | null>(null);

  // Wipe database modal state
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);

  // Reset state
  const handleCancel = () => {
    setStatus('idle');
    setFileName('');
    setValidRows([]);
    setDuplicateRows([]);
    setErrorRows([]);
    setPreviewRows([]);
    setStats({ totalLinhas: 0, criadas: 0, atualizadas: 0, duplicadasNoArquivo: 0, comErro: 0 });
    setGeneralError(null);
    setFinalSummary(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Helper to fetch existing document IDs for the target collection to determine create vs update
  const getExistingDocIds = async (colName: string): Promise<Set<string>> => {
    try {
      const snap = await getDocs(collection(db, colName));
      const set = new Set<string>();
      snap.forEach(d => set.add(d.id));
      return set;
    } catch (e) {
      console.warn(`Aviso ao ler documentos existentes da coleção ${colName}:`, e);
      return new Set<string>();
    }
  };

  // Parse and validate rows before writing
  const processAndValidateRows = async (rawRows: any[], targetType: 'BASE_FINANCEIRA' | 'OFICIOS' | 'PROCESSOS') => {
    setStatus('analyzing');
    setGeneralError(null);

    const collectionName = targetType === 'BASE_FINANCEIRA' ? 'debits' : targetType === 'OFICIOS' ? 'oficios' : 'processos';
    const existingDocIds = await getExistingDocIds(collectionName);

    const valids: ValidRowItem[] = [];
    const duplicates: DuplicateRowItem[] = [];
    const errors: ErrorRowItem[] = [];
    const previewList: PreviewRowItem[] = [];

    const seenKeysInFile = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const item = rawRows[i];
      const rowIndex = i + 2; // Row 2 = first data row after header in a typical spreadsheet

      // Empty row guard
      if (!item || Object.values(item).every(v => v === undefined || v === null || String(v).trim() === '')) {
        continue;
      }

      if (targetType === 'BASE_FINANCEIRA') {
        const rawCrb = findValue(item, ['CRB', 'Nº do CRB', 'N do CRB', 'Inscrição', 'Registro', 'CRB Profissional']);
        const rawNome = findValue(item, ['Nome', 'Razão Social', 'Nome/Razão Social', 'Profissional', 'Contribuinte']);
        const rawAno = findValue(item, ['Ano', 'Ano do Exercício', 'Ano Exercício', 'Exercício', 'Exercicio']);
        const rawOrigem = findValue(item, ['Origem', 'Origem Débito', 'Origem do Débito', 'Tipo', 'Nome Débito', 'Descrição', 'Debito']);
        const rawValor = findValue(item, ['Valor', 'Valor Original', 'Valor Histórico', 'Valor Principal']);
        const rawValorCorrigido = findValue(item, ['Valor Corrigido', 'ValorCorrigido', 'Total', 'Valor Atualizado']);
        const rawDataVenc = findValue(item, ['Data Vencimento', 'Vencimento', 'DataVencimento', 'Venc.']);
        const rawStatus = findValue(item, ['Status Geral', 'Status', 'Situação', 'Situacao']);
        
        // Notifications/protests/cadin auxiliary dates if present in spreadsheet
        const rawDataNotif = findValue(item, ['Data Notificação', 'Data da Notificação', 'Notificação', 'Data Notificacao']);
        const rawDataProtesto = findValue(item, ['Data Protesto', 'Data do Protesto', 'Protesto', 'DataProtesto']);
        const rawDataComCadin = findValue(item, ['Data Comunicação CADIN', 'Data Comunicacao Cadin', 'Comunicação CADIN']);
        const rawDataCadin = findValue(item, ['Data CADIN', 'Inclusão CADIN', 'Data Inclusao Cadin', 'DataCadin']);

        const crbClean = String(rawCrb || '').trim();
        const nomeClean = String(rawNome || '').trim();
        const origemClean = String(rawOrigem || 'Anuidade').trim();

        // 1. Validation: CRB is mandatory
        if (!crbClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Linha ${rowIndex}`,
            reason: 'CRB obrigatório ausente ou em branco.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: crbClean || 'Sem CRB',
              detalhe1: nomeClean || 'Sem Nome',
              detalhe2: 'Ex.: ---',
              detalhe3: 'R$ ---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        // 2. Validation: Exercício numérico entre 1990 e o ano atual (CURRENT_YEAR)
        let anoNum: number | null = null;
        if (rawAno !== undefined && rawAno !== null && String(rawAno).trim() !== '') {
          const parsedAno = parseInt(String(rawAno).trim(), 10);
          if (!isNaN(parsedAno)) {
            anoNum = parsedAno;
          }
        }
        if (anoNum === null || anoNum < 1990 || anoNum > CURRENT_YEAR) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `CRB: ${crbClean}`,
            reason: `Exercício inválido (${rawAno || 'vazio'}). Deve ser numérico entre 1990 e ${CURRENT_YEAR}.`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: crbClean,
              detalhe1: nomeClean || 'Sem Nome',
              detalhe2: `Ex.: ${rawAno || 'inválido'}`,
              detalhe3: 'R$ ---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        // 3. Validation: Valores monetários aceitando formato brasileiro (1.234,56 e R$)
        const parsedValor = parseCurrencyBR(rawValor);
        if (!parsedValor.valid || parsedValor.value < 0) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `CRB: ${crbClean} (${anoNum})`,
            reason: `Valor monetário original inválido: "${rawValor}". Aceita ex.: 1.234,56 ou R$ 1.234,56.`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: crbClean,
              detalhe1: nomeClean || 'Sem Nome',
              detalhe2: `Ex.: ${anoNum}`,
              detalhe3: String(rawValor || 'inválido'),
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        const parsedValorCorrigido = rawValorCorrigido !== undefined && rawValorCorrigido !== null && String(rawValorCorrigido).trim() !== ''
          ? parseCurrencyBR(rawValorCorrigido)
          : parsedValor;

        // 4. Validation: Datas aceitando dd/mm/aaaa e serial do Excel
        const parsedVenc = parseDateBR(rawDataVenc);
        if (!parsedVenc.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `CRB: ${crbClean} (${anoNum})`,
            reason: `Data de vencimento inválida: "${rawDataVenc}". Aceita dd/mm/aaaa ou serial do Excel.`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: crbClean,
              detalhe1: nomeClean || 'Sem Nome',
              detalhe2: `Ex.: ${anoNum}`,
              detalhe3: `R$ ${parsedValor.value.toFixed(2)}`,
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        // Optional auxiliary dates validation
        const parsedNotif = parseDateBR(rawDataNotif);
        const parsedProtesto = parseDateBR(rawDataProtesto);
        const parsedComCadin = parseDateBR(rawDataComCadin);
        const parsedCadin = parseDateBR(rawDataCadin);

        // Deduplication Natural Key: CRB + exercicio + origem (se nao existir origem use CRB + exercicio)
        const cleanCrbKey = sanitizeKey(crbClean);
        const origemSlug = rawOrigem ? sanitizeKey(origemClean).slice(0, 20) : '';
        const naturalKey = origemSlug 
          ? `deb_${cleanCrbKey}_${anoNum}_${origemSlug}` 
          : `deb_${cleanCrbKey}_${anoNum}`;

        // Check deduplication within the file itself
        if (seenKeysInFile.has(naturalKey)) {
          const dupItem: DuplicateRowItem = {
            rowIndex,
            key: naturalKey,
            reason: `Registro duplicado dentro do próprio arquivo (Chave: ${naturalKey}).`,
            previewData: { crbClean, nomeClean, anoNum, valor: parsedValor.value }
          };
          duplicates.push(dupItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'DUPLICADO',
              key: naturalKey,
              identificador: crbClean,
              detalhe1: nomeClean || '---',
              detalhe2: `Ex.: ${anoNum}`,
              detalhe3: `R$ ${parsedValor.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              motivoErro: dupItem.reason
            });
          }
          continue;
        }

        seenKeysInFile.add(naturalKey);

        const isUpdate = existingDocIds.has(naturalKey);

        const debitoData: any = {
          id: naturalKey,
          crb: crbClean,
          nome: nomeClean || 'Não Informado',
          nomeDebito: origemClean,
          ano: anoNum,
          dataVencimento: parsedVenc.iso,
          valor: parsedValor.value,
          valorOriginal: parsedValor.value,
          valorCorrigido: parsedValorCorrigido.valid ? parsedValorCorrigido.value : parsedValor.value,
          statusGeral: String(rawStatus || 'Pendente').trim(),
          updatedAt: new Date().toISOString(),
          ...(parsedNotif.iso ? { notificacaoEnviada: true, dataNotificacao: parsedNotif.iso } : {}),
          ...(parsedProtesto.iso ? { protestoEnviado: true, dataProtesto: parsedProtesto.iso } : {}),
          ...(parsedComCadin.iso ? { cadinComunicado: true, dataComunicacaoCadin: parsedComCadin.iso } : {}),
          ...(parsedCadin.iso ? { cadinIncluido: true, dataCadin: parsedCadin.iso } : {})
        };

        valids.push({
          id: naturalKey,
          naturalKey,
          isUpdate,
          data: debitoData,
          rowIndex,
          previewData: debitoData
        });

        if (previewList.length < 20) {
          previewList.push({
            rowIndex,
            status: isUpdate ? 'ATUALIZAR' : 'NOVO',
            key: naturalKey,
            identificador: crbClean,
            detalhe1: nomeClean || 'Não Informado',
            detalhe2: `Ex.: ${anoNum}`,
            detalhe3: `R$ ${parsedValor.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          });
        }

      } else if (targetType === 'OFICIOS') {
        const rawNumero = findValue(item, ['numero do oficio', 'nº do oficio', 'numero do ofício', 'numero', 'n do oficio', 'numeroOficio', 'numero_do_oficio', 'numero oficio']);
        const rawAssunto = findValue(item, ['assunto', 'tema', 'topico', 'descricao']);
        const rawDestinatario = findValue(item, ['destinatario', 'destinatário', 'interessado', 'crb profissional', 'profissional']);
        const rawTipo = findValue(item, ['tipo de oficio', 'tipo de ofício', 'tipo', 'tipoOficio', 'tipo_do_oficio']);
        const rawData = findValue(item, ['data do envio', 'data de envio', 'data', 'data envio', 'emissao', 'data de emissao', 'dataEnvio', 'dataEmissao']);
        const rawStatus = findValue(item, ['status', 'situacao', 'situação']);
        const rawObs = findValue(item, ['obs', 'observacoes', 'observações', 'observacao']);
        const rawAno = findValue(item, ['ano', 'exercicio', 'exercício']);

        const numeroClean = String(rawNumero || '').trim();
        const assuntoClean = String(rawAssunto || '').trim();
        const destinatarioClean = String(rawDestinatario || '').trim();

        // 1. Mandatory validation
        if (!numeroClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Linha ${rowIndex}`,
            reason: 'Número do ofício obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: 'Sem Número',
              detalhe1: assuntoClean || '---',
              detalhe2: destinatarioClean || '---',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        if (!assuntoClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Ofício: ${numeroClean}`,
            reason: 'Assunto do ofício obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: numeroClean,
              detalhe1: 'Sem Assunto',
              detalhe2: destinatarioClean || '---',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        if (!destinatarioClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Ofício: ${numeroClean}`,
            reason: 'Destinatário do ofício obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: numeroClean,
              detalhe1: assuntoClean,
              detalhe2: 'Sem Destinatário',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        // Date parse
        const parsedDate = parseDateBR(rawData);
        if (!parsedDate.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Ofício: ${numeroClean}`,
            reason: `Data inválida no ofício: "${rawData}".`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: numeroClean,
              detalhe1: assuntoClean,
              detalhe2: destinatarioClean,
              detalhe3: String(rawData || 'inválido'),
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        // Natural Key for Ofícios: número do documento
        const naturalKey = `ofi_${sanitizeKey(numeroClean)}`;

        // Deduplication within file
        if (seenKeysInFile.has(naturalKey)) {
          const dupItem: DuplicateRowItem = {
            rowIndex,
            key: naturalKey,
            reason: `Ofício com número duplicado no arquivo: "${numeroClean}".`,
            previewData: { numeroClean, assuntoClean, destinatarioClean }
          };
          duplicates.push(dupItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'DUPLICADO',
              key: naturalKey,
              identificador: numeroClean,
              detalhe1: assuntoClean,
              detalhe2: destinatarioClean,
              detalhe3: parsedDate.display || '---',
              motivoErro: dupItem.reason
            });
          }
          continue;
        }

        seenKeysInFile.add(naturalKey);

        const isUpdate = existingDocIds.has(naturalKey);
        const dataFinal = parsedDate.iso || new Date().toISOString();
        const anoNum = rawAno ? parseInt(String(rawAno), 10) : new Date(dataFinal).getFullYear();

        const oficioData: any = {
          id: naturalKey,
          numero: numeroClean,
          numeroOficio: numeroClean,
          assunto: assuntoClean,
          tipo: String(rawTipo || 'Circular').trim(),
          tipoOficio: String(rawTipo || 'Circular').trim(),
          destinatario: destinatarioClean,
          data: dataFinal,
          dataEnvio: dataFinal,
          dataEmissao: dataFinal,
          status: String(rawStatus || 'Enviado').trim(),
          observacao: String(rawObs || '').trim(),
          ano: isNaN(anoNum) ? CURRENT_YEAR : anoNum,
          updatedAt: new Date().toISOString()
        };

        valids.push({
          id: naturalKey,
          naturalKey,
          isUpdate,
          data: oficioData,
          rowIndex,
          previewData: oficioData
        });

        if (previewList.length < 20) {
          previewList.push({
            rowIndex,
            status: isUpdate ? 'ATUALIZAR' : 'NOVO',
            key: naturalKey,
            identificador: numeroClean,
            detalhe1: assuntoClean,
            detalhe2: destinatarioClean,
            detalhe3: parsedDate.display || new Date(dataFinal).toLocaleDateString('pt-BR')
          });
        }

      } else if (targetType === 'PROCESSOS') {
        const rawNumero = findValue(item, ['numero do processo', 'nº do processo', 'numero de processo', 'numero', 'n do processo', 'numeroProcesso', 'numero_do_processo', 'numero processo']);
        const rawProfissional = findValue(item, ['nome', 'profissional', 'interessado', 'crb profissional', 'nome do profissional', 'profissional interessado']);
        const rawSolicitacao = findValue(item, ['tipo', 'tipo de processo', 'tipo de solicitacao', 'tipo solicitacao', 'solicitacao', 'descricao', 'assunto']);
        const rawDataSolicitacao = findValue(item, ['data da solicitacao', 'data da solicitação', 'data de solicitacao', 'data de solicitação', 'data solicitacao', 'data', 'data abertura', 'dataSolicitacao']);
        const rawDataPlenaria = findValue(item, ['data da plenaria', 'data da plenária', 'data de plenaria', 'data plenaria', 'plenaria', 'dataPlenaria']);
        const rawStatus = findValue(item, ['status', 'situacao', 'situação']);
        const rawObs = findValue(item, ['obs', 'observacoes', 'observações', 'observacao']);
        const rawAno = findValue(item, ['ano', 'exercicio', 'exercício']);

        const numeroClean = String(rawNumero || '').replace(/["']/g, '').trim();
        const profissionalClean = String(rawProfissional || '').replace(/["']/g, '').trim();
        const solicitacaoClean = String(rawSolicitacao || '').replace(/["']/g, '').trim();

        // 1. Mandatory fields
        if (!numeroClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Linha ${rowIndex}`,
            reason: 'Número do processo obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: 'Sem Processo',
              detalhe1: profissionalClean || '---',
              detalhe2: solicitacaoClean || '---',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        if (!profissionalClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Processo: ${numeroClean}`,
            reason: 'Nome do profissional ou interessado obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: numeroClean,
              detalhe1: 'Sem Interessado',
              detalhe2: solicitacaoClean || '---',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        if (!solicitacaoClean) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Processo: ${numeroClean}`,
            reason: 'Tipo de processo / solicitação obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: numeroClean,
              detalhe1: profissionalClean,
              detalhe2: 'Sem Solicitação',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        const parsedDateSol = parseDateBR(rawDataSolicitacao);
        if (!parsedDateSol.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Processo: ${numeroClean}`,
            reason: `Data de solicitação inválida: "${rawDataSolicitacao}".`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              key: `Linha ${rowIndex}`,
              identificador: numeroClean,
              detalhe1: profissionalClean,
              detalhe2: solicitacaoClean,
              detalhe3: String(rawDataSolicitacao || 'inválido'),
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        const parsedDatePlenaria = parseDateBR(rawDataPlenaria);

        // Natural key for Processos: número do processo
        const naturalKey = `prc_${sanitizeKey(numeroClean)}`;

        // Deduplication within file
        if (seenKeysInFile.has(naturalKey)) {
          const dupItem: DuplicateRowItem = {
            rowIndex,
            key: naturalKey,
            reason: `Processo com número duplicado no arquivo: "${numeroClean}".`,
            previewData: { numeroClean, profissionalClean, solicitacaoClean }
          };
          duplicates.push(dupItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'DUPLICADO',
              key: naturalKey,
              identificador: numeroClean,
              detalhe1: profissionalClean,
              detalhe2: solicitacaoClean,
              detalhe3: parsedDateSol.display || '---',
              motivoErro: dupItem.reason
            });
          }
          continue;
        }

        seenKeysInFile.add(naturalKey);

        const isUpdate = existingDocIds.has(naturalKey);
        const dataSolFinal = parsedDateSol.iso || new Date().toISOString();
        const anoNum = rawAno ? parseInt(String(rawAno), 10) : new Date(dataSolFinal).getFullYear();

        const processoData: any = {
          id: naturalKey,
          numero: numeroClean,
          numeroProcesso: numeroClean,
          profissional: profissionalClean,
          interessado: profissionalClean,
          solicitacao: solicitacaoClean,
          descricao: solicitacaoClean,
          dataSolicitacao: dataSolFinal,
          dataAbertura: dataSolFinal,
          dataPlenaria: parsedDatePlenaria.iso || null,
          status: String(rawStatus || 'Em Análise').trim(),
          observacao: String(rawObs || '').trim(),
          ano: isNaN(anoNum) ? CURRENT_YEAR : anoNum,
          updatedAt: new Date().toISOString()
        };

        valids.push({
          id: naturalKey,
          naturalKey,
          isUpdate,
          data: processoData,
          rowIndex,
          previewData: processoData
        });

        if (previewList.length < 20) {
          previewList.push({
            rowIndex,
            status: isUpdate ? 'ATUALIZAR' : 'NOVO',
            key: naturalKey,
            identificador: numeroClean,
            detalhe1: profissionalClean,
            detalhe2: solicitacaoClean,
            detalhe3: parsedDateSol.display || new Date(dataSolFinal).toLocaleDateString('pt-BR')
          });
        }
      }
    }

    const criadasCount = valids.filter(v => !v.isUpdate).length;
    const atualizadasCount = valids.filter(v => v.isUpdate).length;

    setValidRows(valids);
    setDuplicateRows(duplicates);
    setErrorRows(errors);
    setPreviewRows(previewList);

    setStats({
      totalLinhas: rawRows.length,
      criadas: criadasCount,
      atualizadas: atualizadasCount,
      duplicadasNoArquivo: duplicates.length,
      comErro: errors.length
    });

    setStatus('preview');
  };

  // Find header row in matrix of sheet rows
  const findHeaderRowIndex = (rows: any[][]): number => {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;
      const normalizedCells = row.map(cell => normalizeKey(String(cell || '')));

      if (importType === 'PROCESSOS') {
        const hasNumeroProcesso = normalizedCells.some(c => c.includes('processo') || c === 'numero' || c === 'n processo');
        const hasProfissional = normalizedCells.some(c => c === 'nome' || c.includes('profissional') || c.includes('interessado'));
        if (hasNumeroProcesso && hasProfissional) return i;
      } else if (importType === 'OFICIOS') {
        const hasNumeroOficio = normalizedCells.some(c => c.includes('oficio') || c.includes('ofício') || c === 'numero');
        const hasAssunto = normalizedCells.some(c => c.includes('assunto') || c.includes('tema'));
        if (hasNumeroOficio && hasAssunto) return i;
      } else {
        const hasCrb = normalizedCells.some(c => c.includes('crb') || c.includes('inscricao') || c.includes('registro'));
        const hasValor = normalizedCells.some(c => c.includes('valor') || c.includes('total'));
        if (hasCrb && hasValor) return i;
      }
    }
    return 0; // Default to first row
  };

  const convertMatrixToObjects = (rows: any[][], headerIndex: number): any[] => {
    const headers = rows[headerIndex].map(h => String(h || '').trim());
    const dataObjects: any[] = [];
    
    for (let j = headerIndex + 1; j < rows.length; j++) {
      const row = rows[j];
      if (!row || row.every(cell => cell === undefined || cell === null || String(cell).trim() === '')) {
        continue;
      }
      const obj: any = {};
      headers.forEach((header, colIdx) => {
        if (header) {
          obj[header] = row[colIdx];
        }
      });
      dataObjects.push(obj);
    }
    return dataObjects;
  };

  // File selection handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setGeneralError(null);
    setBatchErrors([]);
    setFinalSummary(null);

    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (extension === '.csv') {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: false,
        complete: (results) => {
          const matrix = results.data as any[][];
          if (!matrix || matrix.length === 0) {
            setGeneralError('O arquivo CSV selecionado está vazio.');
            return;
          }
          const headerIdx = findHeaderRowIndex(matrix);
          const objects = convertMatrixToObjects(matrix, headerIdx);
          processAndValidateRows(objects, importType);
        },
        error: (err) => {
          setGeneralError(`Erro ao ler arquivo CSV: ${err.message}`);
        }
      });
    } else if (extension === '.xlsx' || extension === '.xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          if (!matrix || matrix.length === 0) {
            setGeneralError('A planilha Excel está vazia.');
            return;
          }
          const headerIdx = findHeaderRowIndex(matrix);
          const objects = convertMatrixToObjects(matrix, headerIdx);
          processAndValidateRows(objects, importType);
        } catch (err: any) {
          setGeneralError(`Erro ao processar planilha Excel: ${err.message || err}`);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      setGeneralError('Formato de arquivo não suportado. Por favor envie arquivos Excel (.xlsx, .xls) ou .csv.');
    }
  };

  // Confirm import and write in batches of up to 400 operations
  const handleConfirmImport = async () => {
    if (validRows.length === 0) {
      setGeneralError('Não há registros válidos para importar.');
      return;
    }

    setStatus('importing');
    setProgress(0);
    setStopRequested(false);
    setBatchErrors([]);

    const BATCH_SIZE = 400; // Requirement: até 400 operações por lote
    const collectionName = importType === 'BASE_FINANCEIRA' ? 'debits' : importType === 'OFICIOS' ? 'oficios' : 'processos';

    let committedCount = 0;
    let committedCreated = 0;
    let committedUpdated = 0;
    const failures: string[] = [];

    const totalToImport = validRows.length;

    for (let i = 0; i < totalToImport; i += BATCH_SIZE) {
      if (stopRequested) {
        failures.push('Importação interrompida pelo usuário antes da conclusão.');
        break;
      }

      const chunk = validRows.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      chunk.forEach(item => {
        const docRef = doc(db, collectionName, item.id);
        batch.set(docRef, item.data, { merge: true });
      });

      try {
        await batch.commit();
        committedCount += chunk.length;
        chunk.forEach(c => {
          if (c.isUpdate) committedUpdated++;
          else committedCreated++;
        });
      } catch (batchErr: any) {
        console.error(`Falha no lote ${Math.floor(i / BATCH_SIZE) + 1}:`, batchErr);
        failures.push(`Falha no lote ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} registros): ${batchErr.message || batchErr}`);
        // Continues processing remaining batches without aborting the loop
      }

      const currentProgress = Math.min(100, Math.round(((i + chunk.length) / totalToImport) * 100));
      setProgress(currentProgress);
    }

    // Audit log
    await logAuditoria('IMPORTACAO', collectionName.toUpperCase(), 'Múltiplos', {
      totalArquivo: stats.totalLinhas,
      validos: validRows.length,
      gravadosCriados: committedCreated,
      gravadosAtualizados: committedUpdated,
      errosValidacao: errorRows.length,
      duplicadosArquivo: duplicateRows.length,
      falhasLotes: failures.length
    });

    setBatchErrors(failures);
    setFinalSummary({
      criados: committedCreated,
      atualizados: committedUpdated,
      ignorados: duplicateRows.length,
      comErro: errorRows.length + (validRows.length - committedCount)
    });

    setStatus('finished');
  };

  // Download Error & Duplication Report in CSV
  const handleDownloadErrorReport = () => {
    const reportRows: Array<{
      Linha: number | string;
      Identificador: string;
      Tipo: string;
      Motivo: string;
      Detalhes: string;
    }> = [];

    // Validation errors
    errorRows.forEach(err => {
      reportRows.push({
        Linha: err.rowIndex,
        Identificador: err.key,
        Tipo: 'ERRO_VALIDACAO',
        Motivo: err.reason,
        Detalhes: JSON.stringify(err.raw || {})
      });
    });

    // File duplicates
    duplicateRows.forEach(dup => {
      reportRows.push({
        Linha: dup.rowIndex,
        Identificador: dup.key,
        Tipo: 'DUPLICADO_NO_ARQUIVO',
        Motivo: dup.reason,
        Detalhes: JSON.stringify(dup.previewData || {})
      });
    });

    // Batch commit errors if any
    batchErrors.forEach((bErr, idx) => {
      reportRows.push({
        Linha: 'Lote',
        Identificador: `Lote ${idx + 1}`,
        Tipo: 'FALHA_GRAVACAO_FIREBASE',
        Motivo: bErr,
        Detalhes: 'Falha durante writeBatch.commit()'
      });
    });

    if (reportRows.length === 0) {
      alert('Nenhum erro ou duplicidade identificado para este arquivo.');
      return;
    }

    // CSV with BOM for Brazilian Excel compatibility
    const csvContent = Papa.unparse(reportRows, { delimiter: ';' });
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_erros_importacao_${importType.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Safe Admin-only Database Cleanup
  const handleConfirmClearDatabase = async () => {
    if (clearConfirmationText.trim() !== 'LIMPAR') {
      return;
    }

    setIsCleaning(true);
    try {
      const collectionsToWipe = ['debits', 'notifications', 'negotiations', 'oficios', 'processos'];

      for (const colName of collectionsToWipe) {
        const snap = await getDocs(collection(db, colName));
        const docs = snap.docs;
        const BATCH_SIZE = 400;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const chunk = docs.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      await logAuditoria('EXCLUSAO', 'LIMPEZA_BASE_ADMIN', 'Tudo', { 
        confirmadoCom: 'LIMPAR',
        timestamp: new Date().toISOString()
      });

      setIsClearModalOpen(false);
      setClearConfirmationText('');
      alert('Banco de testes limpo com sucesso! A página será atualizada.');
      window.location.reload();
    } catch (err: any) {
      console.error('Erro na limpeza da base:', err);
      alert(`Falha ao limpar a base de dados: ${err.message || err}`);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm gap-6 border-l-8 border-crb-blue">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-crb-navy">Carga de Dados</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">
              Etapa 4 - Deduplicação & Validação
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Importação segura com validação linha a linha, upsert por chave natural e relatório de erros.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Módulo Alvo</label>
            <select 
              value={importType}
              onChange={(e) => {
                setImportType(e.target.value as any);
                handleCancel();
              }}
              disabled={status === 'importing' || status === 'analyzing'}
              className="bg-white border-2 border-slate-100 px-4 py-2.5 rounded-2xl outline-none focus:border-crb-blue font-bold text-crb-navy text-sm transition-all cursor-pointer"
            >
              <option value="BASE_FINANCEIRA">Débitos (Base Financeira)</option>
              <option value="OFICIOS">Ofícios Expedidos</option>
              <option value="PROCESSOS">Processos Administrativos</option>
            </select>
          </div>

          {/* Admin-only Wipe Base button */}
          {isAdmin && (
            <button 
              onClick={() => {
                setClearConfirmationText('');
                setIsClearModalOpen(true);
              }}
              disabled={isCleaning || status === 'importing'}
              className="flex items-center justify-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl hover:bg-red-600 hover:text-white transition-all font-bold border border-red-200 shadow-sm text-xs mt-5 cursor-pointer disabled:opacity-50"
              title="Apenas Administradores: Apagar base para testes"
            >
              <Trash2 size={16} />
              Limpar Base [Teste]
            </button>
          )}

          {/* Choose File Button */}
          <label className={cn(
            "flex items-center justify-center gap-2 bg-crb-navy text-white px-6 py-2.5 rounded-2xl hover:bg-crb-navy-dark transition-all cursor-pointer font-bold shadow-md shadow-crb-navy/20 text-xs mt-5 group",
            (status === 'importing' || status === 'analyzing') && "pointer-events-none opacity-50"
          )}>
            <Upload size={16} className="group-hover:-translate-y-0.5 transition-transform text-crb-blue" />
            <span>{status === 'preview' ? 'Trocar Arquivo' : 'Escolher Arquivo'}</span>
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept=".csv,.xlsx,.xls" 
              onChange={handleFileUpload} 
              disabled={status === 'importing' || status === 'analyzing'}
            />
          </label>
        </div>
      </div>

      {/* General Error Banner */}
      {generalError && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 border border-red-200 p-6 rounded-2xl flex items-start gap-4">
          <AlertCircle size={22} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-red-900 text-sm">Atenção ao importar</h4>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">{generalError}</p>
          </div>
          <button onClick={() => setGeneralError(null)} className="text-red-400 hover:text-red-700">
            <X size={18} />
          </button>
        </motion.div>
      )}

      {/* Analyzing Spinner */}
      {status === 'analyzing' && (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
          <RefreshCw size={36} className="animate-spin text-crb-blue mx-auto" />
          <h3 className="text-lg font-bold text-crb-navy">Validando e deduplicando registros...</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Verificando regras de campos obrigatórios, faixas de exercício, formatação de moeda e comparando com registros já existentes na base.
          </p>
        </div>
      )}

      {/* STEP 1 PREVIEW: Pre-visualização detalhada ANTES de gravar */}
      {status === 'preview' && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* File Header Card */}
          <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-crb-blue border border-white/10 shrink-0">
                <FileSpreadsheet size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg md:text-xl font-bold font-serif">{fileName || 'Planilha Carregada'}</h3>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono uppercase">
                    {importType}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Validação prévia concluída. Revise o diagnóstico antes de confirmar a gravação.
                </p>
              </div>
            </div>

            {/* Actions: Confirmar e Cancelar */}
            <div className="flex items-center gap-3 w-full md:w-auto relative z-10">
              <button 
                onClick={handleCancel}
                className="flex-1 md:flex-none px-5 py-3 rounded-xl border border-white/20 text-white font-bold text-xs uppercase tracking-wider hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmImport}
                disabled={validRows.length === 0}
                className="flex-1 md:flex-none px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Play size={16} fill="currentColor" />
                Confirmar Importação ({validRows.length})
              </button>
            </div>
          </div>

          {/* KPI Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total no Arquivo</span>
              <span className="text-2xl font-serif font-bold text-slate-800">{stats.totalLinhas}</span>
              <p className="text-[11px] text-slate-400 mt-1">Linhas processadas</p>
            </div>

            <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 shadow-sm">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block mb-1">Serão Criados</span>
              <span className="text-2xl font-serif font-bold text-emerald-800">{stats.criadas}</span>
              <p className="text-[11px] text-emerald-600 mt-1">Novos registros</p>
            </div>

            <div className="bg-blue-50/70 p-5 rounded-2xl border border-blue-200 shadow-sm">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block mb-1">Serão Atualizados</span>
              <span className="text-2xl font-serif font-bold text-blue-800">{stats.atualizadas}</span>
              <p className="text-[11px] text-blue-600 mt-1">Mesclados por chave natural</p>
            </div>

            <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 shadow-sm">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block mb-1">Duplicadas no Arquivo</span>
              <span className="text-2xl font-serif font-bold text-amber-800">{stats.duplicadasNoArquivo}</span>
              <p className="text-[11px] text-amber-600 mt-1">Ignoradas (mesma chave)</p>
            </div>

            <div className="bg-red-50/70 p-5 rounded-2xl border border-red-200 shadow-sm">
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1">Linhas com Erro</span>
              <span className="text-2xl font-serif font-bold text-red-800">{stats.comErro}</span>
              <p className="text-[11px] text-red-600 mt-1">Não serão gravadas</p>
            </div>
          </div>

          {/* Quick Error Download if errors exist */}
          {(stats.comErro > 0 || stats.duplicadasNoArquivo > 0) && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-900 font-medium">
                  Foram encontradas <strong>{stats.comErro} linhas com erro</strong> e <strong>{stats.duplicadasNoArquivo} duplicadas no arquivo</strong>. Elas não serão inseridas para preservar a integridade da base.
                </p>
              </div>
              <button 
                onClick={handleDownloadErrorReport}
                className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 transition-all cursor-pointer shrink-0"
              >
                <Download size={14} />
                Baixar Relatório de Inconsistências (CSV)
              </button>
            </div>
          )}

          {/* Sample Table: Primeiras 20 Linhas */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-crb-navy uppercase tracking-widest">
                  Amostra das Primeiras 20 Linhas com Status
                </span>
                <p className="text-[11px] text-slate-500">
                  Mostrando diagnóstico de validação e motivo individual em caso de inconsistência.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                Exibindo {Math.min(previewRows.length, 20)} de {stats.totalLinhas} linhas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3 text-center w-16">Linha</th>
                    <th className="px-4 py-3">Diagnóstico</th>
                    <th className="px-4 py-3">
                      {importType === 'BASE_FINANCEIRA' ? 'CRB' : importType === 'OFICIOS' ? 'Nº Ofício' : 'Nº Processo'}
                    </th>
                    <th className="px-4 py-3">
                      {importType === 'BASE_FINANCEIRA' ? 'Contribuinte' : importType === 'OFICIOS' ? 'Assunto' : 'Interessado'}
                    </th>
                    <th className="px-4 py-3">
                      {importType === 'BASE_FINANCEIRA' ? 'Exercício' : importType === 'OFICIOS' ? 'Destinatário' : 'Solicitação'}
                    </th>
                    <th className="px-4 py-3">
                      {importType === 'BASE_FINANCEIRA' ? 'Valor' : 'Data'}
                    </th>
                    <th className="px-4 py-3">Motivo / Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, idx) => (
                    <tr 
                      key={idx} 
                      className={cn(
                        "hover:bg-slate-50 transition-colors",
                        row.status === 'ERRO' && "bg-red-50/40",
                        row.status === 'DUPLICADO' && "bg-amber-50/40"
                      )}
                    >
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-400">
                        #{row.rowIndex}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'NOVO' && (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <CheckCircle2 size={12} /> Novo
                          </span>
                        )}
                        {row.status === 'ATUALIZAR' && (
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <RefreshCw size={12} /> Atualizar
                          </span>
                        )}
                        {row.status === 'DUPLICADO' && (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <Layers size={12} /> Duplicado
                          </span>
                        )}
                        {row.status === 'ERRO' && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            <AlertCircle size={12} /> Inválido
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-crb-navy">
                        {row.identificador}
                      </td>
                      <td className="px-4 py-3 text-slate-700 truncate max-w-[180px]">
                        {row.detalhe1}
                      </td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-[180px]">
                        {row.detalhe2}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {row.detalhe3}
                      </td>
                      <td className="px-4 py-3">
                        {row.motivoErro ? (
                          <span className="text-red-700 font-medium text-[11px] block max-w-xs">
                            {row.motivoErro}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-mono">
                            Chave: {row.key}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* STEP 2 IMPORTING: Progresso em Tempo Real (Lotes de até 400 itens) */}
      {status === 'importing' && (
        <div className="bg-white p-12 md:p-16 rounded-3xl border border-slate-200 shadow-xl text-center space-y-8">
          <div className="w-20 h-20 bg-crb-navy/5 text-crb-navy rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-slate-100 animate-pulse">
            <Database size={40} className="text-crb-blue" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-serif font-bold text-crb-navy">Gravando Dados em Lotes de até 400</h3>
            <p className="text-slate-500 text-xs md:text-sm max-w-lg mx-auto">
              Operações writeBatch ativas. Em caso de inconsistência em um lote, os lotes subsequentes continuam normalmente.
            </p>
          </div>

          <div className="max-w-md mx-auto space-y-3">
            <div className="h-5 w-full bg-slate-100 rounded-xl overflow-hidden p-0.5 shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-crb-blue rounded-lg transition-all duration-300"
              />
            </div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-600">
              <span>{Math.round(progress)}% Concluído</span>
              <span>Até {validRows.length} registros</span>
            </div>
          </div>

          <button 
            onClick={() => setStopRequested(true)}
            className="flex items-center gap-2 bg-red-50 text-red-600 px-6 py-2.5 rounded-xl mx-auto hover:bg-red-100 transition-all font-bold text-xs uppercase tracking-wider border border-red-100 cursor-pointer"
          >
            <Square size={14} fill="currentColor" />
            Interromper Processamento
          </button>
        </div>
      )}

      {/* STEP 3 FINISHED: Resumo final e download do relatório de erros */}
      {status === 'finished' && finalSummary && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-xl text-center space-y-8 border-t-8 border-emerald-500">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md shadow-emerald-200">
            <CheckCircle2 size={36} />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl md:text-3xl font-serif font-bold text-crb-navy">
              Importação Concluída com Sucesso!
            </h3>
            <p className="text-slate-500 text-xs md:text-sm max-w-lg mx-auto">
              O processamento do arquivo de carga foi finalizado. Confira o balanço geral das gravações.
            </p>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block mb-1">Criados</span>
              <span className="text-3xl font-serif font-bold text-emerald-800">{finalSummary.criados}</span>
              <p className="text-[11px] text-emerald-600 mt-1">Novos documentos inseridos</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block mb-1">Atualizados</span>
              <span className="text-3xl font-serif font-bold text-blue-800">{finalSummary.atualizados}</span>
              <p className="text-[11px] text-blue-600 mt-1">Mesclados sem duplicar</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block mb-1">Ignorados</span>
              <span className="text-3xl font-serif font-bold text-amber-800">{finalSummary.ignorados}</span>
              <p className="text-[11px] text-amber-600 mt-1">Duplicatas dentro do arquivo</p>
            </div>

            <div className="bg-red-50 border border-red-200 p-5 rounded-2xl">
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1">Com Erro</span>
              <span className="text-3xl font-serif font-bold text-red-800">{finalSummary.comErro}</span>
              <p className="text-[11px] text-red-600 mt-1">Linhas rejeitadas</p>
            </div>
          </div>

          {/* Batch failures if any */}
          {batchErrors.length > 0 && (
            <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 p-4 rounded-2xl text-left">
              <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wider mb-2">
                <AlertCircle size={16} /> Falhas Parciais de Lote
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-red-700">
                {batchErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            {(finalSummary.comErro > 0 || finalSummary.ignorados > 0 || batchErrors.length > 0) && (
              <button 
                onClick={handleDownloadErrorReport}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
              >
                <Download size={16} />
                Baixar Relatório de Erros em CSV
              </button>
            )}

            <button 
              onClick={handleCancel}
              className="px-8 py-3 bg-crb-navy hover:bg-crb-navy-dark text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
            >
              Realizar Nova Carga
            </button>
          </div>
        </motion.div>
      )}

      {/* WIPE DATABASE CONFIRMATION MODAL (EXCLUSIVO PARA ADMIN COM CONFIRMAÇÃO POR TEXTO "LIMPAR") */}
      <AnimatePresence>
        {isClearModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-red-200 space-y-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={26} />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-serif text-slate-900">Limpeza Geral da Base [Teste]</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Operação restrita a Administradores para renovação de testes operacionais.
                  </p>
                </div>
              </div>

              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-xs text-red-800 leading-relaxed space-y-2">
                <p>
                  <strong>ATENÇÃO:</strong> Esta ação apagará permanentemente todos os documentos das coleções operacionais:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-red-700 font-mono text-[11px]">
                  <li>debits (Débitos da Base Financeira)</li>
                  <li>notifications (Notificações)</li>
                  <li>negotiations (Negociações)</li>
                  <li>oficios (Ofícios Expedidos)</li>
                  <li>processos (Processos Administrativos)</li>
                </ul>
                <p className="font-semibold text-red-900 pt-1">
                  Esta ação é irreversível.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Para confirmar, digite exatamente <span className="font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">LIMPAR</span> abaixo:
                </label>
                <input 
                  type="text" 
                  value={clearConfirmationText}
                  onChange={(e) => setClearConfirmationText(e.target.value)}
                  placeholder="LIMPAR"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-red-500 transition-colors uppercase tracking-widest"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button 
                  onClick={() => {
                    setIsClearModalOpen(false);
                    setClearConfirmationText('');
                  }}
                  disabled={isCleaning}
                  className="px-5 py-2.5 rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmClearDatabase}
                  disabled={clearConfirmationText.trim() !== 'LIMPAR' || isCleaning}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-red-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {isCleaning ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {isCleaning ? 'Apagando Base...' : 'Confirmar Exclusão'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
