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

export interface ArquivoAnexo {
  id: string;
  nome: string;
  base64: string;
  tamanho: number;
  tipo: string;
  dataUpload: string;
  usuarioUpload: string;
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
  notificacaoResponsavel?: string | null;
  protestoEnviado?: boolean;
  dataProtesto?: string | null;
  protestoResponsavel?: string | null;
  cadinComunicado?: boolean;
  dataComunicacaoCadin?: string | null;
  comunicacaoCadinResponsavel?: string | null;
  cadinIncluido?: boolean;
  dataCadin?: string | null;
  cadinResponsavel?: string | null;
  negociacao?: {
    ativo: boolean;
    data: string;
    formaPagamento: string;
    parcelas: number;
  } | null;
  pagamento?: {
    data: string;
    formaPagamento: string;
    parcelas: number;
  } | null;
  anexos?: {
    notificacao?: ArquivoAnexo[];
    protesto?: ArquivoAnexo[];
    comunicacaoCadin?: ArquivoAnexo[];
    cadin?: ArquivoAnexo[];
  };
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
  tipo?: string;
  destinatario: string;
  orgaoDestino?: string;
  dataEnvio?: string;
  dataEmissao?: string;
  status: string;
  observacao?: string;
  ano?: number;
  updatedAt?: string;
  createdAt?: string;
  anexos?: ArquivoAnexo[];
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
  anexos?: ArquivoAnexo[];
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
