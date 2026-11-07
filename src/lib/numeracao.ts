/**
 * Helper central de numeração automática e normalização para Ofícios e Processos.
 */

/**
 * Extrai o ano numérico de 4 dígitos a partir de string, Date ou número.
 * Caso seja inválido ou ausente, retorna o ano atual.
 */
export function getAnoDe(data: string | Date | number | null | undefined): number {
  const currentYear = new Date().getFullYear();
  if (!data) return currentYear;

  if (typeof data === 'number') {
    if (data >= 1990 && data <= 2099) return data;
    // Pode ser timestamp
    if (data > 100000000000) {
      const d = new Date(data);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
  }

  if (data instanceof Date) {
    return isNaN(data.getTime()) ? currentYear : data.getFullYear();
  }

  const s = String(data).trim();
  if (!s) return currentYear;

  // Formato AAAA-MM-DD ou AAAA/...
  const isoMatch = s.match(/^(\d{4})[-\/]/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    if (y >= 1990 && y <= 2099) return y;
  }

  // Formato DD/MM/AAAA ou DD-MM-AAAA
  const brMatch = s.match(/[-\/](\d{4})(?:$|[^\d])/);
  if (brMatch) {
    const y = parseInt(brMatch[1], 10);
    if (y >= 1990 && y <= 2099) return y;
  }

  // Tenta Date parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    if (y >= 1990 && y <= 2099) return y;
  }

  return currentYear;
}

/**
 * Formata sequência e ano no padrão institucional: NNN-AAAA (mínimo 3 dígitos para o sequencial).
 * Exemplo: (1, 2026) -> "001-2026", (37, 2026) -> "037-2026", (1234, 2026) -> "1234-2026"
 */
export function formatarNumero(seq: number, ano: number): string {
  const safeSeq = Math.max(1, Math.floor(seq || 1));
  const safeAno = Math.floor(ano || new Date().getFullYear());
  const seqStr = String(safeSeq).padStart(3, '0');
  return `${seqStr}-${safeAno}`;
}

export interface SeqAno {
  seq: number;
  ano: number;
}

/**
 * Extrai o sequencial numérico e o ano de strings nos mais variados formatos:
 * "001-2026", "001/2026", "CIRC. 004-2026", "037--2026", "OF. 012/2025", "123-26", etc.
 * NUNCA retorna null: sempre retorna { seq: number, ano: number } com 0 para valores não interpretáveis.
 */
export function extrairSeqAno(
  numero: string | null | undefined,
  dataFallback?: string | Date | number | null
): SeqAno {
  const fallbackAno = dataFallback ? getAnoDe(dataFallback) : 0;
  if (!numero) {
    return { seq: 0, ano: fallbackAno };
  }
  let s = String(numero).trim();
  if (!s) {
    return { seq: 0, ano: fallbackAno };
  }

  // Colapsa múltiplos hífens ou barras
  s = s.replace(/-{2,}/g, '-').replace(/\/{2,}/g, '/');

  // 1. Padrão principal: [prefixo opcional] SEQUENCIAL [- ou /] ANO
  // Ex: "001-2026", "CIRC. 004-2026", "037-2026", "1/2026", "OF. 012/2025", "CIRCULAR 04-2026"
  const matchMain = s.match(/(?:^|[^\d])(\d{1,6})\s*[\/\-]\s*(\d{2,4})(?:$|[^\d])/);
  if (matchMain) {
    const seq = parseInt(matchMain[1], 10);
    let ano = parseInt(matchMain[2], 10);
    if (ano < 100) {
      ano = 2000 + ano;
    }
    if (seq > 0 && ano >= 1990 && ano <= 2099) {
      return { seq, ano };
    }
  }

  // 2. Padrão ano primeiro: ANO [- ou /] SEQUENCIAL (ex: 2026-001, 2026/12)
  const matchYearFirst = s.match(/(?:^|[^\d])(19\d{2}|20\d{2})\s*[\/\-]\s*(\d{1,6})(?:$|[^\d])/);
  if (matchYearFirst) {
    const ano = parseInt(matchYearFirst[1], 10);
    const seq = parseInt(matchYearFirst[2], 10);
    if (seq > 0) {
      return { seq, ano };
    }
  }

  // 3. Apenas sequencial isolado (ex: "037")
  const loneNumber = s.match(/\b(\d+)\b/);
  if (loneNumber) {
    const seq = parseInt(loneNumber[1], 10);
    if (seq > 0) {
      return { seq, ano: fallbackAno };
    }
  }

  return { seq: 0, ano: fallbackAno };
}

/**
 * Obtém o ano representativo do registro com fallback em cascata:
 * 1) Campo ano se já definido e válido
 * 2) Ano extraído do número do documento
 * 3) Ano da data do documento (dataEnvio, dataSolicitacao, etc.)
 */
export function getAnoRegistro(reg: any): number {
  if (!reg) return new Date().getFullYear();
  if (reg.ano && !isNaN(Number(reg.ano))) {
    const y = Number(reg.ano);
    if (y >= 1990 && y <= 2099) return y;
  }
  const num = reg.numero || reg.numeroOficio || reg.numeroProcesso;
  const parsed = extrairSeqAno(num);
  if (parsed.ano >= 1990 && parsed.ano <= 2099) {
    return parsed.ano;
  }
  return getAnoDe(reg.dataEnvio || reg.dataSolicitacao || reg.dataEmissao || reg.dataAbertura || reg.data || reg.createdAt);
}

/**
 * Helper central null-safe para ordenação decrescente por ano e número.
 * Regras:
 * - Registros sem número válido (seq === 0) vão para o fim da lista.
 * - Registros com número válido são ordenados por ano decrescente e sequência decrescente.
 * - Registros sem número válido são ordenados entre si por data mais recente.
 */
export function compararNumeroDesc(a: any, b: any): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const numA = typeof a === 'string' ? a : (a.numero || a.numeroOficio || a.numeroProcesso || '');
  const numB = typeof b === 'string' ? b : (b.numero || b.numeroOficio || b.numeroProcesso || '');

  const dataA = typeof a === 'object' ? (a.dataEnvio || a.dataSolicitacao || a.dataEmissao || a.dataAbertura || a.createdAt) : null;
  const dataB = typeof b === 'object' ? (b.dataEnvio || b.dataSolicitacao || b.dataEmissao || b.dataAbertura || b.createdAt) : null;

  const parsedA = extrairSeqAno(numA, dataA);
  const parsedB = extrairSeqAno(numB, dataB);

  const aValido = parsedA.seq > 0;
  const bValido = parsedB.seq > 0;

  // Sem número válido vai para o fim da lista
  if (aValido && !bValido) return -1;
  if (!aValido && bValido) return 1;
  if (!aValido && !bValido) {
    // Ambos sem número válido: ordena por data mais recente se disponível
    const dtA = dataA ? new Date(dataA).getTime() : 0;
    const dtB = dataB ? new Date(dataB).getTime() : 0;
    if (!isNaN(dtA) && !isNaN(dtB) && dtB !== dtA) {
      return dtB - dtA;
    }
    return 0;
  }

  // Ambos válidos: compara por ano decrescente (ano do número ou fallback da data)
  const anoA = parsedA.ano || (dataA ? getAnoDe(dataA) : 0);
  const anoB = parsedB.ano || (dataB ? getAnoDe(dataB) : 0);

  if (anoB !== anoA) {
    return anoB - anoA;
  }

  // Mesmo ano: compara por sequência decrescente
  return parsedB.seq - parsedA.seq;
}

/**
 * Calcula o próximo número disponível para o ano informado.
 * Filtra apenas os registros pertencentes àquele ano, localiza o maior sequencial e retorna maior + 1.
 * Se não houver nenhum registro no ano, retorna "001-ANO".
 */
export function proximoNumero(
  registros: Array<{
    numero?: string;
    numeroOficio?: string;
    numeroProcesso?: string;
    ano?: number;
    data?: string;
    dataEnvio?: string;
    dataEmissao?: string;
    dataSolicitacao?: string;
    dataAbertura?: string;
    createdAt?: string;
  }>,
  ano: number
): string {
  const targetAno = Math.floor(ano || new Date().getFullYear());
  const seqsDoAno: number[] = [];

  for (const reg of registros || []) {
    const numRaw = reg.numeroOficio || reg.numeroProcesso || reg.numero;
    const parsed = extrairSeqAno(numRaw);

    if (parsed.seq > 0 && parsed.ano === targetAno) {
      seqsDoAno.push(parsed.seq);
    } else {
      // Se não conseguiu extrair ano do número, checa o ano do registro ou da data
      const regAno = getAnoRegistro(reg);
      if (regAno === targetAno) {
        if (parsed.seq > 0) {
          seqsDoAno.push(parsed.seq);
        } else if (numRaw) {
          const digits = String(numRaw).match(/\d+/);
          if (digits) {
            const val = parseInt(digits[0], 10);
            if (val > 0) seqsDoAno.push(val);
          }
        }
      }
    }
  }

  const maxSeq = seqsDoAno.length > 0 ? Math.max(...seqsDoAno) : 0;
  return formatarNumero(maxSeq + 1, targetAno);
}

/**
 * Verifica se um número já existe no mesmo ano entre os registros existentes.
 */
export function existeNumeroNoAno(
  registros: Array<{
    id?: string;
    numero?: string;
    numeroOficio?: string;
    numeroProcesso?: string;
    ano?: number;
    dataEnvio?: string;
    dataSolicitacao?: string;
    dataEmissao?: string;
  }>,
  numero: string,
  ano: number,
  ignoreId?: string
): boolean {
  if (!numero) return false;
  const targetParsed = extrairSeqAno(numero);
  const targetAno = targetParsed.ano || ano;
  const targetSeq = targetParsed.seq;

  const targetClean = String(numero).replace(/\s+/g, '').toLowerCase().replace(/--+/g, '-');

  for (const reg of registros || []) {
    if (ignoreId && reg.id === ignoreId) continue;

    const regNum = reg.numeroOficio || reg.numeroProcesso || reg.numero;
    if (!regNum) continue;

    const regParsed = extrairSeqAno(regNum);
    const regAno = regParsed.ano || reg.ano || getAnoDe(reg.dataEnvio || reg.dataSolicitacao || reg.dataEmissao);

    if (regAno === targetAno) {
      // Comparação por número de sequência no mesmo ano se ambos forem válidos
      if (targetSeq > 0 && regParsed.seq > 0 && targetSeq === regParsed.seq) {
        return true;
      }
      // Comparação por texto limpo
      const regClean = String(regNum).replace(/\s+/g, '').toLowerCase().replace(/--+/g, '-');
      if (targetClean === regClean) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Normaliza variações de Tipos de Solicitação de Processos:
 * "Licença por 02 anos", "Liçença de 2 anos" -> "Licença de 2 anos"
 */
export function normalizarTipoSolicitacao(tipo: string | null | undefined): string {
  if (!tipo) return 'Outros';
  const s = String(tipo).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/licen[cç]a.*(?:2|02)\s*ano/i.test(s) || /licen[cç]a\s*de\s*2\s*ano/i.test(s)) {
    return 'Licença de 2 anos';
  }
  if (/registro\s*definitivo/i.test(s)) {
    return 'Registro Definitivo';
  }
  if (/registro\s*provis[oó]rio/i.test(s)) {
    return 'Registro Provisório';
  }
  if (/cancelamento/i.test(s)) {
    return 'Cancelamento';
  }
  if (/transfer[eê]ncia/i.test(s)) {
    return 'Transferência';
  }
  if (/suspens[aã]o.*licen[cç]a/i.test(s)) {
    return 'Suspensão de Licença';
  }
  if (/renova[cç][aã]o.*licen[cç]a/i.test(s)) {
    return 'Renovação de Licença';
  }
  if (/ad\s*referendum/i.test(s)) {
    return 'Ad Referendum';
  }
  if (/segunda\s*via/i.test(s)) {
    return 'Segunda Via';
  }
  if (/baixa/i.test(s)) {
    return 'Baixa de Responsabilidade Técnica';
  }

  // Devolve o texto limpo com capitalização adequada
  const clean = String(tipo).trim().replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Normaliza status de Processo para categorias consolidadas:
 * "Deferido", "Indeferido", "Aguardando Plenária", "Pendente", "Ad Referendum"
 */
export function normalizarStatusProcesso(status: string | null | undefined): string {
  if (!status) return 'Em Análise';
  const s = String(status).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/deferid[oa]/i.test(s)) return 'Deferido';
  if (/indeferid[oa]/i.test(s)) return 'Indeferido';
  if (/plen[aá]ria/i.test(s)) return 'Aguardando Plenária';
  if (/ad\s*referendum/i.test(s)) return 'Ad Referendum';
  if (/pendente/i.test(s)) return 'Pendente';
  if (/sobrestado/i.test(s)) return 'Sobrestado';
  if (/an[aá]lise/i.test(s)) return 'Em Análise';

  const clean = String(status).trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Normaliza tipo de ofício preservando tipos reais da importação:
 * "Presidente", "Administrativo", "Circular", "Gabinete", "Interno", "Externo"
 */
export function normalizarTipoOficio(tipo: string | null | undefined): string {
  if (!tipo) return 'Circular';
  const s = String(tipo).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/presidente|presid[eê]ncia/i.test(s)) return 'Presidente';
  if (/administrativ[oa]|adm/i.test(s)) return 'Administrativo';
  if (/gabinete/i.test(s)) return 'Gabinete';
  if (/interno|ci/i.test(s)) return 'Interno';
  if (/externo/i.test(s)) return 'Externo';
  if (/circular/i.test(s)) return 'Circular';

  const clean = String(tipo).trim().replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Normaliza assunto de ofício agrupando tópicos principais:
 * Cancelamento, Financeiro, Diversos, Registro, Licença, Notificação, etc.
 */
export function normalizarAssuntoOficio(assunto: string | null | undefined): string {
  if (!assunto) return 'Diversos';
  const s = String(assunto).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/cancelamento/i.test(s)) return 'Cancelamento';
  if (/financeir[oa]|anuidade|d[eé]bito|cobran[cç]a|pagamento/i.test(s)) return 'Financeiro';
  if (/registro/i.test(s)) return 'Registro';
  if (/licen[cç]a/i.test(s)) return 'Licença';
  if (/notifica[cç][aã]o/i.test(s)) return 'Notificação';
  if (/fiscaliza[cç][aã]o/i.test(s)) return 'Fiscalização';
  if (/convoca[cç][aã]o|reuni[aã]o/i.test(s)) return 'Convocação';
  if (/transfer[eê]ncia/i.test(s)) return 'Transferência';
  if (/certid[aã]o/i.test(s)) return 'Certidão';

  const clean = String(assunto).trim().replace(/\s+/g, ' ');
  return clean.length > 25 ? clean.slice(0, 25) + '...' : clean;
}
