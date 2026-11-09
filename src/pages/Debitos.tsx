import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  where,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logAuditoria } from '../lib/firebase';
import { Debito } from '@/src/types';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit2, 
  Trash2,
  Eye,
  ChevronLeft, 
  ChevronRight,
  Filter,
  FileSpreadsheet,
  X,
  Save,
  AlertTriangle,
  Mail,
  Shield,
  Clock,
  HelpCircle,
  FileText,
  CheckCircle2,
  History,
  Paperclip,
  Calendar,
  User,
  File,
  RefreshCw
} from 'lucide-react';
import { formatCurrency, formatDate, cn, openAttachment } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { getStatusDebito, parseDateSafely, addDays, formatDateBR } from '../lib/statusDebito';
import { getSessionCache, setSessionCache, clearSessionCache } from '../lib/sessionCache';
import TaskPanel from '../components/TaskPanel';

const CURRENT_YEAR = new Date().getFullYear();

export default function Debitos() {
  const { userData, isAdmin, isOperacional } = useAuth();
  const [activeView, setActiveView] = useState<'lista' | 'tarefas'>('lista');
  const [debitos, setDebitos] = useState<Debito[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCRB, setSearchCRB] = useState('');
  const [searchAno, setSearchAno] = useState<string>(CURRENT_YEAR.toString());
  const [showFilters, setShowFilters] = useState(false);
  
  const [editingDebito, setEditingDebito] = useState<Partial<Debito> | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tempNotifDate, setTempNotifDate] = useState('');
  const [tempDividaAtivaDate, setTempDividaAtivaDate] = useState('');
  const [tempNumeroCDA, setTempNumeroCDA] = useState('');
  const [tempProtestoDate, setTempProtestoDate] = useState('');
  const [tempCadinComunicacaoDate, setTempCadinComunicacaoDate] = useState('');
  const [tempCadinDate, setTempCadinDate] = useState('');
  const [modalTab, setModalTab] = useState<'timeline' | 'anexos'>('timeline');

  const [filterFase, setFilterFase] = useState('');
  const [filterPrazo, setFilterPrazo] = useState('');

  const handleStageFileUpload = (e: React.ChangeEvent<HTMLInputElement>, stage: 'notificacao' | 'dividaAtiva' | 'protesto' | 'comunicacaoCadin' | 'cadin') => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files) as File[];
    
    filesArray.forEach((file: File) => {
      if (file.size > 1024 * 1024) {
        alert(`O arquivo "${file.name}" excede o limite de 1MB recomendado.`);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        const novoAnexo = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
          nome: file.name,
          base64: base64Data,
          tamanho: file.size,
          tipo: file.type,
          dataUpload: new Date().toISOString(),
          usuarioUpload: userData?.nome || userData?.email || 'Usuário'
        };
        
        setEditingDebito(prev => {
          if (!prev) return prev;
          const currentAnexos = prev.anexos || {};
          const stageAnexos = currentAnexos[stage] || [];
          return {
            ...prev,
            anexos: {
              ...currentAnexos,
              [stage]: [...stageAnexos, novoAnexo]
            }
          };
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeStageAnexo = (stage: 'notificacao' | 'dividaAtiva' | 'protesto' | 'comunicacaoCadin' | 'cadin', id: string) => {
    setEditingDebito(prev => {
      if (!prev) return prev;
      const currentAnexos = prev.anexos || {};
      const stageAnexos = currentAnexos[stage] || [];
      return {
        ...prev,
        anexos: {
          ...currentAnexos,
          [stage]: stageAnexos.filter(anexo => anexo.id !== id)
        }
      };
    });
  };

  useEffect(() => {
    if (editingDebito) {
      const todayString = new Date().toISOString().split('T')[0];
      setTempNotifDate(editingDebito.dataNotificacao || todayString);
      setTempDividaAtivaDate(editingDebito.dataInscricaoDividaAtiva || todayString);
      setTempNumeroCDA(editingDebito.numeroCDA || '');
      setTempProtestoDate(editingDebito.dataProtesto || todayString);
      setTempCadinComunicacaoDate(editingDebito.dataComunicacaoCadin || todayString);
      setTempCadinDate(editingDebito.dataCadin || todayString);
    } else {
      setTempNotifDate('');
      setTempDividaAtivaDate('');
      setTempNumeroCDA('');
      setTempProtestoDate('');
      setTempCadinComunicacaoDate('');
      setTempCadinDate('');
    }
  }, [editingDebito]);

  const pageSize = 50;

  const fetchNotifications = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        const cached = getSessionCache<any[]>('notifications_cache');
        if (cached) {
          setNotifications(cached);
          return;
        }
      }
      const snapshot = await getDocs(collection(db, 'notifications'));
      const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessionCache('notifications_cache', notifs);
      setNotifications(notifs);
    } catch (err) {
      console.error("Erro ao carregar notificações para fluxo:", err);
    }
  };

  const fetchDebitos = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const isAll = !searchAno || searchAno === 'todos';
      const cacheKey = `debitos_${isAll ? 'todos' : searchAno}_p${page}`;

      if (!forceRefresh) {
        const cached = getSessionCache<Debito[]>(cacheKey);
        if (cached) {
          setDebitos(cached);
          setLoading(false);
          return;
        }
      }

      let q;
      if (!isAll) {
        // Query com where no campo de ano para carregar apenas o exercício selecionado
        q = query(
          collection(db, 'debits'),
          where('ano', '==', Number(searchAno))
        );
      } else {
        // Opção "Todos os anos": mantida com paginação de 50 em 50
        q = query(
          collection(db, 'debits'),
          orderBy('crb'),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Debito[];
      data.sort((a, b) => a.crb.localeCompare(b.crb) || b.ano - a.ano);
      setSessionCache(cacheKey, data);
      setDebitos(data);
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'debits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    fetchDebitos();
  }, [searchAno, page]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebito?.crb || !editingDebito?.nome || !editingDebito?.valor || !editingDebito?.ano) return;

    if (editingDebito.statusGeral === 'Pago') {
      const pag = editingDebito.pagamento;
      if (!pag || !pag.data || !pag.formaPagamento) {
        alert('Por favor, informe a data e a forma de pagamento.');
        return;
      }
    }

    // Validação Resolução 259 CFB: inscrição em Dívida Ativa só permitida após o fim do prazo de 30 dias da notificação
    if (editingDebito.dataInscricaoDividaAtiva || editingDebito.dividaAtivaInscrita) {
      if (!editingDebito.notificacaoEnviada || !editingDebito.dataNotificacao) {
        alert('Não é permitido registrar inscrição em Dívida Ativa sem notificação prévia e decurso do prazo regulamentar de 30 dias (Res. 259 CFB).');
        return;
      }
      const notifDate = parseDateSafely(editingDebito.dataNotificacao);
      const inscricaoDate = parseDateSafely(editingDebito.dataInscricaoDividaAtiva);
      if (notifDate && inscricaoDate) {
        const prazoFinal30 = addDays(notifDate, 30);
        if (inscricaoDate < prazoFinal30) {
          alert(`A data de inscrição em Dívida Ativa (${formatDateBR(inscricaoDate)}) não pode ser anterior ao término do prazo de 30 dias da notificação (disponível a partir de ${formatDateBR(prazoFinal30)}).`);
          return;
        }
      }
    }

    // Validação Resolução 259 CFB: não permitir marcar envio ao cartório sem dataInscricaoDividaAtiva preenchida
    if (editingDebito.protestoEnviado && !editingDebito.dataInscricaoDividaAtiva) {
      const originalDebito = editingDebito.id ? debitos.find(d => d.id === editingDebito.id) : null;
      if (!originalDebito?.protestoEnviado) {
        alert('Não é permitido marcar o envio ao cartório sem a data de inscrição em Dívida Ativa preenchida. Conforme a Resolução 259 do CFB, o débito deve estar previamente inscrito em Dívida Ativa.');
        return;
      }
    }

    setSaving(true);
    try {
      const dataToSave = {
        crb: editingDebito.crb.toUpperCase(),
        nome: editingDebito.nome.toUpperCase(),
        nomeDebito: editingDebito.nomeDebito || 'Anuidade',
        ano: Number(editingDebito.ano),
        valor: Number(editingDebito.valor),
        valorOriginal: Number(editingDebito.valor),
        valorCorrigido: Number(editingDebito.valorCorrigido || editingDebito.valor),
        indiceCorrecao: "INPC",
        dataVencimento: editingDebito.dataVencimento || new Date().toISOString(),
        statusGeral: editingDebito.statusGeral || 'Pendente',
        observacoes: editingDebito.observacoes || '',
        updatedAt: new Date().toISOString(),
        notificacaoEnviada: editingDebito.notificacaoEnviada || false,
        dataNotificacao: editingDebito.dataNotificacao || null,
        notificacaoResponsavel: editingDebito.notificacaoResponsavel || null,
        dividaAtivaInscrita: editingDebito.dividaAtivaInscrita || false,
        dataInscricaoDividaAtiva: editingDebito.dataInscricaoDividaAtiva || null,
        numeroCDA: editingDebito.numeroCDA || null,
        dividaAtivaResponsavel: editingDebito.dividaAtivaResponsavel || null,
        protestoEnviado: editingDebito.protestoEnviado || false,
        dataProtesto: editingDebito.dataProtesto || null,
        protestoResponsavel: editingDebito.protestoResponsavel || null,
        cadinComunicado: editingDebito.cadinComunicado || false,
        dataComunicacaoCadin: editingDebito.dataComunicacaoCadin || null,
        comunicacaoCadinResponsavel: editingDebito.comunicacaoCadinResponsavel || null,
        cadinIncluido: editingDebito.cadinIncluido || false,
        dataCadin: editingDebito.dataCadin || null,
        cadinResponsavel: editingDebito.cadinResponsavel || null,
        negociacao: (editingDebito.statusGeral === 'Em Negociação' || editingDebito.negociacao) ? {
          ativo: editingDebito.statusGeral === 'Em Negociação',
          data: editingDebito.negociacao?.data || new Date().toISOString().split('T')[0],
          formaPagamento: editingDebito.negociacao?.formaPagamento || 'Boleto',
          parcelas: Number(editingDebito.negociacao?.parcelas !== undefined ? editingDebito.negociacao.parcelas : 1)
        } : null,
        pagamento: editingDebito.statusGeral === 'Pago' ? {
          data: editingDebito.pagamento?.data || new Date().toISOString().split('T')[0],
          formaPagamento: editingDebito.pagamento?.formaPagamento || 'Boleto',
          parcelas: Number(editingDebito.pagamento?.parcelas !== undefined ? editingDebito.pagamento.parcelas : 1)
        } : null,
        anexos: editingDebito.anexos || null
      };

      if (editingDebito.id) {
        await updateDoc(doc(db, 'debits', editingDebito.id), dataToSave);
        await logAuditoria('EDICAO', 'DEBITOS', editingDebito.id);
        alert('Débito atualizado com sucesso!');
      } else {
        const docRef = await addDoc(collection(db, 'debits'), dataToSave);
        await logAuditoria('CRIACAO', 'DEBITOS', docRef.id);
        alert('Débito registrado com sucesso!');
      }

      clearSessionCache('debitos_');
      await fetchDebitos(true);
      setIsModalOpen(false);
      setEditingDebito(null);
    } catch (err) {
      alert('Erro ao salvar débito.');
      handleFirestoreError(err, editingDebito.id ? OperationType.UPDATE : OperationType.CREATE, 'debits');
    } finally {
      setSaving(false);
    }
  };

  const filteredData = debitos.filter(d => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = search ? (d.nome.toLowerCase().includes(search) || d.crb.toLowerCase().includes(search)) : true;
    const matchesCRB = searchCRB ? d.crb.toLowerCase().includes(searchCRB.toLowerCase()) : true;
    const matchesAno = searchAno ? d.ano.toString() === searchAno : true;

    // Calculate status dynamically for filter check
    const statusInfo = (filterFase || filterPrazo) ? getStatusDebito(d, notifications) : null;
    const matchesFase = filterFase ? statusInfo?.fase === filterFase : true;
    const matchesPrazo = filterPrazo ? (
      filterPrazo === 'Em prazo' ? statusInfo?.prazo === 'EM PRAZO' :
      filterPrazo === 'Vencido' ? statusInfo?.prazo === 'VENCIDO' :
      filterPrazo === 'Concluído' ? statusInfo?.prazo === 'CONCLUÍDO' : true
    ) : true;

    return matchesSearch && matchesCRB && matchesAno && matchesFase && matchesPrazo;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Gestão de Débitos</h2>
          <p className="text-slate-500 font-medium font-sans">Controle e acompanhamento de anuidades e pendências financeiras.</p>
        </div>
        <div className="flex gap-3">
          {(isAdmin || isOperacional) && (
            <button 
              onClick={() => { 
                setEditingDebito({}); 
                setIsReadOnly(false);
                setIsModalOpen(true); 
              }}
              className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm tracking-wide"
            >
              <Plus size={20} className="text-white" />
              Novo Débito
            </button>
          )}
        </div>
      </div>

      {/* Toggles de Visualização */}
      <div className="flex bg-slate-200/50 p-1 rounded-2xl gap-1 w-fit border border-slate-200 shadow-xs">
        <button
          onClick={() => setActiveView('lista')}
          className={cn(
            "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all uppercase tracking-wider",
            activeView === 'lista'
              ? "bg-white text-crb-navy shadow-xs ring-1 ring-slate-100"
              : "text-slate-500 hover:text-crb-navy"
          )}
        >
          Lista Geral de Débitos
        </button>
        <button
          onClick={() => setActiveView('tarefas')}
          className={cn(
            "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all uppercase tracking-wider",
            activeView === 'tarefas'
              ? "bg-white text-crb-navy shadow-xs ring-1 ring-slate-100"
              : "text-slate-500 hover:text-crb-navy"
          )}
        >
          Painel de Tarefas de Cobrança
        </button>
      </div>

      {/* Modal de Débito */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "bg-white w-full rounded-3xl shadow-2xl overflow-hidden border border-slate-200/50 flex flex-col transition-all duration-300",
                editingDebito?.id ? "max-w-6xl h-[90vh]" : "max-w-2xl max-h-[85vh]"
              )}
            >
              <div className="bg-crb-navy p-6 flex justify-between items-center bg-gradient-to-r from-crb-navy to-crb-purple shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    {isReadOnly ? <Eye size={24} className="text-white" /> : <Plus size={24} className="text-white" />}
                  </div>
                  <h3 className="text-xl font-serif font-bold text-white">
                    {isReadOnly ? 'Visualizar Detalhes' : (editingDebito?.id ? 'Editar Débito' : 'Novo Registro de Débito')}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className={cn(
                  "flex-1 min-h-0 overflow-hidden flex flex-col",
                  editingDebito?.id ? "lg:flex-row" : ""
                )}>
                  <div className={cn(
                    "overflow-y-auto h-full flex flex-col",
                    editingDebito?.id ? "w-full lg:w-[55%] p-6 md:p-8 space-y-6 border-b lg:border-b-0 lg:border-r border-slate-200" : "p-8 space-y-6 flex-1"
                  )}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CRB do Profissional/Empresa</label>
                      <input 
                        required
                        type="text"
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                        placeholder="Ex: PE-00000"
                        value={editingDebito?.crb || ''}
                        onChange={(e) => setEditingDebito({...editingDebito!, crb: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo / Razão Social</label>
                      <input 
                        required
                        type="text"
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy uppercase disabled:opacity-70"
                        placeholder="NOME DO PROFISSIONAL"
                        value={editingDebito?.nome || ''}
                        onChange={(e) => setEditingDebito({...editingDebito!, nome: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ano do Exercício</label>
                      <input 
                        required
                        type="number"
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                        placeholder="2024"
                        value={editingDebito?.ano || ''}
                        onChange={(e) => setEditingDebito({...editingDebito!, ano: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Débito</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                        value={editingDebito?.nomeDebito || 'Anuidade'}
                        onChange={(e) => setEditingDebito({...editingDebito!, nomeDebito: e.target.value})}
                      >
                        <option value="Anuidade">Anuidade PF</option>
                        <option value="Anuidade PJ">Anuidade PJ</option>
                        <option value="Multa">Multa Eleitoral / Disciplinar</option>
                        <option value="Taxa">Taxas Diversas</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Valor Original (R$)</label>
                        <input 
                          required
                          type="number"
                          step="0.01"
                          disabled={isReadOnly}
                          className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                          placeholder="0.00"
                          value={editingDebito?.valor || ''}
                          onChange={(e) => setEditingDebito({...editingDebito!, valor: Number(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Valor Corrigido (R$)</label>
                      <input 
                        required
                        type="number"
                        step="0.01"
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-emerald-600 disabled:opacity-70"
                        placeholder="0.00"
                        value={editingDebito?.valorCorrigido || ''}
                        onChange={(e) => setEditingDebito({...editingDebito!, valorCorrigido: Number(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Índice de Correção</label>
                       <select 
                         disabled
                         className="w-full bg-slate-100 border-2 border-slate-100 py-3 px-4 rounded-xl outline-none font-bold text-slate-500 cursor-not-allowed"
                       >
                         <option>INPC</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data de Vencimento</label>
                      <input 
                        required
                        type="date"
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                        value={editingDebito?.dataVencimento?.split('T')[0] || ''}
                        onChange={(e) => {
                        const val = e.target.value;
                        setEditingDebito({...editingDebito!, dataVencimento: val ? new Date(val).toISOString() : ''});
                      }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Situação do Débito</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingDebito?.statusGeral || 'Pendente'}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        const updated = { ...editingDebito!, statusGeral: newStatus };
                        if (newStatus === 'Pago' && !updated.pagamento) {
                          updated.pagamento = {
                            data: new Date().toISOString().split('T')[0],
                            formaPagamento: 'Boleto',
                            parcelas: 1
                          };
                        }
                        if (newStatus === 'Em Negociação' && !updated.negociacao) {
                          updated.negociacao = {
                            ativo: true,
                            data: new Date().toISOString().split('T')[0],
                            formaPagamento: 'Boleto',
                            parcelas: 1
                          };
                        }
                        setEditingDebito(updated);
                      }}
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Pago">Pago</option>
                      <option value="Em Negociação">Em Negociação</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>

                {editingDebito?.statusGeral === 'Pago' && (
                  <div className="border border-emerald-200 bg-emerald-50/30 p-5 rounded-2xl space-y-4 grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-left">
                    <div className="col-span-1 md:col-span-3 pb-2 border-b border-emerald-100">
                      <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-widest text-[11px]">Informações de Pagamento</h4>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data do Pagamento *</label>
                      <input 
                        required
                        type="date"
                        disabled={isReadOnly}
                        className="w-full bg-white border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-crb-navy disabled:opacity-70 text-sm"
                        value={editingDebito?.pagamento?.data || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setEditingDebito({
                          ...editingDebito!,
                          pagamento: {
                            ...editingDebito!.pagamento || { formaPagamento: 'Boleto', parcelas: 1 },
                            data: e.target.value
                          }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Forma de Pagamento *</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full bg-white border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-crb-navy disabled:opacity-70 text-sm"
                        value={editingDebito?.pagamento?.formaPagamento || 'Boleto'}
                        onChange={(e) => setEditingDebito({
                          ...editingDebito!,
                          pagamento: {
                            ...editingDebito!.pagamento || { data: new Date().toISOString().split('T')[0], parcelas: 1 },
                            formaPagamento: e.target.value
                          }
                        })}
                      >
                        <option value="À vista">À vista</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Cartão">Cartão</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Número de Parcelas</label>
                      <input 
                        required
                        type="number"
                        min="1"
                        disabled={isReadOnly}
                        className="w-full bg-white border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-crb-navy disabled:opacity-70 text-sm"
                        placeholder="1"
                        value={editingDebito?.pagamento?.parcelas !== undefined ? editingDebito.pagamento.parcelas : 1}
                        onChange={(e) => setEditingDebito({
                          ...editingDebito!,
                          pagamento: {
                            ...editingDebito!.pagamento || { data: new Date().toISOString().split('T')[0], formaPagamento: 'Boleto' },
                            parcelas: Number(e.target.value)
                          }
                        })}
                      />
                    </div>
                  </div>
                )}

                {(editingDebito?.statusGeral === 'Em Negociação' || (editingDebito?.statusGeral === 'Pago' && editingDebito?.negociacao)) && (
                  <div className="border border-slate-200 bg-slate-50/50 p-5 rounded-2xl space-y-4 grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data da Negociação</label>
                      <input 
                        required
                        type="date"
                        disabled={isReadOnly}
                        className="w-full bg-white border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70 text-sm"
                        value={editingDebito?.negociacao?.data || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setEditingDebito({
                          ...editingDebito!,
                          negociacao: {
                            ...editingDebito!.negociacao || { ativo: true, formaPagamento: 'Boleto', parcelas: 1 },
                            data: e.target.value
                          }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Forma de Pagamento</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full bg-white border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70 text-sm"
                        value={editingDebito?.negociacao?.formaPagamento || 'Boleto'}
                        onChange={(e) => setEditingDebito({
                          ...editingDebito!,
                          negociacao: {
                            ...editingDebito!.negociacao || { ativo: true, data: new Date().toISOString().split('T')[0], parcelas: 1 },
                            formaPagamento: e.target.value
                          }
                        })}
                      >
                        <option value="À vista">À vista</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Cartão">Cartão</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Número de Parcelas</label>
                      <input 
                        required
                        type="number"
                        min="1"
                        disabled={isReadOnly}
                        className="w-full bg-white border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70 text-sm"
                        placeholder="1"
                        value={editingDebito?.negociacao?.parcelas !== undefined ? editingDebito.negociacao.parcelas : 1}
                        onChange={(e) => setEditingDebito({
                          ...editingDebito!,
                          negociacao: {
                            ...editingDebito!.negociacao || { ativo: true, data: new Date().toISOString().split('T')[0], formaPagamento: 'Boleto' },
                            parcelas: Number(e.target.value)
                          }
                        })}
                      />
                    </div>
                  </div>
                )}

                {editingDebito && editingDebito.id && (() => {
                  const statusInfo = getStatusDebito(editingDebito as any, notifications);
                  const todayStr = new Date().toISOString().split('T')[0];
                  const notifDate = parseDateSafely(editingDebito.dataNotificacao);
                  const prazoFinalNotif30 = notifDate ? addDays(notifDate, 30) : null;
                  const todayZero = new Date();
                  todayZero.setHours(0, 0, 0, 0);
                  const isPrazo30Esgotado = Boolean(
                    editingDebito.notificacaoEnviada &&
                    notifDate &&
                    prazoFinalNotif30 &&
                    todayZero > prazoFinalNotif30
                  );
                  const dataLiberacaoDividaAtivaStr = prazoFinalNotif30 ? formatDateBR(prazoFinalNotif30) : '-';

                  const diasRestantesProtesto = (() => {
                    if (!editingDebito.protestoEnviado || !editingDebito.dataProtesto) return 0;
                    const protDate = parseDateSafely(editingDebito.dataProtesto);
                    if (!protDate) return 0;
                    const daysPassed = Math.floor((new Date().getTime() - protDate.getTime()) / (1000 * 60 * 60 * 24));
                    return Math.max(0, 180 - daysPassed);
                  })();

                  const diasRestantesComunicacao = (() => {
                    if (!editingDebito.cadinComunicado || !editingDebito.dataComunicacaoCadin) return 0;
                    const comDate = parseDateSafely(editingDebito.dataComunicacaoCadin);
                    if (!comDate) return 0;
                    const daysPassed = Math.floor((new Date().getTime() - comDate.getTime()) / (1000 * 60 * 60 * 24));
                    return Math.max(0, 75 - daysPassed);
                  })();

                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Acompanhamento do Fluxo de Cobrança</span>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          statusInfo.prazo === 'CONCLUÍDO' 
                             ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                             : statusInfo.prazo === 'VENCIDO'
                               ? "bg-red-100 text-red-800 border border-red-200"
                               : "bg-blue-100 text-blue-800 border border-blue-200"
                        )}>
                          {statusInfo.prazo}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Fase Atual</span>
                          <span className="text-sm font-sans font-extrabold text-crb-navy mt-0.5 block">{statusInfo.fase}</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Início da Fase</span>
                          <span className="text-sm font-bold text-slate-600 mt-0.5 block">
                            {statusInfo.dataInicioFormatada}
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Prazo Final</span>
                          <span className="text-sm font-bold text-slate-600 mt-0.5 block">
                            {statusInfo.prazoFinalFormatado}
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Dias / Situação</span>
                          <span className={cn(
                            "text-sm font-extrabold mt-0.5 block",
                            statusInfo.prazo === 'VENCIDO' ? "text-red-600" : "text-emerald-600"
                          )}>
                            {statusInfo.prazo === 'VENCIDO' ? (statusInfo.dias > 0 ? `Atraso: ${statusInfo.dias}d` : 'Vencido') : (statusInfo.temDataReal && statusInfo.dias > 0 ? `${statusInfo.dias}d rest.` : (statusInfo.prazo === 'CONCLUÍDO' ? 'Concluído' : '-'))}
                          </span>
                        </div>
                      </div>

                      {/* Manual Institutional Actions Container */}
                      <div className="border-t border-slate-200 pt-4 space-y-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#1e3a8a]">
                            Gestão de Cobrança Institucional (Eventos Manuais)
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            Registre e gerencie as fases regulamentares sem automação indevida.
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          
                          {/* 1. NOTIFICACAO */}
                          <div className={cn(
                            "bg-white p-4 rounded-xl border flex flex-col justify-between space-y-3 shadow-xs",
                            editingDebito.notificacaoEnviada ? "border-emerald-200 bg-emerald-50/5" : "border-slate-100"
                          )}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Mail size={14} className={editingDebito.notificacaoEnviada ? "text-emerald-600" : "text-slate-400"} />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                  1. Notificação
                                </span>
                              </div>
                              {editingDebito.notificacaoEnviada ? (
                                <div className="mt-2 space-y-1">
                                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100/60 px-2.5 py-1 rounded-md inline-block font-sans">
                                    Notificado em: {editingDebito.dataNotificacao ? editingDebito.dataNotificacao.split('-').reverse().join('/') : 'S/A'}
                                  </span>
                                  {editingDebito.notificacaoResponsavel && (
                                    <span className="text-[9px] text-slate-400 font-medium block tracking-tight">
                                      Resp: {editingDebito.notificacaoResponsavel}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">
                                  Aguardando envio oficial da notificação de débito (30 dias).
                                </p>
                              )}

                              {/* Notification Attachments list */}
                              {editingDebito.anexos?.notificacao && editingDebito.anexos.notificacao.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Documentos:</span>
                                  {editingDebito.anexos.notificacao.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                                      <span className="font-bold text-slate-600 truncate max-w-[120px] block" title={file.nome}>
                                        {file.nome}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openAttachment(file)}
                                          className="p-1 text-slate-500 hover:text-white hover:bg-crb-navy rounded transition-colors"
                                          title="Visualizar documento"
                                        >
                                          <Eye size={12} />
                                        </button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeStageAnexo('notificacao', file.id)}
                                            className="p-1 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors"
                                            title="Excluir documento"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isReadOnly && editingDebito.notificacaoEnviada && (
                                <div className="mt-2 pt-1 border-t border-dashed border-slate-100">
                                  <label className="flex items-center justify-center gap-1 p-1.5 border border-dashed border-slate-200 hover:border-crb-purple rounded-lg cursor-pointer text-slate-500 hover:text-crb-purple transition-all text-center">
                                    <Plus size={12} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Novo Anexo</span>
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleStageFileUpload(e, 'notificacao')}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>

                            {!isReadOnly && (
                              <div className="pt-1">
                                {editingDebito.notificacaoEnviada ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDebito({
                                        ...editingDebito,
                                        notificacaoEnviada: false,
                                        dataNotificacao: null,
                                        notificacaoResponsavel: null,
                                        protestoEnviado: false,
                                        dataProtesto: null,
                                        protestoResponsavel: null,
                                        cadinComunicado: false,
                                        dataComunicacaoCadin: null,
                                        comunicacaoCadinResponsavel: null,
                                        cadinIncluido: false,
                                        dataCadin: null,
                                        cadinResponsavel: null
                                      });
                                    }}
                                    className="w-full text-[10px] uppercase tracking-widest font-black text-red-500 hover:text-red-700 hover:underline text-left mt-1"
                                  >
                                    ✕ Remover Notif.
                                  </button>
                                ) : (
                                  <div className="space-y-2">
                                    <input 
                                      type="date"
                                      value={tempNotifDate}
                                      onChange={(e) => setTempNotifDate(e.target.value)}
                                      className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-sans font-bold text-crb-navy focus:border-crb-purple"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingDebito({
                                          ...editingDebito,
                                          notificacaoEnviada: true,
                                          dataNotificacao: tempNotifDate || todayStr,
                                          notificacaoResponsavel: userData?.nome || userData?.email || 'Sistema'
                                        });
                                      }}
                                      className="w-full text-[10px] text-white bg-crb-navy hover:bg-[#112455] py-2 px-3 rounded-lg font-bold uppercase tracking-wider transition-colors"
                                    >
                                      ✓ Registrar Notif.
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 2. DÍVIDA ATIVA */}
                          <div className={cn(
                            "bg-white p-4 rounded-xl border flex flex-col justify-between space-y-3 shadow-xs",
                            (editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? "border-amber-300 bg-amber-50/10" : "border-slate-100",
                            ((!editingDebito.notificacaoEnviada || !isPrazo30Esgotado) && !(editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) && !isReadOnly) ? "opacity-90 bg-slate-50/50" : ""
                          )}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <FileText size={14} className={(editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? "text-amber-700" : "text-slate-400"} />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                  2. Inscrição em Dívida Ativa
                                </span>
                              </div>
                              {(editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? (
                                <div className="mt-2 space-y-1">
                                  <span className="text-xs font-bold text-amber-800 bg-amber-100/70 px-2.5 py-1 rounded-md inline-block font-sans">
                                    Inscrito em: {editingDebito.dataInscricaoDividaAtiva ? editingDebito.dataInscricaoDividaAtiva.split('-').reverse().join('/') : 'S/A'}
                                  </span>
                                  {editingDebito.numeroCDA && (
                                    <span className="text-[10px] font-mono font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded block w-fit">
                                      CDA: {editingDebito.numeroCDA}
                                    </span>
                                  )}
                                  {editingDebito.dividaAtivaResponsavel && (
                                    <span className="text-[9px] text-slate-400 font-medium block tracking-tight">
                                      Resp: {editingDebito.dividaAtivaResponsavel}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1.5 mt-1">
                                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                                    Obrigatório antes do cartório (Res. 259 CFB). Realizada após o prazo de 30 dias da notificação.
                                  </p>
                                  {editingDebito.notificacaoEnviada && !isPrazo30Esgotado && (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold p-2.5 rounded-xl flex items-center gap-2">
                                      <Clock size={14} className="text-amber-700 shrink-0" />
                                      <span>Disponível após o prazo de 30 dias da notificação (em {dataLiberacaoDividaAtivaStr})</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Divida Ativa Attachments list */}
                              {editingDebito.anexos?.dividaAtiva && editingDebito.anexos.dividaAtiva.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Documentos:</span>
                                  {editingDebito.anexos.dividaAtiva.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                                      <span className="font-bold text-slate-600 truncate max-w-[120px] block" title={file.nome}>
                                        {file.nome}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openAttachment(file)}
                                          className="p-1 text-slate-500 hover:text-white hover:bg-crb-navy rounded transition-colors"
                                          title="Visualizar documento"
                                        >
                                          <Eye size={12} />
                                        </button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeStageAnexo('dividaAtiva', file.id)}
                                            className="p-1 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors"
                                            title="Excluir documento"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isReadOnly && (editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) && (
                                <div className="mt-2 pt-1 border-t border-dashed border-slate-100">
                                  <label className="flex items-center justify-center gap-1 p-1.5 border border-dashed border-slate-200 hover:border-crb-purple rounded-lg cursor-pointer text-slate-500 hover:text-crb-purple transition-all text-center">
                                    <Plus size={12} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Novo Anexo</span>
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleStageFileUpload(e, 'dividaAtiva')}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>

                            {!isReadOnly && (
                              <div className="pt-1">
                                {(editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDebito({
                                        ...editingDebito,
                                        dividaAtivaInscrita: false,
                                        dataInscricaoDividaAtiva: null,
                                        numeroCDA: null,
                                        dividaAtivaResponsavel: null,
                                        protestoEnviado: false,
                                        dataProtesto: null,
                                        protestoResponsavel: null,
                                        cadinComunicado: false,
                                        dataComunicacaoCadin: null,
                                        comunicacaoCadinResponsavel: null,
                                        cadinIncluido: false,
                                        dataCadin: null,
                                        cadinResponsavel: null
                                      });
                                    }}
                                    className="w-full text-[10px] uppercase tracking-widest font-black text-red-500 hover:text-red-700 hover:underline text-left mt-1"
                                  >
                                    ✕ Remover Dívida Ativa
                                  </button>
                                ) : (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Data Inscrição</label>
                                      <input 
                                        type="date"
                                        disabled={!editingDebito.notificacaoEnviada || !isPrazo30Esgotado}
                                        value={tempDividaAtivaDate}
                                        onChange={(e) => setTempDividaAtivaDate(e.target.value)}
                                        className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-sans font-bold text-crb-navy focus:border-crb-purple disabled:opacity-40 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Nº CDA (Opcional)</label>
                                      <input 
                                        type="text"
                                        disabled={!editingDebito.notificacaoEnviada || !isPrazo30Esgotado}
                                        placeholder="Ex: CDA-2026/001"
                                        value={tempNumeroCDA}
                                        onChange={(e) => setTempNumeroCDA(e.target.value)}
                                        className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-sans font-bold text-crb-navy focus:border-crb-purple disabled:opacity-40 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      disabled={!editingDebito.notificacaoEnviada || !isPrazo30Esgotado}
                                      onClick={() => {
                                        if (!isPrazo30Esgotado) {
                                          alert(`Disponível após o prazo de 30 dias da notificação (em ${dataLiberacaoDividaAtivaStr})`);
                                          return;
                                        }
                                        const inscricaoD = parseDateSafely(tempDividaAtivaDate || todayStr);
                                        if (prazoFinalNotif30 && inscricaoD && inscricaoD < prazoFinalNotif30) {
                                          alert(`A data de inscrição em Dívida Ativa (${formatDateBR(inscricaoD)}) não pode ser anterior ao término do prazo de 30 dias da notificação (disponível a partir de ${dataLiberacaoDividaAtivaStr}).`);
                                          return;
                                        }
                                        setEditingDebito({
                                          ...editingDebito,
                                          dividaAtivaInscrita: true,
                                          dataInscricaoDividaAtiva: tempDividaAtivaDate || todayStr,
                                          numeroCDA: tempNumeroCDA.trim() || null,
                                          dividaAtivaResponsavel: userData?.nome || userData?.email || 'Sistema'
                                        });
                                      }}
                                      title={
                                        !editingDebito.notificacaoEnviada
                                          ? "Inscrição só permitida após notificação"
                                          : !isPrazo30Esgotado
                                            ? `Disponível após o prazo de 30 dias da notificação (em ${dataLiberacaoDividaAtivaStr})`
                                            : "Inscrever débito em Dívida Ativa"
                                      }
                                      className="w-full text-[10px] text-white bg-amber-600 hover:bg-amber-700 py-2 px-3 rounded-lg font-bold uppercase tracking-wider transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                      ✓ Inscrever em Dívida Ativa
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 3. PROTESTO */}
                          <div className={cn(
                            "bg-white p-4 rounded-xl border flex flex-col justify-between space-y-3 shadow-xs",
                            editingDebito.protestoEnviado ? "border-purple-200 bg-purple-50/5" : "border-slate-100",
                            (!editingDebito.dataInscricaoDividaAtiva && !editingDebito.protestoEnviado && !isReadOnly) ? "opacity-60 bg-slate-50/50" : ""
                          )}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Shield size={14} className={editingDebito.protestoEnviado ? "text-purple-600" : "text-slate-400"} />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                  3. Protesto
                                </span>
                              </div>
                              {editingDebito.protestoEnviado ? (
                                <div className="mt-2 space-y-1">
                                  <span className="text-xs font-bold text-purple-700 bg-purple-100/60 px-2.5 py-1 rounded-md inline-block font-sans">
                                    Protestado em: {editingDebito.dataProtesto ? editingDebito.dataProtesto.split('-').reverse().join('/') : 'S/A'}
                                  </span>
                                  {editingDebito.protestoResponsavel && (
                                    <span className="text-[9px] text-slate-400 font-medium block tracking-tight">
                                      Resp: {editingDebito.protestoResponsavel}
                                    </span>
                                  )}
                                  {!editingDebito.dataInscricaoDividaAtiva && (
                                    <span className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-800 block w-fit">
                                      ⚠️ sem inscrição em dívida ativa registrada
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">
                                  Requer prévia inscrição em Dívida Ativa (Res. 259 CFB). Envia débito ao cartório por 180 dias.
                                </p>
                              )}

                              {/* Protesto Attachments list */}
                              {editingDebito.anexos?.protesto && editingDebito.anexos.protesto.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Documentos:</span>
                                  {editingDebito.anexos.protesto.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                                      <span className="font-bold text-slate-600 truncate max-w-[120px] block" title={file.nome}>
                                        {file.nome}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openAttachment(file)}
                                          className="p-1 text-slate-500 hover:text-white hover:bg-crb-navy rounded transition-colors"
                                          title="Visualizar documento"
                                        >
                                          <Eye size={12} />
                                        </button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeStageAnexo('protesto', file.id)}
                                            className="p-1 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors"
                                            title="Excluir documento"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isReadOnly && editingDebito.protestoEnviado && (
                                <div className="mt-2 pt-1 border-t border-dashed border-slate-100">
                                  <label className="flex items-center justify-center gap-1 p-1.5 border border-dashed border-slate-200 hover:border-crb-purple rounded-lg cursor-pointer text-slate-500 hover:text-crb-purple transition-all text-center">
                                    <Plus size={12} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Novo Anexo</span>
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleStageFileUpload(e, 'protesto')}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>

                            {!isReadOnly && (
                              <div className="pt-1">
                                {editingDebito.protestoEnviado ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDebito({
                                        ...editingDebito,
                                        protestoEnviado: false,
                                        dataProtesto: null,
                                        protestoResponsavel: null,
                                        cadinComunicado: false,
                                        dataComunicacaoCadin: null,
                                        comunicacaoCadinResponsavel: null,
                                        cadinIncluido: false,
                                        dataCadin: null,
                                        cadinResponsavel: null
                                      });
                                    }}
                                    className="w-full text-[10px] uppercase tracking-widest font-black text-red-500 hover:text-red-700 hover:underline text-left mt-1"
                                  >
                                    ✕ Remover Protesto
                                  </button>
                                ) : (
                                  <div className="space-y-2">
                                    <input 
                                      type="date"
                                      disabled={!editingDebito.dataInscricaoDividaAtiva}
                                      value={tempProtestoDate}
                                      onChange={(e) => setTempProtestoDate(e.target.value)}
                                      className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-sans font-bold text-crb-navy focus:border-crb-purple disabled:opacity-40"
                                    />
                                    <button
                                      type="button"
                                      disabled={!editingDebito.dataInscricaoDividaAtiva}
                                      onClick={() => {
                                        if (!editingDebito.dataInscricaoDividaAtiva) {
                                          alert('Não é permitido marcar o envio ao cartório sem a data de inscrição em Dívida Ativa preenchida. Conforme a Resolução 259 do CFB, o débito deve estar previamente inscrito em Dívida Ativa.');
                                          return;
                                        }
                                        setEditingDebito({
                                          ...editingDebito,
                                          protestoEnviado: true,
                                          dataProtesto: tempProtestoDate || todayStr,
                                          protestoResponsavel: userData?.nome || userData?.email || 'Sistema'
                                        });
                                      }}
                                      title={!editingDebito.dataInscricaoDividaAtiva ? "Envio ao cartório requer prévia inscrição em Dívida Ativa (Res. 259 CFB)" : "Enviar débito para protesto em cartório"}
                                      className="w-full text-[10px] text-white bg-crb-navy hover:bg-[#112455] py-2 px-3 rounded-lg font-bold uppercase tracking-wider transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                      ✓ Registrar Protesto
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 4. COMUNICAÇÃO CADIN */}
                          <div className={cn(
                            "bg-white p-4 rounded-xl border flex flex-col justify-between space-y-3 shadow-xs",
                            editingDebito.cadinComunicado ? "border-indigo-200 bg-indigo-50/5" : "border-slate-100",
                            (!editingDebito.protestoEnviado && !isReadOnly) ? "opacity-60 bg-slate-50/50" : ""
                          )}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Clock size={14} className={editingDebito.cadinComunicado ? "text-indigo-600" : "text-slate-400"} />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                  4. Comunicação CADIN
                                </span>
                              </div>
                              {editingDebito.cadinComunicado ? (
                                <div className="mt-2 space-y-1">
                                  <span className="text-xs font-bold text-indigo-700 bg-indigo-100/60 px-2.5 py-1 rounded-md inline-block font-sans">
                                    Comunicado em: {editingDebito.dataCommunicationCadin || editingDebito.dataComunicacaoCadin ? (editingDebito.dataCommunicationCadin || editingDebito.dataComunicacaoCadin)!.split('-').reverse().join('/') : 'S/A'}
                                  </span>
                                  {editingDebito.comunicacaoCadinResponsavel && (
                                    <span className="text-[9px] text-slate-400 font-medium block tracking-tight">
                                      Resp: {editingDebito.comunicacaoCadinResponsavel}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">
                                  {editingDebito.protestoEnviado && diasRestantesProtesto > 0 ? (
                                    `Libera em: ${diasRestantesProtesto} dias (requer 180 dias de protesto).`
                                  ) : (
                                    "Comunicação que inicia o prazo de 75 dias para inclusão no CADIN."
                                  )}
                                </p>
                              )}

                              {/* Comunicação CADIN Attachments list */}
                              {editingDebito.anexos?.comunicacaoCadin && editingDebito.anexos.comunicacaoCadin.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Documentos:</span>
                                  {editingDebito.anexos.comunicacaoCadin.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                                      <span className="font-bold text-slate-600 truncate max-w-[120px] block" title={file.nome}>
                                        {file.nome}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openAttachment(file)}
                                          className="p-1 text-slate-500 hover:text-white hover:bg-crb-navy rounded transition-colors"
                                          title="Visualizar documento"
                                        >
                                          <Eye size={12} />
                                        </button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeStageAnexo('comunicacaoCadin', file.id)}
                                            className="p-1 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors"
                                            title="Excluir documento"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isReadOnly && editingDebito.cadinComunicado && (
                                <div className="mt-2 pt-1 border-t border-dashed border-slate-100">
                                  <label className="flex items-center justify-center gap-1 p-1.5 border border-dashed border-slate-200 hover:border-crb-purple rounded-lg cursor-pointer text-slate-500 hover:text-crb-purple transition-all text-center">
                                    <Plus size={12} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Novo Anexo</span>
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleStageFileUpload(e, 'comunicacaoCadin')}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>

                            {!isReadOnly && (
                              <div className="pt-1">
                                {editingDebito.cadinComunicado ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDebito({
                                        ...editingDebito,
                                        cadinComunicado: false,
                                        dataComunicacaoCadin: null,
                                        comunicacaoCadinResponsavel: null,
                                        cadinIncluido: false,
                                        dataCadin: null,
                                        cadinResponsavel: null
                                      });
                                    }}
                                    className="w-full text-[10px] uppercase tracking-widest font-black text-red-500 hover:text-red-700 hover:underline text-left mt-1"
                                  >
                                    ✕ Remover Comunicação
                                  </button>
                                ) : (
                                  <div className="space-y-2">
                                    <input 
                                      type="date"
                                      disabled={!editingDebito.protestoEnviado || diasRestantesProtesto > 0}
                                      value={tempCadinComunicacaoDate}
                                      onChange={(e) => setTempCadinComunicacaoDate(e.target.value)}
                                      className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-sans font-bold text-crb-navy focus:border-crb-purple disabled:opacity-40"
                                    />
                                    <button
                                      type="button"
                                      disabled={!editingDebito.protestoEnviado || diasRestantesProtesto > 0}
                                      onClick={() => {
                                        setEditingDebito({
                                          ...editingDebito,
                                          cadinComunicado: true,
                                          dataComunicacaoCadin: tempCadinComunicacaoDate || todayStr,
                                          comunicacaoCadinResponsavel: userData?.nome || userData?.email || 'Sistema'
                                        });
                                      }}
                                      title={!editingDebito.protestoEnviado ? "Comunicação CADIN só permitida após protesto" : diasRestantesProtesto > 0 ? `Aguardando completar 180 dias de protesto (${diasRestantesProtesto} dias restantes)` : "Registrar comunicação prévia ao devedor"}
                                      className="w-full text-[10px] text-white bg-crb-navy hover:bg-[#112455] py-2 px-3 rounded-lg font-bold uppercase tracking-wider transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                      ✓ Comunicar CADIN
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 5. CADIN */}
                          <div className={cn(
                            "bg-white p-4 rounded-xl border flex flex-col justify-between space-y-3 shadow-xs",
                            editingDebito.cadinIncluido ? "border-red-200 bg-red-50/5" : "border-slate-100",
                            (!editingDebito.cadinComunicado || diasRestantesComunicacao > 0 || isReadOnly) ? "opacity-60 bg-slate-50/50" : ""
                          )}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={14} className={editingDebito.cadinIncluido ? "text-red-600" : "text-slate-400"} />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                  5. CADIN
                                </span>
                              </div>
                              {editingDebito.cadinIncluido ? (
                                <div className="mt-2 space-y-1">
                                  <span className="text-xs font-bold text-red-700 bg-red-100/60 px-2.5 py-1 rounded-md inline-block font-sans">
                                    Incluso em: {editingDebito.dataCadin ? editingDebito.dataCadin.split('-').reverse().join('/') : 'S/A'}
                                  </span>
                                  {editingDebito.cadinResponsavel && (
                                    <span className="text-[9px] text-slate-400 font-medium block tracking-tight">
                                      Resp: {editingDebito.cadinResponsavel}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">
                                  {editingDebito.cadinComunicado && diasRestantesComunicacao > 0 ? (
                                    `Libera em: ${diasRestantesComunicacao} dias (requer 75 dias de comunicação).`
                                  ) : (
                                    "Inclusão efetiva no CADIN após 75 dias de comunicação prévia."
                                  )}
                                </p>
                              )}

                              {/* CADIN Attachments list */}
                              {editingDebito.anexos?.cadin && editingDebito.anexos.cadin.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Documentos:</span>
                                  {editingDebito.anexos.cadin.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                                      <span className="font-bold text-slate-600 truncate max-w-[120px] block" title={file.nome}>
                                        {file.nome}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openAttachment(file)}
                                          className="p-1 text-slate-500 hover:text-white hover:bg-crb-navy rounded transition-colors"
                                          title="Visualizar documento"
                                        >
                                          <Eye size={12} />
                                        </button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeStageAnexo('cadin', file.id)}
                                            className="p-1 text-red-500 hover:text-white hover:bg-red-500 rounded transition-colors"
                                            title="Excluir documento"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isReadOnly && editingDebito.cadinIncluido && (
                                <div className="mt-2 pt-1 border-t border-dashed border-slate-100">
                                  <label className="flex items-center justify-center gap-1 p-1.5 border border-dashed border-slate-200 hover:border-crb-purple rounded-lg cursor-pointer text-slate-500 hover:text-crb-purple transition-all text-center">
                                    <Plus size={12} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Novo Anexo</span>
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => handleStageFileUpload(e, 'cadin')}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>

                            {!isReadOnly && (
                              <div className="pt-1">
                                {editingDebito.cadinIncluido ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDebito({
                                        ...editingDebito,
                                        cadinIncluido: false,
                                        dataCadin: null,
                                        cadinResponsavel: null
                                      });
                                    }}
                                    className="w-full text-[10px] uppercase tracking-widest font-black text-red-500 hover:text-red-700 hover:underline text-left mt-1"
                                  >
                                    ✕ Remover do CADIN
                                  </button>
                                ) : (
                                  <div className="space-y-2">
                                    <input 
                                      type="date"
                                      disabled={!editingDebito.cadinComunicado || diasRestantesComunicacao > 0}
                                      value={tempCadinDate}
                                      onChange={(e) => setTempCadinDate(e.target.value)}
                                      className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-sans font-bold text-crb-navy focus:border-crb-purple disabled:opacity-40"
                                    />
                                    <button
                                      type="button"
                                      disabled={!editingDebito.cadinComunicado || diasRestantesComunicacao > 0}
                                      onClick={() => {
                                        setEditingDebito({
                                          ...editingDebito,
                                          cadinIncluido: true,
                                          dataCadin: tempCadinDate || todayStr,
                                          cadinResponsavel: userData?.nome || userData?.email || 'Sistema'
                                        });
                                      }}
                                      title={!editingDebito.cadinComunicado ? "CADIN só permitido após comunicação prévia" : diasRestantesComunicacao > 0 ? `Aguardando completar 75 dias de comunicação (${diasRestantesComunicacao} dias restantes)` : "Incluir registro de forma externa no CADIN"}
                                      className="w-full text-[10px] text-white bg-crb-navy hover:bg-[#112455] py-2 px-3 rounded-lg font-bold uppercase tracking-wider transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                      ✓ Registrar CADIN
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                        </div>
                      </div>

                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Observações Internas</label>
                  <textarea 
                    disabled={isReadOnly}
                    className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy h-24 resize-none disabled:opacity-70"
                    placeholder="Notas adicionais sobre este débito..."
                    value={editingDebito?.observacoes || ''}
                    onChange={(e) => setEditingDebito({...editingDebito!, observacoes: e.target.value})}
                  ></textarea>
                </div>

                  </div> {/* Fechamento do painel/coluna da esquerda */}

                  {/* COLUNA DIREITA: Linha do Tempo & Central de Anexos */}
                  {editingDebito?.id && (
                    <div className="w-full lg:w-[45%] p-6 md:p-8 space-y-6 overflow-y-auto bg-slate-50/50 flex flex-col h-full border-t lg:border-t-0 border-slate-200">
                      
                      {/* Tabs Header */}
                      <div className="flex bg-slate-200/50 p-1 rounded-2xl gap-1 w-full border border-slate-200 shadow-xs max-w-sm self-center lg:self-start shrink-0">
                        <button
                          type="button"
                          onClick={() => setModalTab('timeline')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider",
                            modalTab === 'timeline'
                              ? "bg-white text-crb-navy shadow-xs ring-1 ring-slate-100"
                              : "text-slate-500 hover:text-crb-navy"
                          )}
                        >
                          <History size={14} />
                          Linha do Tempo
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalTab('anexos')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider",
                            modalTab === 'anexos'
                              ? "bg-white text-crb-navy shadow-xs ring-1 ring-slate-100"
                              : "text-slate-500 hover:text-crb-navy"
                          )}
                        >
                          <Paperclip size={14} />
                          Anexos
                          {(() => {
                            const count = [
                              ...(editingDebito?.anexos?.notificacao || []),
                              ...(editingDebito?.anexos?.protesto || []),
                              ...(editingDebito?.anexos?.comunicacaoCadin || []),
                              ...(editingDebito?.anexos?.cadin || [])
                            ].length;
                            return count > 0 ? (
                              <span className="bg-crb-purple text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black">
                                {count}
                              </span>
                            ) : null;
                          })()}
                        </button>
                      </div>

                      {/* Content Panels */}
                      {modalTab === 'timeline' && (
                        <div className="flex-1 flex flex-col space-y-4">
                          <div className="flex flex-col">
                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <History size={16} className="text-crb-purple" />
                              Rastreabilidade & Linha do Tempo
                            </h4>
                            <p className="text-xs text-slate-550">
                              Histórico de auditoria, prazos regulamentares e documentos de instrução de cobrança.
                            </p>
                          </div>
                          
                          <div className="relative border-l-2 border-slate-200 pl-6 ml-3 space-y-6 py-2">
                            {/* 1. ORIGEM */}
                            <div className="relative">
                              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-100 border-2 border-slate-400 flex items-center justify-center shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-700 uppercase tracking-widest block">Lançamento do Débito</span>
                                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                    {editingDebito.updatedAt ? new Date(editingDebito.updatedAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-550 leading-relaxed font-semibold">
                                  Registro fiscal inicial do débito (Exercício {editingDebito.ano}) no valor de {formatCurrency(editingDebito.valor || 0)}.
                                </p>
                              </div>
                            </div>

                            {/* 2. NOTIFICACAO */}
                            <div className="relative">
                              <div className={cn(
                                "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-xs",
                                editingDebito.notificacaoEnviada ? "bg-emerald-50 border-2 border-emerald-500" : "bg-slate-50 border-2 border-slate-300"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  editingDebito.notificacaoEnviada ? "bg-emerald-500" : "bg-slate-300"
                                )}></span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-xs font-bold uppercase tracking-widest block", editingDebito.notificacaoEnviada ? "text-emerald-700" : "text-slate-500")}>
                                    1. Notificação de Débito
                                  </span>
                                  {editingDebito.notificacaoEnviada && (
                                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                                      {editingDebito.dataNotificacao ? editingDebito.dataNotificacao.split('-').reverse().join('/') : 'S/A'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-550 leading-relaxed font-semibold">
                                  {editingDebito.notificacaoEnviada 
                                    ? `Notificação regulamentar expedida pelo servidor ${editingDebito.notificacaoResponsavel || 'Sistema'}.`
                                    : "Pendente. Aguardando notificação oficial para abertura de 30 dias regulamentares."
                                  }
                                </p>
                                
                                {/* Notification attached files */}
                                {editingDebito.anexos?.notificacao && editingDebito.anexos.notificacao.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {editingDebito.anexos.notificacao.map((file) => (
                                      <div key={file.id} className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs transition-colors shadow-2xs">
                                        <div className="flex items-center gap-2 truncate">
                                          <FileText size={14} className="text-slate-400 shrink-0" />
                                          <div className="flex flex-col truncate">
                                            <span className="font-bold text-slate-700 truncate max-w-[150px]" title={file.nome}>
                                              {file.nome}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-medium">
                                              {file.tamanho ? `${(file.tamanho / 1024).toFixed(1)} KB` : 'S/A'} • {file.dataUpload ? new Date(file.dataUpload).toLocaleDateString('pt-BR') : 'Sem data'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          <button
                                            type="button"
                                            onClick={() => openAttachment(file)}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-crb-navy border border-slate-200 hover:border-crb-navy text-slate-500 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                            title="Visualizar documento"
                                          >
                                            <Eye size={12} />
                                            Abrir
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 2. DÍVIDA ATIVA */}
                            <div className="relative">
                              <div className={cn(
                                "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-xs",
                                (editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? "bg-amber-100 border-2 border-amber-500" : "bg-slate-50 border-2 border-slate-300"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  (editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? "bg-amber-500" : "bg-slate-300"
                                )}></span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-xs font-bold uppercase tracking-widest block", (editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) ? "text-amber-800" : "text-slate-500")}>
                                    2. Inscrição em Dívida Ativa
                                  </span>
                                  {(editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva) && (
                                    <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                      {editingDebito.dataInscricaoDividaAtiva ? editingDebito.dataInscricaoDividaAtiva.split('-').reverse().join('/') : 'S/A'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-555 leading-relaxed font-semibold">
                                  {(editingDebito.dividaAtivaInscrita || editingDebito.dataInscricaoDividaAtiva)
                                    ? `Inscrito em Dívida Ativa ${editingDebito.numeroCDA ? `(CDA: ${editingDebito.numeroCDA})` : ''} por ${editingDebito.dividaAtivaResponsavel || 'Sistema'}.`
                                    : "Pendente. Decorrido o prazo de 30 dias de notificação sem regularização, o débito é inscrito em Dívida Ativa antes do envio ao cartório."
                                  }
                                </p>
                                
                                {/* Divida Ativa attached files */}
                                {editingDebito.anexos?.dividaAtiva && editingDebito.anexos.dividaAtiva.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {editingDebito.anexos.dividaAtiva.map((file) => (
                                      <div key={file.id} className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs transition-colors shadow-2xs">
                                        <div className="flex items-center gap-2 truncate">
                                          <FileText size={14} className="text-slate-400 shrink-0" />
                                          <div className="flex flex-col truncate">
                                            <span className="font-bold text-slate-700 truncate max-w-[150px]" title={file.nome}>
                                              {file.nome}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-medium">
                                              {file.tamanho ? `${(file.tamanho / 1024).toFixed(1)} KB` : 'S/A'} • {file.dataUpload ? new Date(file.dataUpload).toLocaleDateString('pt-BR') : 'Sem data'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          <button
                                            type="button"
                                            onClick={() => openAttachment(file)}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-crb-navy border border-slate-200 hover:border-crb-navy text-slate-500 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                            title="Visualizar documento"
                                          >
                                            <Eye size={12} />
                                            Abrir
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 3. PROTESTO */}
                            <div className="relative">
                              <div className={cn(
                                "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-xs",
                                editingDebito.protestoEnviado ? "bg-purple-100 border-2 border-purple-500" : "bg-slate-50 border-2 border-slate-300"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  editingDebito.protestoEnviado ? "bg-purple-500" : "bg-slate-300"
                                )}></span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-xs font-bold uppercase tracking-widest block", editingDebito.protestoEnviado ? "text-purple-700" : "text-slate-500")}>
                                    3. Envio para Protesto
                                  </span>
                                  {editingDebito.protestoEnviado && (
                                    <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-md">
                                      {editingDebito.dataProtesto ? editingDebito.dataProtesto.split('-').reverse().join('/') : 'S/A'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-555 leading-relaxed font-semibold">
                                  {editingDebito.protestoEnviado 
                                    ? `Título encaminhado para protesto em cartório por ${editingDebito.protestoResponsavel || 'Sistema'}.`
                                    : "Pendente. Caso não haja impugnação ou pagamento, o débito é enviado para protesto extrajudicial."
                                  }
                                </p>
                                
                                {/* Protesto attached files */}
                                {editingDebito.anexos?.protesto && editingDebito.anexos.protesto.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {editingDebito.anexos.protesto.map((file) => (
                                      <div key={file.id} className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs transition-colors shadow-2xs">
                                        <div className="flex items-center gap-2 truncate">
                                          <FileText size={14} className="text-slate-400 shrink-0" />
                                          <div className="flex flex-col truncate">
                                            <span className="font-bold text-slate-700 truncate max-w-[150px]" title={file.nome}>
                                              {file.nome}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-medium">
                                              {file.tamanho ? `${(file.tamanho / 1024).toFixed(1)} KB` : 'S/A'} • {file.dataUpload ? new Date(file.dataUpload).toLocaleDateString('pt-BR') : 'Sem data'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          <button
                                            type="button"
                                            onClick={() => openAttachment(file)}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-crb-navy border border-slate-200 hover:border-crb-navy text-slate-500 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                            title="Visualizar documento"
                                          >
                                            <Eye size={12} />
                                            Abrir
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 4. COMUNICAÇÃO CADIN */}
                            <div className="relative">
                              <div className={cn(
                                "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-xs",
                                editingDebito.cadinComunicado ? "bg-indigo-100 border-2 border-indigo-500" : "bg-slate-50 border-2 border-slate-300"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  editingDebito.cadinComunicado ? "bg-indigo-500" : "bg-slate-300"
                                )}></span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-xs font-bold uppercase tracking-widest block", editingDebito.cadinComunicado ? "text-indigo-700" : "text-slate-500")}>
                                    4. Comunicação CADIN
                                  </span>
                                  {editingDebito.cadinComunicado && (
                                    <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                      {editingDebito.dataComunicacaoCadin ? editingDebito.dataComunicacaoCadin.split('-').reverse().join('/') : 'S/A'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-550 leading-relaxed font-semibold">
                                  {editingDebito.cadinComunicado 
                                    ? `Comunicação prévia de inclusão no CADIN devedores cadastrada por ${editingDebito.comunicacaoCadinResponsavel || 'Sistema'}.`
                                    : "Pendente. Notificação prévia obrigatória conferindo um prazo de tolerância legal de 75 dias."
                                  }
                                </p>
                                
                                {/* Comunicacao CADIN attached files */}
                                {editingDebito.anexos?.comunicacaoCadin && editingDebito.anexos.comunicacaoCadin.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {editingDebito.anexos.comunicacaoCadin.map((file) => (
                                      <div key={file.id} className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs transition-colors shadow-2xs">
                                        <div className="flex items-center gap-2 truncate">
                                          <FileText size={14} className="text-slate-400 shrink-0" />
                                          <div className="flex flex-col truncate">
                                            <span className="font-bold text-slate-700 truncate max-w-[150px]" title={file.nome}>
                                              {file.nome}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-medium">
                                              {file.tamanho ? `${(file.tamanho / 1024).toFixed(1)} KB` : 'S/A'} • {file.dataUpload ? new Date(file.dataUpload).toLocaleDateString('pt-BR') : 'Sem data'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          <button
                                            type="button"
                                            onClick={() => openAttachment(file)}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-crb-navy border border-slate-200 hover:border-crb-navy text-slate-500 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                            title="Visualizar documento"
                                          >
                                            <Eye size={12} />
                                            Abrir
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 5. CADIN INCLUIDO */}
                            <div className="relative">
                              <div className={cn(
                                "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-xs",
                                editingDebito.cadinIncluido ? "bg-red-100 border-2 border-red-500" : "bg-slate-50 border-2 border-slate-300"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  editingDebito.cadinIncluido ? "bg-red-500" : "bg-slate-300"
                                )}></span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-xs font-bold uppercase tracking-widest block", editingDebito.cadinIncluido ? "text-red-700" : "text-slate-500")}>
                                    5. Cadastro no CADIN Efetivado
                                  </span>
                                  {editingDebito.cadinIncluido && (
                                    <span className="text-[10px] font-mono font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md">
                                      {editingDebito.dataCadin ? editingDebito.dataCadin.split('-').reverse().join('/') : 'S/A'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-550 leading-relaxed font-semibold">
                                  {editingDebito.cadinIncluido 
                                    ? `Inscrição ativa finalizada no banco de dados do CADIN pelo responsável ${editingDebito.cadinResponsavel || 'Sistema'}.`
                                    : "Pendente. Registro formal de inadimplência no Cadastro Informativo após 75 dias de notificação prévia."
                                  }
                                </p>
                                
                                {/* CADIN attached files */}
                                {editingDebito.anexos?.cadin && editingDebito.anexos.cadin.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {editingDebito.anexos.cadin.map((file) => (
                                      <div key={file.id} className="flex items-center justify-between p-2 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs transition-colors shadow-2xs">
                                        <div className="flex items-center gap-2 truncate">
                                          <FileText size={14} className="text-slate-400 shrink-0" />
                                          <div className="flex flex-col truncate">
                                            <span className="font-bold text-slate-700 truncate max-w-[150px]" title={file.nome}>
                                              {file.nome}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-medium">
                                              {file.tamanho ? `${(file.tamanho / 1024).toFixed(1)} KB` : 'S/A'} • {file.dataUpload ? new Date(file.dataUpload).toLocaleDateString('pt-BR') : 'Sem data'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          <button
                                            type="button"
                                            onClick={() => openAttachment(file)}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-crb-navy border border-slate-200 hover:border-crb-navy text-slate-500 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                                            title="Visualizar documento"
                                          >
                                            <Eye size={12} />
                                            Abrir
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 6. PAGAMENTO OU ACORDO */}
                            {editingDebito.statusGeral === 'Pago' && editingDebito.pagamento && (
                              <div className="relative">
                                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest block text-emerald-700">
                                      {editingDebito.pagamento.parcelas > 1 ? "Acordo registrado" : "Pagamento realizado"}
                                    </span>
                                    {editingDebito.pagamento.data && (
                                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                                        {editingDebito.pagamento.data.split('-').reverse().join('/')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-555 leading-relaxed font-semibold">
                                    {editingDebito.pagamento.parcelas > 1 
                                      ? "Acordo / Negociação"
                                      : "Pagamento do débito concluído e homologado."}
                                  </p>
                                  <div className="bg-emerald-50/50 border border-emerald-100/60 rounded-xl p-3 text-xs space-y-1.5 font-sans mt-2">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500 font-medium">Forma de Pagamento:</span>
                                      <span className="font-bold text-slate-700">{editingDebito.pagamento.formaPagamento}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500 font-medium">Parcelas:</span>
                                      <span className="font-bold text-slate-700">{editingDebito.pagamento.parcelas}x</span>
                                    </div>
                                    <div className="flex justify-between border-t border-emerald-100/40 pt-1.5 mt-1.5 font-bold">
                                      <span className="text-slate-600 font-bold">Valor do Débito:</span>
                                      <span className="text-emerald-750 font-extrabold">{formatCurrency(editingDebito.valorCorrigido || editingDebito.valor || 0)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                          </div>
                        </div>
                      )}

                      {modalTab === 'anexos' && (
                        <div className="flex-1 flex flex-col space-y-4">
                          <div className="flex flex-col">
                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Paperclip size={16} className="text-crb-purple" />
                              Central de Documentos do Fluxo
                            </h4>
                            <p className="text-xs text-slate-500">
                              Gerenciamento, download e visualização de todos os anexos organizados por etapa legal de cobrança.
                            </p>
                          </div>
                          
                          {(() => {
                            const docs: { stageName: string; key: string; files: any[] }[] = [
                              { stageName: '1. Notificação de Débito', key: 'notificacao', files: editingDebito?.anexos?.notificacao || [] },
                              { stageName: '2. Inscrição em Dívida Ativa', key: 'dividaAtiva', files: editingDebito?.anexos?.dividaAtiva || [] },
                              { stageName: '3. Envio para Protesto', key: 'protesto', files: editingDebito?.anexos?.protesto || [] },
                              { stageName: '4. Comunicação CADIN', key: 'comunicacaoCadin', files: editingDebito?.anexos?.comunicacaoCadin || [] },
                              { stageName: '5. Registro no CADIN', key: 'cadin', files: editingDebito?.anexos?.cadin || [] }
                            ];
                            const totalUploaded = docs.reduce((acc, curr) => acc + curr.files.length, 0);

                            if (totalUploaded === 0) {
                              return (
                                <div className="p-12 border border-slate-200 border-dashed rounded-3xl text-center bg-white/50 flex flex-col items-center justify-center space-y-2">
                                  <Paperclip size={32} className="text-slate-300 shadow-3xs" />
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Nenhum Documento Vinculado</span>
                                  <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                                    Adicione documentos e comprovantes fiscais diretamente a cada uma das etapas do fluxo de cobrança à esquerda para auditar esta conta.
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <div className="space-y-4 flex-1">
                                {docs.map((stageBlock) => {
                                  if (stageBlock.files.length === 0) return null;
                                  return (
                                    <div key={stageBlock.key} className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-sans block">
                                          {stageBlock.stageName}
                                        </span>
                                        <span className="bg-slate-200 text-slate-600 text-[9px] px-2 py-0.5 rounded-full font-bold">
                                          {stageBlock.files.length} {stageBlock.files.length === 1 ? 'arquivo' : 'arquivos'}
                                        </span>
                                      </div>
                                      
                                      <div className="space-y-2">
                                        {stageBlock.files.map((file) => (
                                          <div key={file.id} className="p-3 bg-white border border-slate-200/60 rounded-xl hover:border-slate-300 transition-all flex items-center justify-between text-xs shadow-3xs">
                                            <div className="flex items-start gap-3 truncate max-w-[70%]">
                                              <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg shrink-0 text-slate-500 mt-0.5 shadow-2xs">
                                                <FileText size={16} />
                                              </div>
                                              <div className="flex flex-col truncate">
                                                <span className="font-extrabold text-slate-700 truncate" title={file.nome}>
                                                  {file.nome}
                                                </span>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 font-medium mt-0.5">
                                                  <span>{file.tamanho ? `${(file.tamanho / 1024).toFixed(1)} KB` : 'Ficheiro'}</span>
                                                  <span>•</span>
                                                  <span>Uploaded: {file.dataUpload ? new Date(file.dataUpload).toLocaleDateString('pt-BR') : 'Sem data'}</span>
                                                  {file.usuarioUpload && (
                                                    <>
                                                      <span>•</span>
                                                      <span className="truncate max-w-[100px]" title={file.usuarioUpload}>Por {file.usuarioUpload}</span>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => openAttachment(file)}
                                                className="p-1 px-2.5 bg-crb-navy/5 text-crb-navy hover:bg-crb-navy hover:text-white rounded-lg transition-colors text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                                                title="Visualizar documento"
                                              >
                                                <Eye size={12} />
                                                <span>Abrir</span>
                                              </button>
                                              {!isReadOnly && (
                                                <button
                                                  type="button"
                                                  onClick={() => removeStageAnexo(stageBlock.key as any, file.id)}
                                                  className="p-1.5 text-red-500 hover:text-white hover:bg-red-500 hover:border-red-500 rounded-lg transition-colors border border-slate-200 bg-slate-50 shadow-2xs"
                                                  title="Excluir documento"
                                                >
                                                  <Trash2 size={12} />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                    </div>
                  )}

                </div> {/* Fechamento do painel flex container (esquerda + direita) */}

                <div className="p-6 md:px-8 bg-slate-50 border-t border-slate-200 flex gap-4 shrink-0">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-200 text-slate-600 bg-white font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs"
                  >
                    {isReadOnly ? 'Fechar' : 'Cancelar'}
                  </button>
                  {!isReadOnly && (
                    <button 
                      type="submit"
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 bg-crb-purple text-white px-6 py-4 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold uppercase tracking-widest text-xs disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Save size={18} className="text-white" />
                      )}
                      {saving ? 'Processando...' : 'Confirmar e Salvar'}
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {activeView === 'lista' ? (
        <>
          {/* Filters */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por Nome, Razão Social ou CRB..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all placeholder:text-slate-400 font-medium"
            />
          </div>
          <button 
            onClick={() => fetchDebitos(true)}
            className="flex items-center gap-2 px-5 py-3 border border-slate-200 bg-white text-crb-navy hover:bg-slate-50 hover:border-crb-purple rounded-xl font-bold text-sm tracking-wide transition-all cursor-pointer shadow-xs"
            title="Atualizar dados do exercício (ignorar cache)"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-crb-purple" : "text-crb-navy"} />
            <span>Atualizar</span>
          </button>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 border rounded-xl font-bold text-sm tracking-wide transition-all cursor-pointer",
              showFilters ? "bg-crb-navy text-white border-crb-navy" : "bg-white text-crb-navy border-slate-200 hover:border-crb-purple hover:bg-slate-50"
            )}
          >
            <Filter size={18} className={showFilters ? "text-white" : "text-crb-navy"} />
            Filtros Avançados
          </button>
        </div>

        {(!searchAno || searchAno === 'todos') && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-xl flex items-center gap-2.5 font-medium">
            <AlertTriangle size={16} className="text-amber-700 shrink-0" />
            <span>Atenção: A consulta em "Todos os anos" consome mais leituras da cota diária do Firebase. Prefira filtrar por exercício específico. Paginação limitada a 50 registros por página.</span>
          </div>
        )}

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden grid grid-cols-1 md:grid-cols-4 gap-6 pt-6 border-t border-slate-100"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Número do CRB</label>
                <input 
                  type="text" 
                  value={searchCRB}
                  onChange={(e) => setSearchCRB(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crb-purple focus:border-crb-navy transition-all font-medium" 
                  placeholder="Ex: PE-00000"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exercício (Ano)</label>
                <select 
                  value={searchAno}
                  onChange={(e) => { setSearchAno(e.target.value); setPage(1); }}
                  className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-xl outline-none focus:ring-2 focus:ring-crb-purple focus:border-crb-navy transition-all font-bold text-xs text-crb-navy cursor-pointer"
                >
                  <option value={CURRENT_YEAR.toString()}>{CURRENT_YEAR} (Exercício Atual)</option>
                  <option value={(CURRENT_YEAR - 1).toString()}>{CURRENT_YEAR - 1}</option>
                  <option value={(CURRENT_YEAR - 2).toString()}>{CURRENT_YEAR - 2}</option>
                  <option value={(CURRENT_YEAR - 3).toString()}>{CURRENT_YEAR - 3}</option>
                  <option value={(CURRENT_YEAR - 4).toString()}>{CURRENT_YEAR - 4}</option>
                  <option value={(CURRENT_YEAR - 5).toString()}>{CURRENT_YEAR - 5}</option>
                  <option value="todos">Todos os anos (maior consumo)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fase do Fluxo</label>
                <select
                  value={filterFase}
                  onChange={(e) => setFilterFase(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-xl outline-none focus:ring-2 focus:ring-crb-purple focus:border-crb-navy transition-all font-bold text-xs text-crb-navy"
                >
                  <option value="">Todas as Fases</option>
                  <option value="Aguardando Notificação">Aguardando Notificação</option>
                  <option value="Notificação">Notificação</option>
                  <option value="Dívida Ativa">Dívida Ativa</option>
                  <option value="Protesto">Protesto</option>
                  <option value="Comunicação CADIN">Comunicação CADIN</option>
                  <option value="Aguardando inclusão CADIN">Aguardando inclusão CADIN</option>
                  <option value="CADIN">CADIN</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Situação do Prazo</label>
                <select
                  value={filterPrazo}
                  onChange={(e) => setFilterPrazo(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-xl outline-none focus:ring-2 focus:ring-crb-purple focus:border-crb-navy transition-all font-bold text-xs text-crb-navy"
                >
                  <option value="">Todas</option>
                  <option value="Em prazo">No Prazo</option>
                  <option value="Vencido">Em Atraso / Vencido</option>
                  <option value="Concluído">Concluído</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-crb-navy text-white">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">CRB</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Nome/Razão Social</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Exercício</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Fase do Fluxo</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Status do Prazo</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Valor Corrigido</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Situação</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-crb-navy border-t-crb-purple rounded-full animate-spin"></div>
                      <span className="text-sm font-bold text-slate-400 uppercase tracking-widest font-sans">Sincronizando com Base de Dados...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                       <Search size={40} className="text-slate-200 mb-2" />
                       <span className="text-lg font-serif font-bold text-slate-400">Nenhum registro encontrado</span>
                       <p className="text-sm text-slate-400 font-medium">Tente ajustar seus critérios de busca ou filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => {
                  const statusInfo = getStatusDebito(item, notifications);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-5 text-sm font-bold text-crb-navy">{item.crb}</td>
                      <td className="px-8 py-5 text-sm text-slate-700 font-bold uppercase tracking-tight">{item.nome}</td>
                      <td className="px-8 py-5">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">{item.ano}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="font-serif font-black text-crb-navy text-xs">{statusInfo.fase}</span>
                        {item.numeroCDA && (
                          <span className="text-[9px] font-mono font-bold text-amber-800 block mt-0.5">
                            CDA: {item.numeroCDA}
                          </span>
                        )}
                        {statusInfo.aviso && (
                          <span className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-800 block w-fit" title={statusInfo.aviso}>
                            ⚠️ {statusInfo.aviso}
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider w-fit border",
                            statusInfo.prazo === 'CONCLUÍDO' 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : statusInfo.prazo === 'VENCIDO' 
                                ? "bg-red-50 text-red-700 border-red-200" 
                                : statusInfo.prazo === 'EM PRAZO' && statusInfo.dias <= 7 && statusInfo.dias > 0
                                  ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {statusInfo.prazo}
                          </span>
                          {statusInfo.prazo !== 'CONCLUÍDO' && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              {statusInfo.prazo === 'VENCIDO' ? (statusInfo.dias > 0 ? `Atraso: ${statusInfo.dias}d` : 'Vencido') : (statusInfo.temDataReal && statusInfo.dias > 0 ? `${statusInfo.dias}d rest.` : '-')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-sm font-serif font-bold text-crb-navy">{formatCurrency(item.valorCorrigido || item.valor)}</td>
                      <td className="px-8 py-5">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm inline-block max-w-[220px] truncate text-center",
                          statusInfo.isPago 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : statusInfo.isNegociacao
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : statusInfo.prazo === 'VENCIDO'
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                        )} title={statusInfo.situacao}>
                          {statusInfo.situacao}
                        </span>
                        {item.statusGeral === 'Em Negociação' && item.negociacao && (
                          <div className="text-[10px] text-slate-500 mt-1 font-sans font-semibold">
                            {item.negociacao.formaPagamento} ({item.negociacao.parcelas}x)
                          </div>
                        )}
                        {item.statusGeral === 'Pago' && item.pagamento && (
                          <div className="text-[10px] text-emerald-600 mt-1 font-sans font-bold">
                            {item.pagamento.formaPagamento} ({item.pagamento.parcelas}x)
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                      {isAdmin && (
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                          <button 
                            onClick={() => {
                              console.log('Botão Editar clicado para o ID:', item.id);
                              setEditingDebito(item);
                              setIsReadOnly(false);
                              setIsModalOpen(true);
                            }} 
                            className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs"
                            title="Editar Registro"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={async () => {
                              console.log("Excluir clicado para o ID:", item.id);

                              const confirmar = window.confirm("Deseja realmente excluir este débito?");
                              if (!confirmar) return;

                              try {
                                await deleteDoc(doc(db, "debits", item.id));
                                console.log("Excluído do Firestore com sucesso");
                                
                                // Atualização imediata da UI
                                clearSessionCache('debitos_');
                                setDebitos(prev => prev.filter(d => d.id !== item.id));
                                alert("Débito excluído com sucesso");
                                
                                await logAuditoria('EXCLUSAO', 'DEBITOS', item.id);
                              } catch (error: any) {
                                console.error("Erro detalhado ao excluir:", error);
                                alert("Erro ao excluir: " + (error.message || 'Erro desconhecido. Verifique permissões.'));
                                handleFirestoreError(error, OperationType.DELETE, "debits");
                              }
                            }}
                            className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs"
                            title="Excluir Débito"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button 
                            onClick={() => {
                              console.log('Botão Visualizar clicado para o ID:', item.id);
                              setEditingDebito(item);
                              setIsReadOnly(true);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-400 rounded-lg transition-all border border-slate-100 shadow-xs"
                            title="Visualizar"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Exibindo {filteredData.length} de {debitos.length} registros</span>
          <div className="flex gap-3">
            <button 
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl bg-white text-crb-navy hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all font-bold text-xs" 
              disabled={page === 1}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl bg-white text-crb-navy hover:bg-slate-50 disabled:opacity-30 transition-all font-bold text-xs">
              Próximo
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      </>
      ) : (
        <TaskPanel
          debitos={debitos}
          notifications={notifications}
          onRefresh={fetchDebitos}
          onViewDetails={(debito) => {
            setEditingDebito(debito);
            setIsReadOnly(true);
            setIsModalOpen(true);
          }}
          onEditDetails={(debito) => {
            setEditingDebito(debito);
            setIsReadOnly(false);
            setIsModalOpen(true);
          }}
        />
      )}
    </div>
  );
}
