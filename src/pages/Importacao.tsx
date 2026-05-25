import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Square, 
  FileDown,
  Database
} from 'lucide-react';
import { db, handleFirestoreError, OperationType, logAuditoria } from '../lib/firebase';
import { collection, doc, setDoc, query, where, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Importacao() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [importType, setImportType] = useState<'BASE_FINANCEIRA' | 'OFICIOS' | 'PROCESSOS'>('BASE_FINANCEIRA');
  const [status, setStatus] = useState<'idle' | 'preview' | 'importing' | 'finished'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    successCount: number;
    ignoredCount: number;
    ignoredDetails: string[];
    errorCount: number;
    errorDetails: string[];
  } | null>(null);

  if (!isAdmin) return <div className="p-8 text-center text-slate-500">Acesso negado.</div>;

  async function limparBaseCompleta() {
    const confirmar = confirm("Deseja realmente apagar TODOS os dados do sistema? Esta ação é irreversível.");
    if (!confirmar) return;

    setIsCleaning(true);
    try {
      console.log("Iniciando limpeza completa...");

      async function deletarColecao(nomeColecao: string) {
        const snapshot = await getDocs(collection(db, nomeColecao));
        console.log(`Limpando coleção ${nomeColecao}: ${snapshot.size} documentos encontrados.`);
        
        const deletePromises = snapshot.docs.map(docItem => deleteDoc(doc(db, nomeColecao, docItem.id)));
        await Promise.all(deletePromises);
        
        console.log(`Coleção ${nomeColecao} limpa com sucesso.`);
      }

      await deletarColecao("debits");
      await deletarColecao("notifications");
      await deletarColecao("negotiations");
      await deletarColecao("oficios");
      await deletarColecao("processos");
      
      await logAuditoria('EXCLUSAO', 'LIMPEZA_BASE', 'Tudo', { action: 'Database Wipe' });

      alert("✅ Todos os dados foram apagados com sucesso. A página será recarregada.");
      window.location.reload();
    } catch (error) {
      console.error("Erro ao limpar base:", error);
      alert("Erro ao apagar dados. Verifique o console para mais detalhes.");
    } finally {
      setIsCleaning(false);
    }
  }

  const findHeaderRowIndex = (rows: any[][]): number => {
    const normalizeKey = (key: string) => {
      return String(key || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")     // replace all special characters/punctuation with space
        .replace(/\s+/g, " ")            // turn multiple spaces to single space
        .trim();
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;

      const normalizedCells = row.map(cell => normalizeKey(String(cell || '')));

      const hasNumeroProcesso = normalizedCells.some(c => 
        c.includes('numero do processo') || 
        c.includes('n do processo') || 
        c.includes('numero processo') || 
        c === 'numero' || 
        c === 'n processo'
      );

      const hasNomeProfissional = normalizedCells.some(c => 
        c === 'nome' || 
        c.includes('profissional') || 
        c.includes('solicitante') || 
        c.includes('interessado')
      );

      const hasTipo = normalizedCells.some(c => 
        c === 'tipo' || 
        c.includes('tipo de solicitacao') || 
        c.includes('tipo solicitacao') || 
        c.includes('tipo do processo') || 
        c.includes('tipo de processo') || 
        c.includes('solicitacao')
      );

      if (hasNumeroProcesso && hasNomeProfissional && hasTipo) {
        return i;
      }
    }
    return -1;
  };

  const convertRowsToObjects = (rows: any[][], headerIndex: number): any[] => {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();

    if (importType === 'PROCESSOS') {
      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: false,
          skipEmptyLines: false, // process empty rows ourselves to find headers
          complete: (results) => {
            const rows = results.data as any[][];
            const headerIndex = findHeaderRowIndex(rows);
            if (headerIndex === -1) {
              setError('Não foi possível localizar o cabeçalho válido do arquivo de Processos. Verifique se o arquivo possui as colunas: "Numero do Processo", "Nome" e "Tipo".');
              return;
            }
            const dataObjects = convertRowsToObjects(rows, headerIndex);
            processImportData(dataObjects);
          }
        });
      } else {
        reader.onload = (evt) => {
          try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            const headerIndex = findHeaderRowIndex(rows);
            if (headerIndex === -1) {
              setError('Não foi possível localizar o cabeçalho válido do arquivo de Processos. Verifique se o arquivo possui as colunas: "Numero do Processo", "Nome" e "Tipo".');
              return;
            }
            const dataObjects = convertRowsToObjects(rows, headerIndex);
            processImportData(dataObjects);
          } catch (err: any) {
            console.error(err);
            setError(`Erro ao ler o arquivo Excel: ${err.message || err}`);
          }
        };
        reader.readAsBinaryString(file);
      }
    } else {
      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processImportData(results.data);
          }
        });
      } else {
        reader.onload = (evt) => {
          try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            processImportData(data);
          } catch (err: any) {
            console.error(err);
            setError(`Erro ao ler o arquivo Excel: ${err.message || err}`);
          }
        };
        reader.readAsBinaryString(file);
      }
    }
  };

  const processImportData = (raw: any[]) => {
    const normalizeKey = (key: string) => {
      return String(key || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")     // replace all special characters/punctuation with space
        .replace(/\s+/g, " ")            // turn multiple spaces to single space
        .trim();                         // trim spaces
    };

    const findValue = (item: any, possibleNames: string[]) => {
      const normalizedPossibles = possibleNames.map(normalizeKey);
      const keys = Object.keys(item || {});
      for (const key of keys) {
        if (normalizedPossibles.includes(normalizeKey(key))) {
          return item[key];
        }
      }
      return undefined;
    };

    const parseDateISO = (val: any) => {
      if (!val) return "";
      if (typeof val === 'number') {
        // XLSX serial date
        const date = new Date((val - 25569) * 86400 * 1000);
        return date.toISOString();
      }
      const s = String(val).trim();
      if (!s) return "";
      
      const parts = s.split(/[\/\-]/);
      if (parts.length === 3) {
        let d, m, y;
        // Se a terceira parte tem 4 dígitos (ex: 2026 em 25/05/2026)
        if (parts[2].length === 4) {
          y = parts[2];
          const p0 = parseInt(parts[0], 10);
          const p1 = parseInt(parts[1], 10);
          // Sob o contexto brasileiro, o padrão é DD/MM/YYYY (ex: 25/05/2026)
          // Mas se o segundo número (mês) for maior que 12, então deve ser MM/DD/YYYY (como 12/25/2026)
          if (p1 > 12) {
            m = parts[0];
            d = parts[1];
          } else {
            d = parts[0];
            m = parts[1];
          }
        } else if (parts[0].length === 4) {
          // YYYY-MM-DD
          y = parts[0];
          m = parts[1];
          d = parts[2];
        }
        
        if (y && m && d) {
          const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
          return date.toISOString();
        }
      }
      try {
        const date = new Date(s);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch (e) {}
      return "";
    };

    const parseVal = (val: any) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const s = String(val).replace('R$', '').replace(/\s/g, '');
      // Handle "1.430,21" -> 1430.21
      return parseFloat(s.replace(/\./g, '').replace(',', '.') || '0');
    };

    if (importType === 'OFICIOS') {
      if (raw.length > 0) {
        const firstRow = raw[0];
        const hasNumero = findValue(firstRow, ['numero do oficio', 'nº do oficio', 'numero do ofício', 'numero', 'n do oficio', 'numeroOficio', 'numero_do_oficio', 'numero oficio']) !== undefined;
        const hasAssunto = findValue(firstRow, ['assunto', 'tema', 'topico']) !== undefined;
        const hasDestinatario = findValue(firstRow, ['destinatario', 'destinatário', 'interessado', 'crb profissional', 'profissional']) !== undefined;

        if (!hasNumero || !hasAssunto || !hasDestinatario) {
          setError('Coluna obrigatória ausente. A planilha deve conter pelo menos as colunas: "Numero do Oficio" (ou nº do oficio), "Assunto" e "Destinatario".');
          setStatus('idle');
          return;
        }
      }

      const oficiosList: any[] = [];
      const encounteredOficioNumbers = new Set<string>();

      raw.forEach((item, index) => {
        const numeroRaw = findValue(item, ['numero do oficio', 'nº do oficio', 'numero do ofício', 'numero', 'n do oficio', 'numeroOficio', 'numero_do_oficio', 'numero oficio']);
        const assuntoRaw = findValue(item, ['assunto', 'tema', 'topico']);
        const tipoRaw = findValue(item, ['tipo de oficio', 'tipo de ofício', 'tipo', 'tipoOficio', 'tipo_do_oficio', 'tipo do oficio']);
        const destinatarioRaw = findValue(item, ['destinatario', 'destinatário', 'interessado', 'crb profissional', 'profissional']);
        const dataRaw = findValue(item, ['data do envio', 'data de envio', 'data', 'data envio', 'emissao', 'data de emissao', 'dataEnvio', 'dataEmissao']);
        const statusRaw = findValue(item, ['status', 'situacao', 'situação']);
        const obsRaw = findValue(item, ['obs', 'observacoes', 'observações', 'observacao', 'observação']);
        const anoRaw = findValue(item, ['ano', 'exercicio', 'exercício']);

        // Remoção de espaços extras
        const numeroClean = String(numeroRaw || '').trim().replace(/\s+/g, ' ');
        const assuntoClean = String(assuntoRaw || '').trim().replace(/\s+/g, ' ');
        const destinatarioClean = String(destinatarioRaw || '').trim().replace(/\s+/g, ' ');

        // Validação de presença das colunas obrigatórias
        if (!numeroClean || !assuntoClean || !destinatarioClean) {
          return;
        }

        // Evitar duplicidade de número de ofício no próprio arquivo
        if (encounteredOficioNumbers.has(numeroClean.toLowerCase())) {
          return;
        }
        encounteredOficioNumbers.add(numeroClean.toLowerCase());

        // Padronização de tipo (Circular, Interno, Externo, Gabinete)
        const tipoClean = String(tipoRaw || 'Circular').trim().toLowerCase();
        let tipoStandard = 'Circular';
        if (tipoClean.includes('circular')) {
          tipoStandard = 'Circular';
        } else if (tipoClean.includes('interno') || tipoClean.includes('ci')) {
          tipoStandard = 'Interno';
        } else if (tipoClean.includes('externo')) {
          tipoStandard = 'Externo';
        } else if (tipoClean.includes('gabinete') || tipoClean.includes('presidencia') || tipoClean.includes('presidência')) {
          tipoStandard = 'Gabinete';
        } else if (tipoRaw) {
          tipoStandard = String(tipoRaw).trim().replace(/\s+/g, ' ');
        }

        // Padronização de status (Enviado, Aguardando Envio, Pendente, Cancelado)
        const statusClean = String(statusRaw || 'Enviado').trim().toLowerCase();
        let statusStandard = 'Enviado';
        if (statusClean.includes('aguardando') || statusClean.includes('envio') || statusClean.includes('espera')) {
          statusStandard = 'Aguardando Envio';
        } else if (statusClean.includes('pendente')) {
          statusStandard = 'Pendente';
        } else if (statusClean.includes('cancelado') || statusClean.includes('sem efeito') || statusClean.includes('nulo')) {
          statusStandard = 'Cancelado';
        } else if (statusClean.includes('enviado') || statusClean.includes('protocolado') || statusClean.includes('ok')) {
          statusStandard = 'Enviado';
        } else if (statusRaw) {
          statusStandard = String(statusRaw).trim().replace(/\s+/g, ' ');
        }

        const dataParsed = parseDateISO(dataRaw) || new Date().toISOString();
        const anoParsed = anoRaw ? parseInt(String(anoRaw)) : new Date(dataParsed).getFullYear();

        oficiosList.push({
          numero: numeroClean,
          numeroOficio: numeroClean,
          assunto: assuntoClean,
          tipo: tipoStandard,
          tipoOficio: tipoStandard,
          destinatario: destinatarioClean,
          data: dataParsed,
          dataEnvio: dataParsed,
          dataEmissao: dataParsed,
          status: statusStandard,
          observacao: String(obsRaw || '').trim().replace(/\s+/g, ' '),
          observacoes: String(obsRaw || '').trim().replace(/\s+/g, ' '),
          ano: isNaN(anoParsed) ? new Date().getFullYear() : anoParsed,
          updatedAt: new Date().toISOString()
        });
      });

      setData({ oficios: oficiosList });
      setStatus('preview');
    } else if (importType === 'PROCESSOS') {
      if (raw.length > 0) {
        const firstRow = raw[0];
        const hasNumero = findValue(firstRow, ['numero do processo', 'nº do processo', 'numero de processo', 'numero', 'n do processo', 'numeroProcesso', 'numero_do_oficio', 'numero_do_processo', 'numero processo']) !== undefined;
        const hasNome = findValue(firstRow, ['nome', 'profissional', 'interessado', 'crb profissional', 'nome do profissional', 'profissional interessado']) !== undefined;
        const hasTipo = findValue(firstRow, ['tipo', 'tipo de processo', 'tipo de solicitacao', 'tipo solicitacao', 'solicitacao', 'descricao', 'assunto']) !== undefined;

        if (!hasNumero || !hasNome || !hasTipo) {
          setError('Coluna obrigatória ausente. A planilha deve conter pelo menos as colunas: "Numero do Processo" (ou nº do processo), "Nome" (ou profissional) e "Tipo".');
          setStatus('idle');
          return;
        }
      }

      const processosList: any[] = [];
      const encounteredProcessoNumbers = new Set<string>();

      raw.forEach((item, index) => {
        const numeroRaw = findValue(item, ['numero do processo', 'nº do processo', 'numero de processo', 'numero', 'n do processo', 'numeroProcesso', 'numero_do_processo', 'numero processo']);
        const profissionalRaw = findValue(item, ['nome', 'profissional', 'interessado', 'crb profissional', 'nome do profissional', 'profissional interessado']);
        const solicitationRaw = findValue(item, ['tipo', 'tipo de processo', 'tipo de solicitacao', 'tipo solicitacao', 'solicitacao', 'descricao', 'assunto']);
        
        const dataSolicitacaoRaw = findValue(item, ['data da solicitacao', 'data da solicitação', 'data de solicitacao', 'data de solicitação', 'data solicitacao', 'data solicitação', 'data', 'data abertura', 'abertura', 'dataSolicitacao', 'dataAbertura']);
        const dataPlenariaRaw = findValue(item, ['data da plenaria', 'data da plenária', 'data de plenaria', 'data de plenária', 'data plenaria', 'data plenária', 'plenaria', 'plenária', 'dataPlenaria', 'data_plenaria']);
        const statusRaw = findValue(item, ['status', 'situacao', 'situação']);
        const obsRaw = findValue(item, ['obs', 'observacoes', 'observações', 'observacao', 'observação']);
        const anoRaw = findValue(item, ['ano', 'exercicio', 'exercício']);

        // Remoção de espaços extras
        const numeroClean = String(numeroRaw || '').trim().replace(/\s+/g, ' ');
        const profissionalClean = String(profissionalRaw || '').trim().replace(/\s+/g, ' ');
        const solicitationClean = String(solicitationRaw || '').trim().replace(/\s+/g, ' ');

        // Validação de presença das colunas obrigatórias
        if (!numeroClean || !profissionalClean || !solicitationClean) {
          return;
        }

        // Evitar duplicidade de número de processo no próprio arquivo
        if (encounteredProcessoNumbers.has(numeroClean.toLowerCase())) {
          return;
        }
        encounteredProcessoNumbers.add(numeroClean.toLowerCase());

        // Normalização de Datas
        const dataSolicitacaoParsed = parseDateISO(dataSolicitacaoRaw) || new Date().toISOString();
        const dataPlenariaParsed = parseDateISO(dataPlenariaRaw) || "";

        const anoParsed = anoRaw ? parseInt(String(anoRaw)) : new Date(dataSolicitacaoParsed).getFullYear();

        processosList.push({
          numero: numeroClean,
          numeroProcesso: numeroClean,
          profissional: profissionalClean,
          interessado: profissionalClean,
          solicitacao: solicitationClean,
          descricao: solicitationClean,
          dataSolicitacao: dataSolicitacaoParsed,
          dataAbertura: dataSolicitacaoParsed,
          dataPlenaria: dataPlenariaParsed || null,
          status: String(statusRaw || 'Em Análise').trim().replace(/\s+/g, ' '),
          observacao: String(obsRaw || '').trim().replace(/\s+/g, ' '),
          observacoes: String(obsRaw || '').trim().replace(/\s+/g, ' '),
          ano: isNaN(anoParsed) ? new Date().getFullYear() : anoParsed,
          updatedAt: new Date().toISOString()
        });
      });

      setData({ processos: processosList });
      setStatus('preview');
    } else {
      const debitos: any[] = [];
      const notifications: any[] = [];
      const negotiations: any[] = [];

      raw.forEach(item => {
        const crb = String(item['CRB'] || item['Nº do CRB'] || item['Nº do CRB '] || '').trim();
        const nome = String(item['Nome'] || item['Razão Social'] || item['Nome/Razão Social'] || '').trim();
        const ano = parseInt(item['Ano'] || item['Ano do Exercício'] || '0');
        
        if (!crb || !ano) return;

        const debitoId = `${crb}_${ano}`.replace(/[\/\.]/g, '-');
        
        // Debito data
        debitos.push({
          id: debitoId,
          crb,
          nome,
          ano,
          nomeDebito: item['Nome Débito'] || item['Descrição'] || 'Anuidade',
          dataVencimento: parseDateISO(item['Data Vencimento'] || item['Vencimento'] || item['DataVencimento']),
          valor: parseVal(item['Valor'] || item['Valor Original']),
          valorCorrigido: parseVal(item['Valor Corrigido'] || item['ValorCorrigido'] || item['Total']),
          statusGeral: item['Status Geral'] || 'Pendente',
          updatedAt: new Date().toISOString()
        });

        // Notification data
        if (item['Data Notificação'] || item['Tipo Notificação']) {
          notifications.push({
            debitoId,
            debitosIds: [debitoId],
            dataNotificacao: parseDateISO(item['Data Notificação'] || item['DataNotificacao']),
            tipo: item['Tipo Notificação'] || 'Administrativa',
            prazoDias: parseInt(item['Prazo Resposta'] || item['Prazo'] || '15'),
            statusPrazo: item['Status Prazo'] || 'Em Aberto',
            tipoEnvio: item['Status Contato'] || item['Tipo de Envio'] || 'Correios',
            createdAt: new Date().toISOString()
          });
        }

        // Negotiation data
        if (item['Forma Negociação'] || item['Valor Negociado']) {
          negotiations.push({
            crb,
            debitosIds: [debitoId],
            valorTotal: parseVal(item['Valor Corrigido'] || item['Total']),
            valorNegociado: parseVal(item['Valor Negociado'] || item['ValorNegociado']),
            formaNegociacao: item['Forma Negociação'] || item['Forma de Pagamento'] || 'Parcelado',
            nParcelas: parseInt(item['Nº Parcelas'] || item['Parcelas'] || '1'),
            statusContato: item['Status Geral'] || 'Concluído',
            dataNegociacao: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          });
        }
      });

      setData({ debitos, notifications, negotiations });
    }
    setStatus('preview');
  };

  const startImport = async () => {
    setStatus('importing');
    setProgress(0);
    setStopRequested(false);

    let totalItems = 0;
    let processedCount = 0;

    const performImport = async (list: any[], collectionName: string) => {
      const batchSize = 100;
      for (let i = 0; i < list.length; i += batchSize) {
        if (stopRequested) return;
        const batch = writeBatch(db);
        const chunk = list.slice(i, i + batchSize);

        chunk.forEach(item => {
          let docRef;
          if (item.id) {
            docRef = doc(db, collectionName, item.id);
          } else {
            let deterministicId;
            if (collectionName === 'notifications') {
              deterministicId = `notif_${item.debitoId}_${item.tipo}_${item.dataNotificacao?.split('T')[0]}`.replace(/[\/\.]/g, '-');
            } else if (collectionName === 'negotiations') {
              deterministicId = `negoc_${item.crb}_${item.debitosIds[0]}_${item.valorNegociado}`.replace(/[\/\.]/g, '-');
            } else if (collectionName === 'oficios') {
              deterministicId = `oficio_${item.numeroOficio}_${item.ano}_${item.destinatario.substring(0, 5)}`.replace(/[\/\.\s]/g, '-');
            } else if (collectionName === 'processos') {
              deterministicId = `processo_${item.numeroProcesso}_${item.ano}_${item.profissional.substring(0, 5)}`.replace(/[\/\.\s]/g, '-');
            }
            
            if (deterministicId) {
              docRef = doc(db, collectionName, deterministicId);
            } else {
              docRef = doc(collection(db, collectionName));
            }
          }
          batch.set(docRef, item, { merge: true });
        });

        try {
          await batch.commit();
        } catch (err) {
          console.error(`Erro no lote ${i} da coleção ${collectionName}:`, err);
          setError(`Erro parcial: Alguns registros da coleção ${collectionName} não foram importados.`);
        }
        
        processedCount += chunk.length;
        setProgress((processedCount / totalItems) * 100);
      }
    };

    try {
      if (importType === 'OFICIOS') {
        const { oficios } = data as any;
        setProgress(5);

        // Buscar ofícios já existentes no Firestore
        const oficiosSnap = await getDocs(collection(db, 'oficios'));
        const existingOficiosSet = new Set<string>();
        oficiosSnap.forEach(d => {
          const item = d.data();
          const n = item.numeroOficio || item.numero;
          if (n) {
            existingOficiosSet.add(String(n).trim().toLowerCase());
          }
        });

        const toImport: any[] = [];
        const ignoredList: string[] = [];
        const errorList: string[] = [];

        oficios.forEach((item: any) => {
          if (existingOficiosSet.has(item.numeroOficio.toLowerCase())) {
            ignoredList.push(`Número ${item.numeroOficio}: Já cadastrado no banco de dados.`);
          } else {
            toImport.push(item);
          }
        });

        let successCount = 0;
        let errorCount = 0;

        if (toImport.length > 0) {
          const batchSize = 100;
          let localProcessed = 0;
          for (let i = 0; i < toImport.length; i += batchSize) {
            if (stopRequested) break;
            const batch = writeBatch(db);
            const chunk = toImport.slice(i, i + batchSize);

            chunk.forEach(item => {
              const deterministicId = `oficio_${item.numeroOficio}_${item.ano}_${item.destinatario.substring(0, 5)}`.replace(/[\/\.\s]/g, '-');
              const docRef = doc(db, 'oficios', deterministicId);
              batch.set(docRef, item, { merge: true });
            });

            try {
              await batch.commit();
              successCount += chunk.length;
            } catch (err: any) {
              console.error('Erro ao salvar lote de ofícios:', err);
              errorCount += chunk.length;
              errorList.push(`Falha de processamento no lote ${Math.floor(i / batchSize) + 1}: ${err.message || err}`);
            }

            localProcessed += chunk.length;
            setProgress(5 + (localProcessed / toImport.length) * 95);
          }
        }

        setImportSummary({
          successCount,
          ignoredCount: ignoredList.length,
          ignoredDetails: ignoredList,
          errorCount,
          errorDetails: errorList
        });

        await logAuditoria('IMPORTACAO', 'OFICIOS', 'Múltiplos', { 
          total: oficios.length,
          sucesso: successCount,
          duplicados_ignorados: ignoredList.length,
          erros: errorCount
        });

      } else if (importType === 'PROCESSOS') {
        const { processos } = data as any;
        setProgress(5);

        // Buscar processos já existentes no Firestore
        const processosSnap = await getDocs(collection(db, 'processos'));
        const existingProcessosSet = new Set<string>();
        processosSnap.forEach(d => {
          const item = d.data();
          const p = item.numeroProcesso || item.numero;
          if (p) {
            existingProcessosSet.add(String(p).trim().toLowerCase());
          }
        });

        const toImport: any[] = [];
        const ignoredList: string[] = [];
        const errorList: string[] = [];

        processos.forEach((item: any) => {
          if (existingProcessosSet.has(item.numeroProcesso.toLowerCase())) {
            ignoredList.push(`Processo Nº ${item.numeroProcesso}: Já cadastrado no banco de dados.`);
          } else {
            toImport.push(item);
          }
        });

        let successCount = 0;
        let errorCount = 0;

        if (toImport.length > 0) {
          const batchSize = 100;
          let localProcessed = 0;
          for (let i = 0; i < toImport.length; i += batchSize) {
            if (stopRequested) break;
            const batch = writeBatch(db);
            const chunk = toImport.slice(i, i + batchSize);

            chunk.forEach(item => {
              const deterministicId = `processo_${item.numeroProcesso}_${item.ano}_${String(item.profissional || '').substring(0, 5)}`.replace(/[\/\.\s]/g, '-');
              const docRef = doc(db, 'processos', deterministicId);
              batch.set(docRef, item, { merge: true });
            });

            try {
              await batch.commit();
              successCount += chunk.length;
            } catch (err: any) {
              console.error('Erro ao salvar lote de processos:', err);
              errorCount += chunk.length;
              errorList.push(`Falha de processamento no lote ${Math.floor(i / batchSize) + 1}: ${err.message || err}`);
            }

            localProcessed += chunk.length;
            setProgress(5 + (localProcessed / toImport.length) * 95);
          }
        }

        setImportSummary({
          successCount,
          ignoredCount: ignoredList.length,
          ignoredDetails: ignoredList,
          errorCount,
          errorDetails: errorList
        });

        await logAuditoria('IMPORTACAO', 'PROCESSOS', 'Múltiplos', { 
          total: processos.length,
          sucesso: successCount,
          duplicados_ignorados: ignoredList.length,
          erros: errorCount
        });
      } else {
        const { debitos, notifications, negotiations } = data as any;
        totalItems = debitos.length + notifications.length + negotiations.length;
        await performImport(debitos, 'debits');
        await performImport(notifications, 'notifications');
        await performImport(negotiations, 'negotiations');
        
        await logAuditoria('IMPORTACAO', 'BASE_COMPLETA', 'Múltiplos', { 
          debitos: debitos.length, 
          notifications: notifications.length, 
          negotiations: negotiations.length 
        });

        setImportSummary({
          successCount: debitos.length + notifications.length + negotiations.length,
          ignoredCount: 0,
          ignoredDetails: [],
          errorCount: 0,
          errorDetails: []
        });
      }
    } catch (err: any) {
      console.error(err);
      setError('Houve um erro durante a importação. Alguns registros podem não ter sido importados.');
    }

    setStatus('finished');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 md:p-10 rounded-3xl border border-slate-200 shadow-sm gap-6 border-l-8 border-crb-blue">
        <div>
          <h2 className="text-2xl md:text-4xl font-serif font-bold text-crb-navy">Carga de Dados</h2>
          <p className="text-sm md:text-base text-slate-500 font-medium">Sincronização de planilhas operacionais com o Banco de Dados CRB-4.</p>
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto items-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Planilha</label>
            <select 
              value={importType}
              onChange={(e) => setImportType(e.target.value as any)}
              disabled={status !== 'idle'}
              className="bg-white border-2 border-slate-100 px-4 py-3 rounded-2xl outline-none focus:border-crb-blue font-bold text-crb-navy text-sm transition-all"
            >
              <option value="BASE_FINANCEIRA">Débitos / Notificações / Negociações</option>
              <option value="OFICIOS">Ofícios</option>
              <option value="PROCESSOS">Processos</option>
            </select>
          </div>
          <button 
            onClick={limparBaseCompleta}
            disabled={isCleaning}
            className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-red-50 text-red-600 px-6 md:px-8 py-3.5 rounded-2xl hover:bg-red-600 hover:text-white transition-all font-bold border border-red-100 shadow-lg shadow-red-100/50 text-xs md:text-sm tracking-wide disabled:opacity-50 mt-5"
          >
            {isCleaning ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : <AlertCircle size={20} />}
            Limpar Base [Teste]
          </button>
          <label className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-crb-navy text-white px-6 md:px-8 py-3.5 rounded-2xl hover:bg-crb-navy-dark transition-all cursor-pointer font-bold shadow-lg shadow-crb-navy/20 text-xs md:text-sm tracking-wide group mt-5">
            <Upload size={20} className="group-hover:rotate-12 transition-transform text-crb-blue" />
            Carregar Arquivo
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {status === 'preview' && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="bg-crb-navy p-10 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-crb-purple/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-crb-purple shadow-inner border border-white/5 shrink-0">
                <FileDown size={32} />
              </div>
              <div className="text-white flex-1">
                {importType === 'OFICIOS' ? (
                  <>
                    <p className="text-2xl font-serif font-bold">{(data as any).oficios?.length || 0} Ofícios Identificados</p>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-2">Correspondências prontas para integração.</p>
                  </>
                ) : importType === 'PROCESSOS' ? (
                  <>
                    <p className="text-2xl font-serif font-bold">{(data as any).processos?.length || 0} Processos Identificados</p>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-2">Registros prontos para integração.</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-serif font-bold">{(data as any).debitos?.length || 0} Registros Identificados</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/80 font-bold uppercase tracking-widest border border-white/5">{(data as any).notifications?.length || 0} Notificações</span>
                      <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/80 font-bold uppercase tracking-widest border border-white/5">{(data as any).negotiations?.length || 0} Negociações</span>
                    </div>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-2">Dados normalizados e prontos para processamento.</p>
                  </>
                )}
              </div>
            </div>
            <button 
              onClick={startImport}
              className="px-10 py-4 bg-crb-purple text-white rounded-2xl font-bold hover:bg-white hover:text-crb-purple hover:scale-105 shadow-xl transition-all flex items-center gap-3 relative z-10 uppercase tracking-widest text-xs shrink-0"
            >
              <Play size={18} fill="currentColor" />
              Executar Carga
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden max-h-[500px]">
             <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-sm font-bold text-crb-navy uppercase tracking-widest">
                  {importType === 'OFICIOS' ? 'Prévia de Ofícios' : importType === 'PROCESSOS' ? 'Prévia de Processos' : 'Amostra da Importação (Débitos)'}
                </span>
                <span className="text-xs text-slate-400 font-bold uppercase">Visualização dos dados processados</span>
             </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-crb-navy-dark">
                  {importType === 'OFICIOS' ? (
                    <>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Número</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Assunto</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Destinatário</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Data</th>
                    </>
                  ) : importType === 'PROCESSOS' ? (
                    <>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Processo</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Profissional</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Solicitação</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Registro CRB</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Proprietário/Entidade</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Exercício</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Valor Histórico</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importType === 'OFICIOS' ? (
                  (data as any).oficios?.slice(0, 10).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-crb-navy">{item.numeroOficio}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-bold uppercase truncate max-w-[200px]">{item.assunto}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-400 truncate max-w-[150px]">{item.destinatario}</td>
                      <td className="px-6 py-4 text-sm font-serif font-bold text-crb-navy">{item.dataEnvio?.split('T')[0] || '---'}</td>
                    </tr>
                  ))
                ) : importType === 'PROCESSOS' ? (
                  (data as any).processos?.slice(0, 10).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-crb-navy">{item.numeroProcesso}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-bold uppercase truncate max-w-[200px]">{item.profissional}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-400 truncate max-w-[150px]">{item.solicitacao}</td>
                      <td className="px-6 py-4 text-sm font-serif font-bold text-crb-navy">{item.status}</td>
                    </tr>
                  ))
                ) : (
                  (data as any).debitos?.slice(0, 10).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-crb-navy">{item.crb}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-bold uppercase truncate max-w-[200px]">{item.nome}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-400">{item.ano}</td>
                      <td className="px-6 py-4 text-sm font-serif font-bold text-crb-navy">R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))
                )}
                
                {importType === 'OFICIOS' && (data as any).oficios?.length > 10 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-slate-400 bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest">
                      Existem mais {(data as any).oficios.length - 10} registros de ofícios nesta carga
                    </td>
                  </tr>
                )}
                {importType === 'PROCESSOS' && (data as any).processos?.length > 10 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-slate-400 bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest">
                      Existem mais {(data as any).processos.length - 10} registros de processos nesta carga
                    </td>
                  </tr>
                )}
                {importType === 'BASE_FINANCEIRA' && (data as any).debitos?.length > 10 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-slate-400 bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest">
                      Existem mais {(data as any).debitos.length - 10} registros de débitos nesta carga
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {status === 'importing' && (
        <div className="bg-white p-16 rounded-3xl border border-slate-200 shadow-2xl text-center space-y-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${progress}%` }}
               className="h-full bg-crb-purple shadow-[0_0_20px_rgba(124,58,237,0.5)]"
             />
          </div>
          <div className="w-24 h-24 bg-slate-50 text-crb-navy rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-slate-100 rotate-6 animate-pulse">
            <Database size={48} className="text-crb-purple" />
          </div>
          <div className="space-y-3">
            <h3 className="text-3xl font-serif font-bold text-crb-navy">Sincronizando Base Operacional</h3>
            <p className="text-slate-500 font-medium max-w-md mx-auto">Processando o lote de dados. Por favor, aguarde a conclusão do envio e não feche esta janela.</p>
          </div>
          
          <div className="max-w-md mx-auto space-y-4">
            <div className="h-6 w-full bg-slate-100 rounded-2xl overflow-hidden shadow-inner p-1">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-crb-navy rounded-xl shadow-lg"
              />
            </div>
            <p className="text-sm font-bold text-crb-navy uppercase tracking-[0.3em]">{Math.round(progress)}% Concluído</p>
          </div>

          <button 
            onClick={() => setStopRequested(true)}
            className="flex items-center gap-3 bg-red-50 text-red-600 px-8 py-3 rounded-xl mx-auto hover:bg-red-100 transition-all font-bold text-xs uppercase tracking-widest border border-red-100"
          >
            <Square size={16} fill="currentColor" />
            Interromper Processo
          </button>
        </div>
      )}

      {status === 'finished' && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-10 md:p-16 rounded-3xl border border-slate-200 shadow-2xl text-center space-y-10 border-t-8 border-emerald-500">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
            <CheckCircle2 size={48} />
          </div>
          
          <div className="space-y-3">
            <h3 className="text-3xl font-serif font-bold text-crb-navy text-balance font-sans">Operação de Carga Concluída!</h3>
            <p className="text-slate-500 font-medium text-base max-w-lg mx-auto leading-relaxed">
              O processamento do arquivo de carga foi finalizado. Confira abaixo o detalhamento dos resultados.
            </p>
          </div>

          {importSummary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-emerald-700 uppercase tracking-widest block mb-1">Importados</span>
                  <span className="text-4xl font-serif font-bold text-emerald-800">{importSummary.successCount}</span>
                </div>
                <p className="text-xs text-emerald-600/80 font-medium mt-3">Registros adicionados ou mesclados.</p>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-amber-700 uppercase tracking-widest block mb-1">Ignorados</span>
                  <span className="text-4xl font-serif font-bold text-amber-800">{importSummary.ignoredCount}</span>
                </div>
                <p className="text-xs text-amber-600/80 font-medium mt-3">Duplicações ou formatações ignoradas.</p>
              </div>

              <div className="bg-red-50 border border-red-100 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-red-700 uppercase tracking-widest block mb-1">Erros</span>
                  <span className="text-4xl font-serif font-bold text-red-800">{importSummary.errorCount}</span>
                </div>
                <p className="text-xs text-red-600/80 font-medium mt-3">Falhas impedindo a gravação de dados.</p>
              </div>
            </div>
          )}

          {importSummary && importSummary.ignoredDetails && importSummary.ignoredDetails.length > 0 && (
            <div className="max-w-4xl mx-auto border border-slate-200 rounded-2xl overflow-hidden text-left bg-slate-50">
              <div className="px-6 py-4 bg-slate-100 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {importType === 'OFICIOS' ? 'Registros de Ofícios Duplicados ou Ignorados' : importType === 'PROCESSOS' ? 'Registros de Processos Duplicados ou Ignorados' : 'Registros Duplicados ou Ignorados'} ({importSummary.ignoredCount})
                </span>
              </div>
              <div className="p-4 max-h-48 overflow-y-auto divide-y divide-slate-100 font-mono text-[11px] text-slate-500">
                {importSummary.ignoredDetails.map((det, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between">
                    <span>{det}</span>
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans font-bold uppercase tracking-widest shrink-0 ml-4">Ignorado</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importSummary && importSummary.errorDetails && importSummary.errorDetails.length > 0 && (
            <div className="max-w-4xl mx-auto border border-red-200 rounded-2xl overflow-hidden text-left bg-red-50/50">
              <div className="px-6 py-4 bg-red-100/50 border-b border-red-200">
                <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Erros de Gravação ({importSummary.errorCount})</span>
              </div>
              <div className="p-4 max-h-48 overflow-y-auto divide-y divide-red-100 font-mono text-[11px] text-red-600">
                {importSummary.errorDetails.map((det, idx) => (
                  <div key={idx} className="py-2">
                    {det}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4">
            <button 
              onClick={() => {
                setStatus('idle');
                setImportSummary(null);
                setData([]);
              }}
              className="px-12 py-4 bg-crb-navy text-white rounded-2xl font-bold hover:bg-crb-navy-dark transition-all shadow-xl shadow-crb-navy/20 uppercase tracking-widest text-xs"
            >
              Finalizar Operação
            </button>
          </div>
        </motion.div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-red-50 border border-red-200 p-8 rounded-3xl flex items-start gap-6 shadow-sm">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
             <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-xl font-serif font-bold text-red-900 mb-1">Inconsistência Identificada</p>
            <p className="text-red-700 font-medium leading-relaxed">{error}</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
