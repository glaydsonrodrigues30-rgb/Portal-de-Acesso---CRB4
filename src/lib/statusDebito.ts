/**
 * ============================================================================
 * MOTOR ÚNICO DE STATUS, PRAZOS E FASES DE DÉBITOS DO CRB-4
 * ============================================================================
 * 
 * Regras Institucionais e Regulamentares de Derivação de Status:
 * 
 * 1. AGUARDANDO NOTIFICAÇÃO:
 *    - Início do Estágio: Data de vencimento real do débito (`debito.dataVencimento`).
 *      NUNCA utiliza data da carga nem data atual. Se não houver vencimento real, exibe "-" e não calcula atraso.
 *    - Prazos:
 *      * Se Vencimento < Hoje: Prazo VENCIDO (dias de atraso decorridos desde o vencimento).
 *      * Se Vencimento >= Hoje: Prazo EM PRAZO (dias restantes até o vencimento).
 *    - Situação: NUNCA pode ser "INADIMPLENTE - SEM RESPOSTA" (pois o devedor ainda não recebeu
 *      notificação oficial). Assume "DÉBITO VENCIDO - AGUARDANDO NOTIFICAÇÃO" ou "A VENCER".
 *    - Ação Recomendada: "Notificar Devedor".
 * 
 * 2. NOTIFICAÇÃO:
 *    - Início do Estágio: Data real do evento de notificação (`debito.dataNotificacao`).
 *      Sem data real do evento, exibe "-" e não calcula atraso.
 *    - Prazo Regulamentar: 30 dias corridos para impugnação, defesa ou quitação.
 *      * Dentro dos 30 dias: Prazo EM PRAZO (dias restantes). Situação: "NOTIFICADO - NO PRAZO DE DEFESA (30 DIAS)".
 *      * Após os 30 dias: Prazo VENCIDO (dias de atraso). Situação: "NOTIFICADO - PRAZO ESGOTADO (SEM RESPOSTA)".
 *    - Ação Recomendada: Se em prazo: "Aguardar Prazo de Defesa"; se vencido: "Enviar para Protesto".
 * 
 * 3. PROTESTO:
 *    - Início do Estágio: Data real do envio a cartório (`debito.dataProtesto`).
 *      Sem data real do evento, exibe "-" e não calcula atraso.
 *    - Prazo Regulamentar: 180 dias de permanência cartorária.
 *      * Dentro dos 180 dias: Prazo EM PRAZO (dias restantes). Situação: "EM PROTESTO CARTORÁRIO".
 *      * Após os 180 dias: Prazo VENCIDO (dias de atraso). Situação: "PROTESTO ESGOTADO - SEM QUITAÇÃO".
 *    - Ação Recomendada: Se em prazo: "Aguardar Prazo do Cartório (180 dias)"; se vencido: "Comunicar Inscrição CADIN".
 * 
 * 4. COMUNICAÇÃO CADIN:
 *    - Início do Estágio: Data real da comunicação formal (`debito.dataComunicacaoCadin`).
 *      Sem data real do evento, exibe "-" e não calcula atraso.
 *    - Prazo Regulamentar: 75 dias de aviso prévio obrigatório por lei.
 *      * Dentro dos 75 dias: Prazo EM PRAZO (dias restantes). Situação: "COMUNICADO - AGUARDANDO PRAZO CADIN (75 DIAS)".
 *    - Ação Recomendada: "Aguardar Prazo de 75 dias".
 * 
 * 5. AGUARDANDO INCLUSÃO CADIN:
 *    - Início do Estágio: Data exata do término dos 75 dias de comunicação prévia.
 *    - Prazo: VENCIDO (o prazo concedido ao devedor encerrou-se sem pagamento).
 *      Dias em atraso: contados desde o término dos 75 dias até hoje.
 *    - Situação: "PRAZO CADIN ESGOTADO - PENDENTE DE REGISTRO".
 *    - Ação Recomendada: "Incluir no CADIN".
 *    (Regra unificada que sana a inconsistência de débitos antigos que constavam EM PRAZO na lista e CRÍTICOS no painel).
 * 
 * 6. CADIN:
 *    - Início do Estágio: Data real de inclusão no CADIN (`debito.dataCadin`).
 *    - Prazo: CONCLUÍDO / EM PRAZO (registro efetivado no órgão).
 *    - Situação: "INSCRITO NO CADIN".
 *    - Ação Recomendada: "Acompanhar Inscrição CADIN".
 * 
 * 7. REGULARIZAÇÃO / PAGAMENTO / NEGOCIAÇÃO:
 *    - Débito Pago: Prazo CONCLUÍDO. Situação: "PAGO / REGULARIZADO". Ação: "Débito Quitado".
 *    - Em Negociação: Prazo EM PRAZO. Situação: "EM NEGOCIAÇÃO / PARCELAMENTO". Ação: "Acompanhar Parcelamento".
 *    - Cancelado: Prazo CONCLUÍDO. Situação: "CANCELADO".
 * ============================================================================
 */

import { Debito, Notificacao } from '../types';

export type FaseDebito =
  | 'Aguardando Notificação'
  | 'Notificação'
  | 'Protesto'
  | 'Comunicação CADIN'
  | 'Aguardando inclusão CADIN'
  | 'CADIN';

export type StatusPrazo = 'EM PRAZO' | 'VENCIDO' | 'CONCLUÍDO';

export type AcaoTipo = 'notificar' | 'protesto' | 'comunicar' | 'incluir' | 'aguardar' | 'nenhuma';

export interface StatusDebitoInfo {
  fase: FaseDebito;
  prazo: StatusPrazo;
  dias: number; // Dias restantes se EM PRAZO, dias de atraso se VENCIDO, ou 0
  temDataReal: boolean;
  dataInicioRaw: string | null;
  dataInicioFormatada: string; // "DD/MM/YYYY" ou "-"
  prazoFinalRaw: string | null;
  prazoFinalFormatado: string; // "DD/MM/YYYY" ou "-"
  acaoRecomendada: string;
  acaoTipo: AcaoTipo;
  situacao: string;
  isCritico: boolean;
  isPago: boolean;
  isNegociacao: boolean;
  // Propriedades retrocompatíveis com FlowControl
  faseAtual: FaseDebito;
  dataInicioFase: string | null;
  prazoFinal: string | null;
  status: 'Em prazo' | 'Vencido' | 'Concluído';
  diasRestantes: number;
  atrasoDias: number;
}

/**
 * Converte qualquer entrada de data (Date, timestamp, YYYY-MM-DD, DD/MM/YYYY)
 * em um objeto Date normalizado (00:00:00 UTC/local).
 * Retorna null se data for inválida, vazia ou sentinela.
 */
export function parseDateSafely(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) {
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(d).trim();
  if (!s || s === '-' || s === 'null' || s === 'undefined' || s === 'S/A' || s === 'Invalid Date') {
    return null;
  }

  // Formato brasileiro DD/MM/YYYY ou DD-MM-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s)) {
    const sep = s.includes('/') ? '/' : '-';
    const parts = s.split(sep);
    const dia = parseInt(parts[0], 10);
    const mes = parseInt(parts[1], 10);
    let ano = parseInt(parts[2], 10);
    if (ano < 100) ano = 2000 + ano;
    const date = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }

  // Formato ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [ano, mes, dia] = s.substring(0, 10).split('-').map(Number);
    const date = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

/**
 * Formata um objeto Date para DD/MM/YYYY. Retorna '-' se nulo.
 */
export function formatDateBR(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return '-';
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata um objeto Date para YYYY-MM-DD. Retorna null se inválido.
 */
export function formatDateISO(date: Date | null): string | null {
  if (!date || isNaN(date.getTime())) return null;
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${ano}-${mes}-${dia}`;
}

/**
 * Adiciona N dias inteiros a uma data.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Calcula diferença em dias inteiros entre duas datas (d1 - d2).
 */
function diffDays(d1: Date, d2: Date): number {
  const ms1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const ms2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((ms1 - ms2) / (1000 * 60 * 60 * 24));
}

/**
 * Retorna o início real do estágio de um débito.
 * Em 'Aguardando Notificação' retorna o vencimento do débito.
 * Nas demais fases retorna a data do evento registrado.
 * Sem data real registrada, retorna null (formatado como '-').
 */
export function getEstagioInicio(
  debito: Debito,
  notifications: Notificacao[] = []
): { data: Date | null; dataFormatada: string; label: string } {
  const matchingNotif = notifications.find(
    n => n.debitoId === debito.id || (n.debitosIds && n.debitosIds.includes(debito.id))
  );

  const hasCadin = !!(debito.cadinIncluido || debito.dataCadin);
  const hasCadinComunicado = !!(debito.cadinComunicado || debito.dataComunicacaoCadin);
  const hasProtesto = !!(debito.protestoEnviado || debito.dataProtesto);
  const hasNotif = !!(debito.notificacaoEnviada || debito.dataNotificacao || matchingNotif);

  if (hasCadin) {
    const d = parseDateSafely(debito.dataCadin);
    return { data: d, dataFormatada: formatDateBR(d), label: 'Inclusão CADIN' };
  }

  if (hasCadinComunicado) {
    const d = parseDateSafely(debito.dataComunicacaoCadin);
    if (!d) {
      return { data: null, dataFormatada: '-', label: 'Comunicação CADIN' };
    }
    const end75 = addDays(d, 75);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today > end75) {
      return { data: end75, dataFormatada: formatDateBR(end75), label: 'Fim do Prazo 75d' };
    }
    return { data: d, dataFormatada: formatDateBR(d), label: 'Comunicação CADIN' };
  }

  if (hasProtesto) {
    const d = parseDateSafely(debito.dataProtesto);
    return { data: d, dataFormatada: formatDateBR(d), label: 'Envio a Cartório' };
  }

  if (hasNotif) {
    const raw = debito.dataNotificacao || (matchingNotif ? (matchingNotif.dataNotificacao || matchingNotif.createdAt) : null);
    const d = parseDateSafely(raw);
    return { data: d, dataFormatada: formatDateBR(d), label: 'Notificação' };
  }

  // Fase Aguardando Notificação: usa o vencimento do débito
  const vDate = parseDateSafely(debito.dataVencimento);
  return { data: vDate, dataFormatada: formatDateBR(vDate), label: 'Vencimento' };
}

/**
 * Função central e única do sistema para determinação de:
 * - Fase atual do fluxo
 * - Prazo regulamentar (EM PRAZO, VENCIDO, CONCLUÍDO) e quantidade de dias
 * - Ação recomendada operacional
 * - Situação cadastral e jurídica derivada
 * - Datas auditáveis de início e limite da etapa
 */
export function getStatusDebito(
  debito: Debito,
  notifications: Notificacao[] = []
): StatusDebitoInfo {
  const isPago = ['pago', 'regularizado', 'concluido', 'concluído'].includes(
    String(debito.statusGeral || '').trim().toLowerCase()
  );
  const isNegociacao = String(debito.statusGeral || '').trim().toLowerCase() === 'em negociação' ||
    Boolean(debito.negociacao && debito.negociacao.ativo !== false);
  const isCancelado = String(debito.statusGeral || '').trim().toLowerCase() === 'cancelado';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Tratativa prioritária de débitos quitados, cancelados ou renegociados
  if (isPago) {
    return {
      fase: 'Aguardando Notificação',
      prazo: 'CONCLUÍDO',
      dias: 0,
      temDataReal: true,
      dataInicioRaw: debito.pagamento?.data || null,
      dataInicioFormatada: debito.pagamento?.data ? formatDateBR(parseDateSafely(debito.pagamento.data)) : '-',
      prazoFinalRaw: null,
      prazoFinalFormatado: '-',
      acaoRecomendada: 'Débito Quitado',
      acaoTipo: 'nenhuma',
      situacao: 'PAGO / REGULARIZADO',
      isCritico: false,
      isPago: true,
      isNegociacao: false,
      faseAtual: 'Aguardando Notificação',
      dataInicioFase: debito.pagamento?.data || null,
      prazoFinal: null,
      status: 'Concluído',
      diasRestantes: 0,
      atrasoDias: 0,
    };
  }

  if (isCancelado) {
    return {
      fase: 'Aguardando Notificação',
      prazo: 'CONCLUÍDO',
      dias: 0,
      temDataReal: false,
      dataInicioRaw: null,
      dataInicioFormatada: '-',
      prazoFinalRaw: null,
      prazoFinalFormatado: '-',
      acaoRecomendada: 'Nenhuma Ação',
      acaoTipo: 'nenhuma',
      situacao: 'CANCELADO',
      isCritico: false,
      isPago: false,
      isNegociacao: false,
      faseAtual: 'Aguardando Notificação',
      dataInicioFase: null,
      prazoFinal: null,
      status: 'Concluído',
      diasRestantes: 0,
      atrasoDias: 0,
    };
  }

  // Resolução de dados de notificação vinculada
  const matchingNotif = notifications.find(
    n => n.debitoId === debito.id || (n.debitosIds && n.debitosIds.includes(debito.id))
  );

  const hasCadin = !!(debito.cadinIncluido || debito.dataCadin);
  const hasCadinComunicado = !!(debito.cadinComunicado || debito.dataComunicacaoCadin);
  const hasProtesto = !!(debito.protestoEnviado || debito.dataProtesto);
  const hasNotif = !!(debito.notificacaoEnviada || debito.dataNotificacao || matchingNotif);

  // 1. FASE CADIN (Inclusão efetivada)
  if (hasCadin) {
    const dataReal = parseDateSafely(debito.dataCadin);
    const temData = dataReal !== null;
    const dataFormatada = formatDateBR(dataReal);
    const dataISO = formatDateISO(dataReal);

    return {
      fase: 'CADIN',
      prazo: 'EM PRAZO',
      dias: 0,
      temDataReal: temData,
      dataInicioRaw: dataISO,
      dataInicioFormatada: dataFormatada,
      prazoFinalRaw: null,
      prazoFinalFormatado: '-',
      acaoRecomendada: 'Acompanhar Inscrição CADIN',
      acaoTipo: 'aguardar',
      situacao: isNegociacao ? 'EM NEGOCIAÇÃO / CADIN' : 'INSCRITO NO CADIN',
      isCritico: false,
      isPago: false,
      isNegociacao,
      faseAtual: 'CADIN',
      dataInicioFase: dataISO,
      prazoFinal: null,
      status: 'Em prazo',
      diasRestantes: 0,
      atrasoDias: 0,
    };
  }

  // 2 & 3. FASE COMUNICAÇÃO CADIN / AGUARDANDO INCLUSÃO CADIN
  if (hasCadinComunicado) {
    const dataReal = parseDateSafely(debito.dataComunicacaoCadin);

    // Sem data real do evento: exibe traço e NÃO calcula atraso artificial
    if (!dataReal) {
      return {
        fase: 'Comunicação CADIN',
        prazo: 'EM PRAZO',
        dias: 0,
        temDataReal: false,
        dataInicioRaw: null,
        dataInicioFormatada: '-',
        prazoFinalRaw: null,
        prazoFinalFormatado: '-',
        acaoRecomendada: 'Aguardar Prazo de 75 dias',
        acaoTipo: 'aguardar',
        situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'COMUNICAÇÃO CADIN REGISTRADA (SEM DATA)',
        isCritico: false,
        isPago: false,
        isNegociacao,
        faseAtual: 'Comunicação CADIN',
        dataInicioFase: null,
        prazoFinal: null,
        status: 'Em prazo',
        diasRestantes: 0,
        atrasoDias: 0,
      };
    }

    const prazoFinal75 = addDays(dataReal, 75);
    const dataInicioISO = formatDateISO(dataReal);
    const prazoFinalISO = formatDateISO(prazoFinal75);

    // Se hoje ainda está dentro dos 75 dias de comunicação
    if (today <= prazoFinal75) {
      const diasRest = diffDays(prazoFinal75, today);
      return {
        fase: 'Comunicação CADIN',
        prazo: 'EM PRAZO',
        dias: diasRest,
        temDataReal: true,
        dataInicioRaw: dataInicioISO,
        dataInicioFormatada: formatDateBR(dataReal),
        prazoFinalRaw: prazoFinalISO,
        prazoFinalFormatado: formatDateBR(prazoFinal75),
        acaoRecomendada: 'Aguardar Prazo de 75 dias',
        acaoTipo: 'aguardar',
        situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'COMUNICADO - AGUARDANDO PRAZO CADIN (75 DIAS)',
        isCritico: false,
        isPago: false,
        isNegociacao,
        faseAtual: 'Comunicação CADIN',
        dataInicioFase: dataInicioISO,
        prazoFinal: prazoFinalISO,
        status: 'Em prazo',
        diasRestantes: diasRest,
        atrasoDias: 0,
      };
    }

    // Se já ultrapassou os 75 dias: o prazo concedido para pagar esgotou-se.
    // É Aguardando inclusão CADIN e o status é VENCIDO com providência imediata!
    const diasAtraso = diffDays(today, prazoFinal75);
    return {
      fase: 'Aguardando inclusão CADIN',
      prazo: 'VENCIDO',
      dias: diasAtraso,
      temDataReal: true,
      dataInicioRaw: prazoFinalISO,
      dataInicioFormatada: formatDateBR(prazoFinal75),
      prazoFinalRaw: prazoFinalISO,
      prazoFinalFormatado: formatDateBR(prazoFinal75),
      acaoRecomendada: 'Incluir no CADIN',
      acaoTipo: 'incluir',
      situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'PRAZO CADIN ESGOTADO - PENDENTE DE REGISTRO',
      isCritico: true,
      isPago: false,
      isNegociacao,
      faseAtual: 'Aguardando inclusão CADIN',
      dataInicioFase: prazoFinalISO,
      prazoFinal: prazoFinalISO,
      status: 'Vencido',
      diasRestantes: 0,
      atrasoDias: diasAtraso,
    };
  }

  // 4. FASE PROTESTO
  if (hasProtesto) {
    const dataReal = parseDateSafely(debito.dataProtesto);

    if (!dataReal) {
      return {
        fase: 'Protesto',
        prazo: 'EM PRAZO',
        dias: 0,
        temDataReal: false,
        dataInicioRaw: null,
        dataInicioFormatada: '-',
        prazoFinalRaw: null,
        prazoFinalFormatado: '-',
        acaoRecomendada: 'Aguardar Cartório (180 dias)',
        acaoTipo: 'aguardar',
        situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'EM PROTESTO (SEM DATA DO EVENTO)',
        isCritico: false,
        isPago: false,
        isNegociacao,
        faseAtual: 'Protesto',
        dataInicioFase: null,
        prazoFinal: null,
        status: 'Em prazo',
        diasRestantes: 0,
        atrasoDias: 0,
      };
    }

    const prazoFinal180 = addDays(dataReal, 180);
    const dataInicioISO = formatDateISO(dataReal);
    const prazoFinalISO = formatDateISO(prazoFinal180);

    if (today <= prazoFinal180) {
      const diasRest = diffDays(prazoFinal180, today);
      return {
        fase: 'Protesto',
        prazo: 'EM PRAZO',
        dias: diasRest,
        temDataReal: true,
        dataInicioRaw: dataInicioISO,
        dataInicioFormatada: formatDateBR(dataReal),
        prazoFinalRaw: prazoFinalISO,
        prazoFinalFormatado: formatDateBR(prazoFinal180),
        acaoRecomendada: 'Aguardar Prazo do Cartório (180 dias)',
        acaoTipo: 'aguardar',
        situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'EM CARTÓRIO - AGUARDANDO PROTESTO',
        isCritico: false,
        isPago: false,
        isNegociacao,
        faseAtual: 'Protesto',
        dataInicioFase: dataInicioISO,
        prazoFinal: prazoFinalISO,
        status: 'Em prazo',
        diasRestantes: diasRest,
        atrasoDias: 0,
      };
    }

    const diasAtraso = diffDays(today, prazoFinal180);
    return {
      fase: 'Protesto',
      prazo: 'VENCIDO',
      dias: diasAtraso,
      temDataReal: true,
      dataInicioRaw: dataInicioISO,
      dataInicioFormatada: formatDateBR(dataReal),
      prazoFinalRaw: prazoFinalISO,
      prazoFinalFormatado: formatDateBR(prazoFinal180),
      acaoRecomendada: 'Comunicar Inscrição CADIN',
      acaoTipo: 'comunicar',
      situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'PROTESTADO - PRAZO CARTORÁRIO ESGOTADO',
      isCritico: true,
      isPago: false,
      isNegociacao,
      faseAtual: 'Protesto',
      dataInicioFase: dataInicioISO,
      prazoFinal: prazoFinalISO,
      status: 'Vencido',
      diasRestantes: 0,
      atrasoDias: diasAtraso,
    };
  }

  // 5. FASE NOTIFICAÇÃO
  if (hasNotif) {
    const rawNotif = debito.dataNotificacao || (matchingNotif ? (matchingNotif.dataNotificacao || matchingNotif.createdAt) : null);
    const dataReal = parseDateSafely(rawNotif);

    if (!dataReal) {
      // Sem data real: exibe traço e não calcula atraso artificial (NUNCA usa hoje nem data da carga)
      return {
        fase: 'Notificação',
        prazo: 'EM PRAZO',
        dias: 0,
        temDataReal: false,
        dataInicioRaw: null,
        dataInicioFormatada: '-',
        prazoFinalRaw: null,
        prazoFinalFormatado: '-',
        acaoRecomendada: 'Aguardar Notificação / Registrar Data',
        acaoTipo: 'aguardar',
        situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'NOTIFICADO - DATA NÃO REGISTRADA',
        isCritico: false,
        isPago: false,
        isNegociacao,
        faseAtual: 'Notificação',
        dataInicioFase: null,
        prazoFinal: null,
        status: 'Em prazo',
        diasRestantes: 0,
        atrasoDias: 0,
      };
    }

    const prazoFinal30 = addDays(dataReal, 30);
    const dataInicioISO = formatDateISO(dataReal);
    const prazoFinalISO = formatDateISO(prazoFinal30);

    if (today <= prazoFinal30) {
      const diasRest = diffDays(prazoFinal30, today);
      return {
        fase: 'Notificação',
        prazo: 'EM PRAZO',
        dias: diasRest,
        temDataReal: true,
        dataInicioRaw: dataInicioISO,
        dataInicioFormatada: formatDateBR(dataReal),
        prazoFinalRaw: prazoFinalISO,
        prazoFinalFormatado: formatDateBR(prazoFinal30),
        acaoRecomendada: 'Aguardar Prazo de Defesa',
        acaoTipo: 'aguardar',
        situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'NOTIFICADO - NO PRAZO DE DEFESA (30 DIAS)',
        isCritico: false,
        isPago: false,
        isNegociacao,
        faseAtual: 'Notificação',
        dataInicioFase: dataInicioISO,
        prazoFinal: prazoFinalISO,
        status: 'Em prazo',
        diasRestantes: diasRest,
        atrasoDias: 0,
      };
    }

    const diasAtraso = diffDays(today, prazoFinal30);
    return {
      fase: 'Notificação',
      prazo: 'VENCIDO',
      dias: diasAtraso,
      temDataReal: true,
      dataInicioRaw: dataInicioISO,
      dataInicioFormatada: formatDateBR(dataReal),
      prazoFinalRaw: prazoFinalISO,
      prazoFinalFormatado: formatDateBR(prazoFinal30),
      acaoRecomendada: 'Enviar para Protesto',
      acaoTipo: 'protesto',
      situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'NOTIFICADO - PRAZO ESGOTADO (SEM RESPOSTA)',
      isCritico: true,
      isPago: false,
      isNegociacao,
      faseAtual: 'Notificação',
      dataInicioFase: dataInicioISO,
      prazoFinal: prazoFinalISO,
      status: 'Vencido',
      diasRestantes: 0,
      atrasoDias: diasAtraso,
    };
  }

  // 6. FASE AGUARDANDO NOTIFICAÇÃO (Fase Inicial)
  // Regra fundamental: Em Aguardando Notificação, usar o vencimento do débito.
  // NUNCA pode ter situação "INADIMPLENTE - SEM RESPOSTA" porque nenhuma notificação foi emitida.
  const dataVenc = parseDateSafely(debito.dataVencimento);

  if (!dataVenc) {
    // Sem data real de vencimento cadastrada: exibe traço e não calcula atraso
    return {
      fase: 'Aguardando Notificação',
      prazo: 'EM PRAZO',
      dias: 0,
      temDataReal: false,
      dataInicioRaw: null,
      dataInicioFormatada: '-',
      prazoFinalRaw: null,
      prazoFinalFormatado: '-',
      acaoRecomendada: 'Notificar Devedor',
      acaoTipo: 'notificar',
      situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'AGUARDANDO NOTIFICAÇÃO',
      isCritico: false,
      isPago: false,
      isNegociacao,
      faseAtual: 'Aguardando Notificação',
      dataInicioFase: null,
      prazoFinal: null,
      status: 'Em prazo',
      diasRestantes: 0,
      atrasoDias: 0,
    };
  }

  const dataVencISO = formatDateISO(dataVenc);
  const dataVencBR = formatDateBR(dataVenc);

  if (dataVenc < today) {
    // Vencido
    const diasAtraso = diffDays(today, dataVenc);
    return {
      fase: 'Aguardando Notificação',
      prazo: 'VENCIDO',
      dias: diasAtraso,
      temDataReal: true,
      dataInicioRaw: dataVencISO,
      dataInicioFormatada: dataVencBR,
      prazoFinalRaw: dataVencISO,
      prazoFinalFormatado: dataVencBR,
      acaoRecomendada: 'Notificar Devedor',
      acaoTipo: 'notificar',
      situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'DÉBITO VENCIDO - AGUARDANDO NOTIFICAÇÃO',
      isCritico: diasAtraso > 0,
      isPago: false,
      isNegociacao,
      faseAtual: 'Aguardando Notificação',
      dataInicioFase: dataVencISO,
      prazoFinal: dataVencISO,
      status: 'Vencido',
      diasRestantes: 0,
      atrasoDias: diasAtraso,
    };
  }

  // Ainda a vencer
  const diasRest = diffDays(dataVenc, today);
  return {
    fase: 'Aguardando Notificação',
    prazo: 'EM PRAZO',
    dias: diasRest,
    temDataReal: true,
    dataInicioRaw: dataVencISO,
    dataInicioFormatada: dataVencBR,
    prazoFinalRaw: dataVencISO,
    prazoFinalFormatado: dataVencBR,
    acaoRecomendada: 'Aguardar Vencimento',
    acaoTipo: 'aguardar',
    situacao: isNegociacao ? 'EM NEGOCIAÇÃO' : 'A VENCER - AGUARDANDO NOTIFICAÇÃO',
    isCritico: false,
    isPago: false,
    isNegociacao,
    faseAtual: 'Aguardando Notificação',
    dataInicioFase: dataVencISO,
    prazoFinal: dataVencISO,
    status: 'Em prazo',
    diasRestantes: diasRest,
    atrasoDias: 0,
  };
}
