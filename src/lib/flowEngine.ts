import { Debito, Notificacao } from '../types';

export interface FlowControl {
  faseAtual: 'Aguardando Notificação' | 'Notificação' | 'Protesto' | 'Comunicação CADIN' | 'Aguardando inclusão CADIN' | 'CADIN';
  dataInicioFase: string | null;
  prazoFinal: string | null;
  status: 'Em prazo' | 'Vencido' | 'Concluído';
  diasRestantes: number;
  atrasoDias: number;
}

export function parseDateSafely(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const s = String(d);
  if (s.includes('/')) {
    const [dia, mes, ano] = s.split('/');
    // Check if parts exist and format properly
    const fullYear = ano.length === 2 ? `20${ano}` : ano;
    return new Date(`${fullYear}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T00:00:00`);
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

export function calculateFlow(debito: Debito, notifications: Notificacao[] = []): FlowControl {
  const isPago = ['pago', 'regularizado', 'concluido', 'concluído'].includes(
    String(debito.statusGeral || '').toLowerCase()
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to format ISO date to display YYYY-MM-DD
  const formatDateString = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // Helper to get day difference
  const decDays = (d1: Date, d2: Date) => {
    const diff = d1.getTime() - d2.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Resolve notification info if any
  const matchingNotif = notifications.find(
    n => n.debitoId === debito.id || (n.debitosIds && n.debitosIds.includes(debito.id))
  );

  const hasNotif = !!(debito.notificacaoEnviada || debito.dataNotificacao || matchingNotif);
  const dataNotifRaw = debito.dataNotificacao || (matchingNotif ? (matchingNotif.dataNotificacao || matchingNotif.createdAt) : null);
  const startNotif = parseDateSafely(dataNotifRaw) || today;

  const hasProtesto = !!(debito.protestoEnviado || debito.dataProtesto);
  const startProtesto = parseDateSafely(debito.dataProtesto) || today;

  const hasCadinComunicado = !!(debito.cadinComunicado || debito.dataComunicacaoCadin);
  const startCadinComunicado = parseDateSafely(debito.dataComunicacaoCadin) || today;

  const hasCadin = !!(debito.cadinIncluido || debito.dataCadin);
  const startCadin = parseDateSafely(debito.dataCadin) || today;

  // Determine current active phase
  let faseAtual: 'Aguardando Notificação' | 'Notificação' | 'Protesto' | 'Comunicação CADIN' | 'Aguardando inclusão CADIN' | 'CADIN' = 'Aguardando Notificação';
  let dataInicioFase: string | null = null;
  let prazoFinal: string | null = null;
  let status: 'Em prazo' | 'Vencido' | 'Concluído' = 'Em prazo';
  let diasRestantes = 0;
  let atrasoDias = 0;

  if (hasCadin) {
    faseAtual = 'CADIN';
    dataInicioFase = formatDateString(startCadin);
    prazoFinal = null;
    status = isPago ? 'Concluído' : 'Em prazo';
  } else if (hasCadinComunicado) {
    const endCadinComunicado = new Date(startCadinComunicado);
    endCadinComunicado.setDate(endCadinComunicado.getDate() + 75);

    dataInicioFase = formatDateString(startCadinComunicado);
    prazoFinal = formatDateString(endCadinComunicado);

    if (isPago) {
      status = 'Concluído';
    } else if (today <= endCadinComunicado) {
      faseAtual = 'Comunicação CADIN';
      status = 'Em prazo';
      diasRestantes = decDays(endCadinComunicado, today);
    } else {
      faseAtual = 'Aguardando inclusão CADIN';
      status = 'Em prazo';
      diasRestantes = 0;
      atrasoDias = 0;
    }
  } else if (hasProtesto) {
    faseAtual = 'Protesto';
    const endProtesto = new Date(startProtesto);
    endProtesto.setDate(endProtesto.getDate() + 180);

    dataInicioFase = formatDateString(startProtesto);
    prazoFinal = formatDateString(endProtesto);

    if (isPago) {
      status = 'Concluído';
    } else if (today <= endProtesto) {
      status = 'Em prazo';
      diasRestantes = decDays(endProtesto, today);
    } else {
      status = 'Vencido';
      atrasoDias = decDays(today, endProtesto);
    }
  } else if (hasNotif) {
    faseAtual = 'Notificação';
    const endNotif = new Date(startNotif);
    endNotif.setDate(endNotif.getDate() + 30);

    dataInicioFase = formatDateString(startNotif);
    prazoFinal = formatDateString(endNotif);

    if (isPago) {
      status = 'Concluído';
    } else if (today <= endNotif) {
      status = 'Em prazo';
      diasRestantes = decDays(endNotif, today);
    } else {
      status = 'Vencido';
      atrasoDias = decDays(today, endNotif);
    }
  } else {
    // Stage: Aguardando Notificação
    faseAtual = 'Aguardando Notificação';
    const vDate = parseDateSafely(debito.dataVencimento) || today;
    const isVencido = vDate < today;
    const diff = decDays(vDate, today);

    dataInicioFase = formatDateString(vDate);
    prazoFinal = formatDateString(vDate);

    if (isPago) {
      status = 'Concluído';
    } else {
      status = isVencido ? 'Vencido' : 'Em prazo';
      diasRestantes = !isVencido ? diff : 0;
      atrasoDias = isVencido ? Math.abs(diff) : 0;
    }
  }

  return {
    faseAtual,
    dataInicioFase,
    prazoFinal,
    status,
    diasRestantes,
    atrasoDias,
  };
}
