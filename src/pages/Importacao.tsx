import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Square, 
  Database,
  Trash2,
  X,
  Download,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  HelpCircle,
  Filter
} from 'lucide-react';
import { db, logAuditoria } from '../lib/firebase';
import { collection, doc, writeBatch, getDocs } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const CURRENT_YEAR = new Date().getFullYear();

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'marco', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// 4) Limpar valores de texto: remove aspas duplicadas repetidas ("""Ad Referendum""" vira Ad Referendum), trim e espaços duplos
export const cleanText = (val: any): string => {
  if (val === null || val === undefined) return '';
  let s = String(val).trim();
  // Remove repetidas aspas externas
  s = s.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '');
  // Converte aspas repetidas internas ("" vira " ou nada se envolve todo o texto)
  s = s.replace(/""+/g, '"').replace(/''+/g, "'");
  // Remove novamente se sobraram aspas externas
  s = s.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '');
  // Colapsa espaços duplos
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

// 5) Normaliza o número do documento: '037--2026' vira 037-2026; '007-202' deve ser erro com motivo 'Número inválido, ano incompleto'
export const normalizeDocNumero = (val: any): { valid: boolean; numero: string; error?: string } => {
  let s = cleanText(val);
  if (!s) return { valid: false, numero: '', error: 'Número do documento obrigatório ausente' };

  // Colapsa múltiplos traços ou barras consecutivas
  s = s.replace(/-{2,}/g, '-');
  s = s.replace(/\/{2,}/g, '/');

  // Verifica ano incompleto no final (ex: '007-202' ou '007/202' ou ano com 3 dígitos)
  if (/[\/\-](?:19\d|20\d)$/.test(s) || /[\/\-]\d{3}$/.test(s)) {
    return { valid: false, numero: s, error: 'Número inválido, ano incompleto' };
  }

  // Verifica se termina em hífen ou barra solta (ex: '007-')
  if (/[\/\-]$/.test(s)) {
    return { valid: false, numero: s, error: 'Número inválido, formato incompleto' };
  }

  return { valid: true, numero: s };
};

// 1) Parser de datas único (parseDataFlex)
export interface ParseDateResult {
  valid: boolean;
  iso: string;
  display: string;
  warning?: string;
  error?: string;
}

export const parseDataFlex = (val: any): ParseDateResult => {
  if (val === null || val === undefined || String(val).trim() === '') {
    return { valid: true, iso: '', display: '' };
  }

  // Objeto Date nativo (ex: do XLSX com cellDates: true)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return { valid: false, iso: '', display: '', error: 'Data com valor inválido' };
    }
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const iso = new Date(Date.UTC(y, val.getMonth(), val.getDate(), 12, 0, 0)).toISOString();
    return { valid: true, iso, display: `${d}/${m}/${y}` };
  }

  // Número serial do Excel
  if (typeof val === 'number') {
    if (val < 1 || isNaN(val)) {
      return { valid: false, iso: '', display: String(val), error: 'Número serial de data inválido' };
    }
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      const iso = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate(), 12, 0, 0)).toISOString();
      return { valid: true, iso, display: `${d}/${m}/${y}` };
    }
    return { valid: false, iso: '', display: String(val), error: 'Número serial de data inválido' };
  }

  let s = String(val).trim();
  if (!s) return { valid: true, iso: '', display: '' };

  // Formato AAAA-MM-DD (ISO padrão)
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const iso = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
      return { valid: true, iso, display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` };
    }
  }

  let wasCorrected = false;
  const warnings: string[] = [];

  // Remove caracteres estranhos do início e fim
  let cleaned = s.replace(/^[^\d]+|[^\d]+$/g, '');

  let rawParts = cleaned.split(/[\/\-]/);
  if (rawParts.length !== 3) {
    const dotParts = cleaned.split(/\./);
    if (dotParts.length === 3) {
      rawParts = dotParts;
      wasCorrected = true;
    } else {
      return { valid: false, iso: '', display: s, error: 'Formato de data não reconhecido' };
    }
  }

  let [p0, p1, p2] = rawParts.map(p => p.trim());

  // Correção de pontos nos componentes (ex: '202.6' vira '2026')
  if (p2.includes('.')) {
    p2 = p2.replace(/\./g, '');
    wasCorrected = true;
  }
  if (p0.includes('.')) {
    p0 = p0.replace(/\./g, '');
    wasCorrected = true;
  }
  if (p1.includes('.')) {
    p1 = p1.replace(/\./g, '');
    wasCorrected = true;
  }

  // Correção de ano digitado incorreto (ex: '0226' vira '2026')
  if (/^02\d{2}$/.test(p2)) {
    p2 = '20' + p2.slice(2);
    wasCorrected = true;
  } else if (/^\d{2}$/.test(p2)) {
    p2 = '20' + p2;
    wasCorrected = true;
  }

  // Correção de zeros/dígitos sobrando (ex: '014' vira '01' se dia for > 12)
  if (p0.length > 2 && p0.startsWith('0')) {
    p0 = p0.slice(0, 2);
    wasCorrected = true;
  }
  if (p1.length > 2 && p1.startsWith('0')) {
    p1 = p1.slice(0, 2);
    wasCorrected = true;
  }

  const n0 = parseInt(p0, 10);
  const n1 = parseInt(p1, 10);
  const y = parseInt(p2, 10);

  if (isNaN(n0) || isNaN(n1) || isNaN(y)) {
    return { valid: false, iso: '', display: s, error: 'Componentes de data não numéricos' };
  }

  if (y < 1900 || y > 2099) {
    return { valid: false, iso: '', display: s, error: `Ano inválido (${y})` };
  }

  let day: number;
  let month: number;

  // Regra:
  // - se o primeiro número for maior que 12: é DD/MM
  // - se o segundo for maior que 12: é M/D
  // - se ambos forem 12 ou menos (ambíguo): use DD/MM, grave a linha e marque aviso 'Data ambígua assumida como DD/MM'
  if (n0 > 12 && n1 <= 12) {
    day = n0;
    month = n1;
  } else if (n1 > 12 && n0 <= 12) {
    month = n0;
    day = n1;
  } else if (n0 <= 12 && n1 <= 12) {
    day = n0;
    month = n1;
    warnings.push('Data ambígua assumida como DD/MM');
  } else {
    return { valid: false, iso: '', display: s, error: 'Dia e mês inválidos (ambos > 12)' };
  }

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { valid: false, iso: '', display: s, error: `Dia (${day}) ou mês (${month}) fora da faixa válida` };
  }

  if (wasCorrected) {
    warnings.push('Data corrigida');
  }

  const iso = new Date(Date.UTC(y, month - 1, day, 12, 0, 0)).toISOString();
  const display = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${y}`;

  return {
    valid: true,
    iso,
    display,
    warning: warnings.length > 0 ? warnings.join(' | ') : undefined
  };
};

// 3) Identificador de linha separadora de mês ou vazia
export const isSeparatorOrEmptyRow = (rowObjOrArr: any): boolean => {
  if (!rowObjOrArr) return true;
  const values = Array.isArray(rowObjOrArr) ? rowObjOrArr : Object.values(rowObjOrArr);
  const nonEmpty = values.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (nonEmpty.length === 0) return true;

  if (nonEmpty.length === 1) {
    const text = String(nonEmpty[0])
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Nome de mês
    if (MONTH_NAMES.some(m => text === m || text.includes(m))) {
      return true;
    }
    // Cabeçalho de título ou data no topo antes do cabeçalho
    if (text.startsWith('mes de') || text.startsWith('total') || text.startsWith('exercicio') || text.startsWith('relatorio') || text.startsWith('conselho')) {
      return true;
    }
  }

  return false;
};

// Sanitizador para chave natural
const sanitizeKey = (v: string): string => {
  return String(v || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
};

// Parser de moedas brasileiras
export const parseCurrencyBR = (val: any): { valid: boolean; value: number } => {
  if (val === null || val === undefined || val === '') return { valid: false, value: 0 };
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return { valid: false, value: 0 };
    return { valid: true, value: val };
  }
  const str = String(val).trim();
  let cleaned = str.replace(/R\$/gi, '').replace(/\s/g, '');
  
  if (/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleaned) || /^-?\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    // float padrão
  } else {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  
  const num = parseFloat(cleaned);
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, value: 0 };
  }
  return { valid: true, value: num };
};

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
  warnings: string[];
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
  hasWarning: boolean;
  warnings?: string[];
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

  // Estados de análise e pré-visualização
  const [validRows, setValidRows] = useState<ValidRowItem[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<DuplicateRowItem[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRowItem[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRowItem[]>([]);
  const [stats, setStats] = useState<{
    totalLinhas: number;
    criadas: number;
    atualizadas: number;
    duplicadasNoArquivo: number;
    comAviso: number;
    comErro: number;
    ignoradasSeparadores: number;
  }>({
    totalLinhas: 0,
    criadas: 0,
    atualizadas: 0,
    duplicadasNoArquivo: 0,
    comAviso: 0,
    comErro: 0,
    ignoradasSeparadores: 0
  });

  // Execução da Importação
  const [stopRequested, setStopRequested] = useState(false);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [finalSummary, setFinalSummary] = useState<{
    criados: number;
    atualizados: number;
    ignorados: number;
    comAviso: number;
    comErro: number;
    ignoradasSeparadores: number;
  } | null>(null);

  // Modal de Limpeza de Base
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);

  const handleCancel = () => {
    setStatus('idle');
    setFileName('');
    setValidRows([]);
    setDuplicateRows([]);
    setErrorRows([]);
    setPreviewRows([]);
    setStats({
      totalLinhas: 0,
      criadas: 0,
      atualizadas: 0,
      duplicadasNoArquivo: 0,
      comAviso: 0,
      comErro: 0,
      ignoradasSeparadores: 0
    });
    setGeneralError(null);
    setFinalSummary(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getExistingDocIds = async (colName: string): Promise<Set<string>> => {
    try {
      const snap = await getDocs(collection(db, colName));
      const set = new Set<string>();
      snap.forEach(d => set.add(d.id));
      return set;
    } catch (e) {
      console.warn(`Aviso ao ler documentos de ${colName}:`, e);
      return new Set<string>();
    }
  };

  const processAndValidateRows = async (rawRows: any[], targetType: 'BASE_FINANCEIRA' | 'OFICIOS' | 'PROCESSOS', preIgnoredCount: number = 0) => {
    setStatus('analyzing');
    setGeneralError(null);

    const collectionName = targetType === 'BASE_FINANCEIRA' ? 'debits' : targetType === 'OFICIOS' ? 'oficios' : 'processos';
    const existingDocIds = await getExistingDocIds(collectionName);

    const valids: ValidRowItem[] = [];
    const duplicates: DuplicateRowItem[] = [];
    const errors: ErrorRowItem[] = [];
    const previewList: PreviewRowItem[] = [];

    const seenKeysInFile = new Set<string>();
    let separadoresCount = preIgnoredCount;

    for (let i = 0; i < rawRows.length; i++) {
      const item = rawRows[i];
      const rowIndex = i + 2;

      // 3) Ignora sem contar como erro: vazias e separadores de mês
      if (isSeparatorOrEmptyRow(item)) {
        separadoresCount++;
        continue;
      }

      const rowWarnings: string[] = [];

      if (targetType === 'BASE_FINANCEIRA') {
        const rawCrb = findValue(item, ['CRB', 'Nº do CRB', 'N do CRB', 'Inscrição', 'Registro', 'CRB Profissional']);
        const rawNome = findValue(item, ['Nome', 'Razão Social', 'Nome/Razão Social', 'Profissional', 'Contribuinte']);
        const rawAno = findValue(item, ['Ano', 'Ano do Exercício', 'Ano Exercício', 'Exercício', 'Exercicio']);
        const rawOrigem = findValue(item, ['Origem', 'Origem Débito', 'Origem do Débito', 'Tipo', 'Nome Débito', 'Descrição', 'Debito']);
        const rawValor = findValue(item, ['Valor', 'Valor Original', 'Valor Histórico', 'Valor Principal']);
        const rawValorCorrigido = findValue(item, ['Valor Corrigido', 'ValorCorrigido', 'Total', 'Valor Atualizado']);
        const rawDataVenc = findValue(item, ['Data Vencimento', 'Vencimento', 'DataVencimento', 'Venc.']);
        const rawStatus = findValue(item, ['Status Geral', 'Status', 'Situação', 'Situacao']);
        
        const rawDataNotif = findValue(item, ['Data Notificação', 'Data da Notificação', 'Notificação', 'Data Notificacao']);
        const rawDataProtesto = findValue(item, ['Data Protesto', 'Data do Protesto', 'Protesto', 'DataProtesto']);
        const rawDataComCadin = findValue(item, ['Data Comunicação CADIN', 'Data Comunicacao Cadin', 'Comunicação CADIN']);
        const rawDataCadin = findValue(item, ['Data CADIN', 'Inclusão CADIN', 'Data Inclusao Cadin', 'DataCadin']);

        const crbClean = cleanText(rawCrb);
        const nomeClean = cleanText(rawNome);
        const origemClean = cleanText(rawOrigem || 'Anuidade');

        // CRB obrigatório
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
              hasWarning: false,
              key: `Linha ${rowIndex}`,
              identificador: 'Sem CRB',
              detalhe1: nomeClean || 'Sem Nome',
              detalhe2: 'Ex.: ---',
              detalhe3: 'R$ ---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        // Exercício numérico entre 1990 e CURRENT_YEAR
        let anoNum: number | null = null;
        if (rawAno !== undefined && rawAno !== null && String(rawAno).trim() !== '') {
          const parsedAno = parseInt(cleanText(rawAno), 10);
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
              hasWarning: false,
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

        // Valores monetários
        const parsedValor = parseCurrencyBR(rawValor);
        if (!parsedValor.valid || parsedValor.value < 0) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `CRB: ${crbClean} (${anoNum})`,
            reason: `Valor monetário original inválido: "${rawValor}". Aceita formato brasileiro (ex: 1.234,56 ou R$ 1.234,56).`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              hasWarning: false,
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

        // Validação com parseDataFlex
        const parsedVenc = parseDataFlex(rawDataVenc);
        if (!parsedVenc.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `CRB: ${crbClean} (${anoNum})`,
            reason: `Data de vencimento inválida: "${rawDataVenc}". ${parsedVenc.error || ''}`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              hasWarning: false,
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

        if (parsedVenc.warning) {
          rowWarnings.push(`Vencimento: ${parsedVenc.warning}`);
        }

        const parsedNotif = parseDataFlex(rawDataNotif);
        if (parsedNotif.warning) rowWarnings.push(`Notificação: ${parsedNotif.warning}`);
        const parsedProtesto = parseDataFlex(rawDataProtesto);
        if (parsedProtesto.warning) rowWarnings.push(`Protesto: ${parsedProtesto.warning}`);
        const parsedComCadin = parseDataFlex(rawDataComCadin);
        if (parsedComCadin.warning) rowWarnings.push(`Comunicação CADIN: ${parsedComCadin.warning}`);
        const parsedCadin = parseDataFlex(rawDataCadin);
        if (parsedCadin.warning) rowWarnings.push(`CADIN: ${parsedCadin.warning}`);

        // Chave Natural Débito: CRB + exercicio + origem
        const cleanCrbKey = sanitizeKey(crbClean);
        const origemSlug = rawOrigem ? sanitizeKey(origemClean).slice(0, 20) : '';
        const naturalKey = origemSlug 
          ? `deb_${cleanCrbKey}_${anoNum}_${origemSlug}` 
          : `deb_${cleanCrbKey}_${anoNum}`;

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
              hasWarning: false,
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
          statusGeral: cleanText(rawStatus) || 'Pendente',
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
          previewData: debitoData,
          warnings: rowWarnings
        });

        if (previewList.length < 20) {
          previewList.push({
            rowIndex,
            status: isUpdate ? 'ATUALIZAR' : 'NOVO',
            hasWarning: rowWarnings.length > 0,
            warnings: rowWarnings,
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

        const normNumero = normalizeDocNumero(rawNumero);
        const assuntoClean = cleanText(rawAssunto);
        const destinatarioClean = cleanText(rawDestinatario);

        if (!normNumero.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Linha ${rowIndex}`,
            reason: normNumero.error || 'Número do ofício obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              hasWarning: false,
              key: `Linha ${rowIndex}`,
              identificador: cleanText(rawNumero) || 'Sem Número',
              detalhe1: assuntoClean || '---',
              detalhe2: destinatarioClean || '---',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        const numeroClean = normNumero.numero;

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
              hasWarning: false,
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
              hasWarning: false,
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

        const parsedDate = parseDataFlex(rawData);
        if (!parsedDate.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Ofício: ${numeroClean}`,
            reason: `Data inválida no ofício: "${rawData}". ${parsedDate.error || ''}`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              hasWarning: false,
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

        if (parsedDate.warning) {
          rowWarnings.push(`Data do ofício: ${parsedDate.warning}`);
        }

        // Chave Natural Ofício: número do documento
        const naturalKey = `ofi_${sanitizeKey(numeroClean)}`;

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
              hasWarning: false,
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
          tipo: cleanText(rawTipo || 'Circular'),
          tipoOficio: cleanText(rawTipo || 'Circular'),
          destinatario: destinatarioClean,
          data: dataFinal,
          dataEnvio: dataFinal,
          dataEmissao: dataFinal,
          status: cleanText(rawStatus || 'Enviado'),
          observacao: cleanText(rawObs),
          ano: isNaN(anoNum) ? CURRENT_YEAR : anoNum,
          updatedAt: new Date().toISOString()
        };

        valids.push({
          id: naturalKey,
          naturalKey,
          isUpdate,
          data: oficioData,
          rowIndex,
          previewData: oficioData,
          warnings: rowWarnings
        });

        if (previewList.length < 20) {
          previewList.push({
            rowIndex,
            status: isUpdate ? 'ATUALIZAR' : 'NOVO',
            hasWarning: rowWarnings.length > 0,
            warnings: rowWarnings,
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

        const normNumero = normalizeDocNumero(rawNumero);
        const profissionalClean = cleanText(rawProfissional);
        const solicitacaoClean = cleanText(rawSolicitacao);

        if (!normNumero.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Linha ${rowIndex}`,
            reason: normNumero.error || 'Número do processo obrigatório ausente.',
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              hasWarning: false,
              key: `Linha ${rowIndex}`,
              identificador: cleanText(rawNumero) || 'Sem Processo',
              detalhe1: profissionalClean || '---',
              detalhe2: solicitacaoClean || '---',
              detalhe3: '---',
              motivoErro: errItem.reason
            });
          }
          continue;
        }

        const numeroClean = normNumero.numero;

        // 6) Linha só com número e solicitação e sem profissional continua erro
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
              hasWarning: false,
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
              hasWarning: false,
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

        const parsedDateSol = parseDataFlex(rawDataSolicitacao);
        if (!parsedDateSol.valid) {
          const errItem: ErrorRowItem = {
            rowIndex,
            key: `Processo: ${numeroClean}`,
            reason: `Data de solicitação inválida: "${rawDataSolicitacao}". ${parsedDateSol.error || ''}`,
            raw: item
          };
          errors.push(errItem);
          if (previewList.length < 20) {
            previewList.push({
              rowIndex,
              status: 'ERRO',
              hasWarning: false,
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

        if (parsedDateSol.warning) {
          rowWarnings.push(`Data da solicitação: ${parsedDateSol.warning}`);
        }

        // 6) DATA DA PLENÁRIA: se não for data (ex: Analisar Vera, Conselheiro), grava esse texto no campo responsavel/observacao da plenaria e nao como erro
        let plenariaIso: string | null = null;
        let plenariaTextoObservacao: string | null = null;

        if (rawDataPlenaria !== undefined && rawDataPlenaria !== null && String(rawDataPlenaria).trim() !== '') {
          const parsedPlenaria = parseDataFlex(rawDataPlenaria);
          if (parsedPlenaria.valid && parsedPlenaria.iso) {
            plenariaIso = parsedPlenaria.iso;
            if (parsedPlenaria.warning) {
              rowWarnings.push(`Data plenária: ${parsedPlenaria.warning}`);
            }
          } else {
            plenariaTextoObservacao = cleanText(rawDataPlenaria);
            rowWarnings.push(`Texto na plenária ("${plenariaTextoObservacao}") registrado como observação`);
          }
        }

        // Chave Natural Processo: número do processo
        const naturalKey = `prc_${sanitizeKey(numeroClean)}`;

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
              hasWarning: false,
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
        const obsClean = cleanText(rawObs);

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
          dataPlenaria: plenariaIso,
          observacaoPlenaria: plenariaTextoObservacao,
          responsavelPlenaria: plenariaTextoObservacao,
          status: cleanText(rawStatus) || 'Em Análise',
          observacao: plenariaTextoObservacao 
            ? (obsClean ? `${obsClean} | Plenária: ${plenariaTextoObservacao}` : `Plenária: ${plenariaTextoObservacao}`)
            : obsClean,
          ano: isNaN(anoNum) ? CURRENT_YEAR : anoNum,
          updatedAt: new Date().toISOString()
        };

        valids.push({
          id: naturalKey,
          naturalKey,
          isUpdate,
          data: processoData,
          rowIndex,
          previewData: processoData,
          warnings: rowWarnings
        });

        if (previewList.length < 20) {
          previewList.push({
            rowIndex,
            status: isUpdate ? 'ATUALIZAR' : 'NOVO',
            hasWarning: rowWarnings.length > 0,
            warnings: rowWarnings,
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
    const comAvisoCount = valids.filter(v => v.warnings.length > 0).length;

    setValidRows(valids);
    setDuplicateRows(duplicates);
    setErrorRows(errors);
    setPreviewRows(previewList);

    setStats({
      totalLinhas: rawRows.length + preIgnoredCount,
      criadas: criadasCount,
      atualizadas: atualizadasCount,
      duplicadasNoArquivo: duplicates.length,
      comAviso: comAvisoCount,
      comErro: errors.length,
      ignoradasSeparadores: separadoresCount
    });

    setStatus('preview');
  };

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
    return 0;
  };

  const convertMatrixToObjects = (rows: any[][], headerIndex: number): { dataObjects: any[]; preIgnoredCount: number } => {
    const headers = rows[headerIndex].map(h => String(h || '').trim());
    const dataObjects: any[] = [];
    const preIgnoredCount = headerIndex; // linhas de título ou data no topo antes do cabeçalho
    
    for (let j = headerIndex + 1; j < rows.length; j++) {
      const row = rows[j];
      if (isSeparatorOrEmptyRow(row)) {
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
    return { dataObjects, preIgnoredCount };
  };

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
          const { dataObjects, preIgnoredCount } = convertMatrixToObjects(matrix, headerIdx);
          processAndValidateRows(dataObjects, importType, preIgnoredCount);
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
          // 2) Leia arquivos .xlsx com cellDates:true para usar o valor real da data e evite ambiguidade
          const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[][];
          if (!matrix || matrix.length === 0) {
            setGeneralError('A planilha Excel está vazia.');
            return;
          }
          const headerIdx = findHeaderRowIndex(matrix);
          const { dataObjects, preIgnoredCount } = convertMatrixToObjects(matrix, headerIdx);
          processAndValidateRows(dataObjects, importType, preIgnoredCount);
        } catch (err: any) {
          setGeneralError(`Erro ao processar planilha Excel: ${err.message || err}`);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      setGeneralError('Formato de arquivo não suportado. Por favor envie arquivos Excel (.xlsx, .xls) ou .csv.');
    }
  };

  // 400 operações por lote no writeBatch
  const handleConfirmImport = async () => {
    if (validRows.length === 0) {
      setGeneralError('Não há registros válidos para importar.');
      return;
    }

    setStatus('importing');
    setProgress(0);
    setStopRequested(false);
    setBatchErrors([]);

    const BATCH_SIZE = 400;
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
      }

      const currentProgress = Math.min(100, Math.round(((i + chunk.length) / totalToImport) * 100));
      setProgress(currentProgress);
    }

    await logAuditoria('IMPORTACAO', collectionName.toUpperCase(), 'Múltiplos', {
      totalArquivo: stats.totalLinhas,
      validos: validRows.length,
      gravadosCriados: committedCreated,
      gravadosAtualizados: committedUpdated,
      errosValidacao: errorRows.length,
      duplicadosArquivo: duplicateRows.length,
      comAviso: stats.comAviso,
      ignoradasSeparadores: stats.ignoradasSeparadores,
      falhasLotes: failures.length
    });

    setBatchErrors(failures);
    setFinalSummary({
      criados: committedCreated,
      atualizados: committedUpdated,
      ignorados: duplicateRows.length,
      comAviso: stats.comAviso,
      comErro: errorRows.length + (validRows.length - committedCount),
      ignoradasSeparadores: stats.ignoradasSeparadores
    });

    setStatus('finished');
  };

  // 7) Download de inconsistências e avisos em CSV
  const handleDownloadErrorReport = () => {
    const reportRows: Array<{
      Linha: number | string;
      Identificador: string;
      Tipo: string;
      Motivo: string;
      Detalhes: string;
    }> = [];

    // Erros
    errorRows.forEach(err => {
      reportRows.push({
        Linha: err.rowIndex,
        Identificador: err.key,
        Tipo: 'ERRO_VALIDACAO',
        Motivo: err.reason,
        Detalhes: JSON.stringify(err.raw || {})
      });
    });

    // Duplicados no arquivo
    duplicateRows.forEach(dup => {
      reportRows.push({
        Linha: dup.rowIndex,
        Identificador: dup.key,
        Tipo: 'DUPLICADO_NO_ARQUIVO',
        Motivo: dup.reason,
        Detalhes: JSON.stringify(dup.previewData || {})
      });
    });

    // Linhas com Avisos
    validRows.filter(v => v.warnings.length > 0).forEach(w => {
      reportRows.push({
        Linha: w.rowIndex,
        Identificador: w.naturalKey,
        Tipo: 'AVISO',
        Motivo: w.warnings.join(' | '),
        Detalhes: 'Linha validada e importada com aviso'
      });
    });

    // Falhas de lote se houver
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
      alert('Nenhum erro ou aviso registrado para este arquivo.');
      return;
    }

    const csvContent = Papa.unparse(reportRows, { delimiter: ';' });
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_inconsistencias_e_avisos_${importType.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Limpeza de Base pelo perfil ADMIN exigindo digitar LIMPAR
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
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Barra de Título */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm gap-6 border-l-8 border-crb-blue">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-crb-navy">Carga de Dados</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">
              Etapa 4 - Deduplicação, Tratamento de Datas & Linhas
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Validação inteligente de datas, normalização de textos/documentos, descarte de separadores e upsert resiliente.
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

      {status === 'analyzing' && (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
          <RefreshCw size={36} className="animate-spin text-crb-blue mx-auto" />
          <h3 className="text-lg font-bold text-crb-navy">Validando, normalizando e deduplicando registros...</h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Aplicando parser flexível de datas (DD/MM, M/D, correção de digitação), limpando aspas duplicadas, normalizando números de ofício/processo e filtrando separadores.
          </p>
        </div>
      )}

      {/* PRÉ-VISUALIZAÇÃO */}
      {status === 'preview' && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
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
                  Validação prévia concluída. Revise os contadores e a amostra de linhas antes de confirmar a gravação.
                </p>
              </div>
            </div>

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

          {/* Cards de Contadores e Diagnóstico */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Linhas</span>
              <span className="text-2xl font-serif font-bold text-slate-800">{stats.totalLinhas}</span>
              <p className="text-[10px] text-slate-400 mt-1">No arquivo original</p>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-sm">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block mb-1">Serão Criados</span>
              <span className="text-2xl font-serif font-bold text-emerald-800">{stats.criadas}</span>
              <p className="text-[10px] text-emerald-600 mt-1">Novos registros</p>
            </div>

            <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 shadow-sm">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block mb-1">Serão Atualizados</span>
              <span className="text-2xl font-serif font-bold text-blue-800">{stats.atualizadas}</span>
              <p className="text-[10px] text-blue-600 mt-1">Mesclados por chave</p>
            </div>

            <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 shadow-sm">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest block mb-1">Duplicadas Arq.</span>
              <span className="text-2xl font-serif font-bold text-purple-800">{stats.duplicadasNoArquivo}</span>
              <p className="text-[10px] text-purple-600 mt-1">Mesma chave no arq.</p>
            </div>

            <div className="bg-amber-50/80 p-4 rounded-2xl border border-amber-300 shadow-sm">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest block mb-1">Com Aviso</span>
              <span className="text-2xl font-serif font-bold text-amber-900">{stats.comAviso}</span>
              <p className="text-[10px] text-amber-700 mt-1">Data ambígua / corrigida</p>
            </div>

            <div className="bg-red-50/70 p-4 rounded-2xl border border-red-200 shadow-sm">
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1">Com Erro</span>
              <span className="text-2xl font-serif font-bold text-red-800">{stats.comErro}</span>
              <p className="text-[10px] text-red-600 mt-1">Não gravadas</p>
            </div>

            <div className="bg-slate-100/70 p-4 rounded-2xl border border-slate-300 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Ignoradas</span>
              <span className="text-2xl font-serif font-bold text-slate-700">{stats.ignoradasSeparadores}</span>
              <p className="text-[10px] text-slate-500 mt-1">Separadores / vazias</p>
            </div>
          </div>

          {/* Banner de download do relatório caso haja erros, avisos ou duplicidades */}
          {(stats.comErro > 0 || stats.comAviso > 0 || stats.duplicadasNoArquivo > 0) && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-900 font-medium">
                  Diagnóstico da planilha: <strong>{stats.comAviso} registros com aviso</strong> (ex: datas ambíguas assumidas como DD/MM ou datas corrigidas), <strong>{stats.comErro} com erro</strong> e <strong>{stats.duplicadasNoArquivo} duplicadas no arquivo</strong>.
                </p>
              </div>
              <button 
                onClick={handleDownloadErrorReport}
                className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 transition-all cursor-pointer shrink-0"
              >
                <Download size={14} />
                Baixar Relatório de Inconsistências e Avisos (CSV)
              </button>
            </div>
          )}

          {/* Tabela de Amostra das primeiras 20 linhas */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-crb-navy uppercase tracking-widest">
                  Amostra das Primeiras 20 Linhas com Diagnóstico e Avisos
                </span>
                <p className="text-[11px] text-slate-500">
                  Badges indicam status de inserção e eventuais alertas em amarelo.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                Exibindo {Math.min(previewRows.length, 20)} linhas
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
                    <th className="px-4 py-3">Motivo / Avisos / Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, idx) => (
                    <tr 
                      key={idx} 
                      className={cn(
                        "hover:bg-slate-50 transition-colors",
                        row.status === 'ERRO' && "bg-red-50/40",
                        row.status === 'DUPLICADO' && "bg-purple-50/30",
                        row.hasWarning && row.status !== 'ERRO' && "bg-amber-50/30"
                      )}
                    >
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-400">
                        #{row.rowIndex}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.status === 'NOVO' && (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              <CheckCircle2 size={11} /> Novo
                            </span>
                          )}
                          {row.status === 'ATUALIZAR' && (
                            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              <RefreshCw size={11} /> Atualizar
                            </span>
                          )}
                          {row.status === 'DUPLICADO' && (
                            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              <Layers size={11} /> Duplicado
                            </span>
                          )}
                          {row.status === 'ERRO' && (
                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              <AlertCircle size={11} /> Inválido
                            </span>
                          )}

                          {/* 7) Badge amarelo de Aviso */}
                          {row.hasWarning && (
                            <span className="inline-flex items-center gap-1 bg-amber-200/80 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[10px]" title={row.warnings?.join(' | ')}>
                              <AlertTriangle size={11} /> Aviso
                            </span>
                          )}
                        </div>
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
                        ) : row.hasWarning && row.warnings && row.warnings.length > 0 ? (
                          <div className="space-y-0.5">
                            {row.warnings.map((w, wi) => (
                              <span key={wi} className="text-amber-800 font-medium text-[11px] block">
                                ⚠ {w}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-mono truncate block max-w-xs">
                            {row.key}
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

      {/* IMPORTANDO (Lotes de 400) */}
      {status === 'importing' && (
        <div className="bg-white p-12 md:p-16 rounded-3xl border border-slate-200 shadow-xl text-center space-y-8">
          <div className="w-20 h-20 bg-crb-navy/5 text-crb-navy rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-slate-100 animate-pulse">
            <Database size={40} className="text-crb-blue" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-serif font-bold text-crb-navy">Gravando Dados em Lotes de até 400</h3>
            <p className="text-slate-500 text-xs md:text-sm max-w-lg mx-auto">
              Operações writeBatch ativas. Em caso de falha em um lote individual, os subsequentes prosseguem normalmente.
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
              <span>{validRows.length} registros no fluxo</span>
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

      {/* RESULTADO FINAL */}
      {status === 'finished' && finalSummary && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-xl text-center space-y-8 border-t-8 border-emerald-500">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md shadow-emerald-200">
            <CheckCircle2 size={36} />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl md:text-3xl font-serif font-bold text-crb-navy">
              Carga Concluída com Sucesso!
            </h3>
            <p className="text-slate-500 text-xs md:text-sm max-w-lg mx-auto">
              Os registros foram processados e gravados com deduplicação por chave natural.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 max-w-5xl mx-auto text-left">
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block mb-1">Criados</span>
              <span className="text-3xl font-serif font-bold text-emerald-800">{finalSummary.criados}</span>
              <p className="text-[10px] text-emerald-600 mt-1">Novos documentos</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block mb-1">Atualizados</span>
              <span className="text-3xl font-serif font-bold text-blue-800">{finalSummary.atualizados}</span>
              <p className="text-[10px] text-blue-600 mt-1">Mesclados sem duplicar</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest block mb-1">Duplicados</span>
              <span className="text-3xl font-serif font-bold text-purple-800">{finalSummary.ignorados}</span>
              <p className="text-[10px] text-purple-600 mt-1">Ignorados no arquivo</p>
            </div>

            <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest block mb-1">Com Aviso</span>
              <span className="text-3xl font-serif font-bold text-amber-900">{finalSummary.comAviso}</span>
              <p className="text-[10px] text-amber-700 mt-1">Datas ajustadas</p>
            </div>

            <div className="bg-red-50 border border-red-200 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-widest block mb-1">Com Erro</span>
              <span className="text-3xl font-serif font-bold text-red-800">{finalSummary.comErro}</span>
              <p className="text-[10px] text-red-600 mt-1">Rejeitadas</p>
            </div>

            <div className="bg-slate-100 border border-slate-200 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-1">Separadores</span>
              <span className="text-3xl font-serif font-bold text-slate-700">{finalSummary.ignoradasSeparadores}</span>
              <p className="text-[10px] text-slate-500 mt-1">Vazias / títulos</p>
            </div>
          </div>

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

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            {(finalSummary.comErro > 0 || finalSummary.comAviso > 0 || finalSummary.ignorados > 0 || batchErrors.length > 0) && (
              <button 
                onClick={handleDownloadErrorReport}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
              >
                <Download size={16} />
                Baixar Relatório de Inconsistências e Avisos (CSV)
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

      {/* MODAL LIMPAR BASE EXCLUSIVO ADMIN */}
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
