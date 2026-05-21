export type UserProfile = 'ADMIN' | 'OPERACIONAL' | 'VISUALIZADOR';
export type UserStatus = 'ATIVO' | 'INATIVO';

export interface User {
  id: string;
  nome: string;
  username: string;
  email: string;
  password?: string;
  perfil: UserProfile;
  status: UserStatus;
  createdAt: string;
}

export interface Debito {
  id: string;
  crb: string;
  nome: string;
  nomeDebito: string;
  ano: number;
  dataVencimento: string;
  valor: number;
  valorOriginal: number;
  valorCorrigido: number;
  indiceCorrecao?: string;
  statusGeral: string;
  updatedAt: string;
  notificacaoEnviada?: boolean;
  dataNotificacao?: string | null;
  protestoEnviado?: boolean;
  dataProtesto?: string | null;
  cadinComunicado?: boolean;
  dataComunicacaoCadin?: string | null;
  cadinIncluido?: boolean;
  dataCadin?: string | null;
}

export interface Notificacao {
  id: string;
  debitoId: string; // Keep first for compatibility
  debitosIds?: string[];
  dataNotificacao: string;
  tipo: string;
  tipoEnvio?: string;
  prazoDias: number;
  statusPrazo: string;
  valorTotal?: number;
  observacoes?: string;
  createdAt: string;
}

export interface Negociacao {
  id: string;
  crb: string;
  debitosIds: string[];
  valorTotal: number;
  valorNegociado: number;
  formaNegociacao: string;
  nParcelas: number;
  statusContato: string;
  dataNegociacao: string;
  observacoes: string;
  createdAt: string;
}

export interface Oficio {
  id: string;
  numeroOficio?: string;
  numero?: string;
  assunto: string;
  tipoOficio?: string;
  destinatario: string;
  dataEnvio?: string;
  dataEmissao?: string;
  status: string;
  observacao?: string;
  ano?: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface Processo {
  id: string;
  numeroProcesso?: string;
  numero?: string;
  profissional?: string;
  interessado?: string;
  solicitacao?: string;
  descricao?: string;
  dataSolicitacao?: string;
  dataAbertura?: string;
  dataPlenaria?: string;
  status: string;
  observacao?: string;
  ano?: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface AuditoriaLog {
  id: string;
  userId: string;
  userEmail: string;
  acao: 'CRIACAO' | 'EDICAO' | 'EXCLUSAO' | 'IMPORTACAO';
  modulo: string;
  entidadeId: string;
  alteracoes: any;
  timestamp: string;
}
