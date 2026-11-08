import { Debito, Notificacao } from '../types';
import { getStatusDebito, parseDateSafely, StatusDebitoInfo, FaseDebito } from './statusDebito';

export interface FlowControl {
  faseAtual: FaseDebito;
  dataInicioFase: string | null;
  prazoFinal: string | null;
  status: 'Em prazo' | 'Vencido' | 'Concluído';
  diasRestantes: number;
  atrasoDias: number;
}

export { parseDateSafely };

export function calculateFlow(debito: Debito, notifications: Notificacao[] = []): FlowControl {
  const info: StatusDebitoInfo = getStatusDebito(debito, notifications);
  return {
    faseAtual: info.faseAtual,
    dataInicioFase: info.dataInicioFase,
    prazoFinal: info.prazoFinal,
    status: info.status,
    diasRestantes: info.diasRestantes,
    atrasoDias: info.atrasoDias,
  };
}
