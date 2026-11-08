import React, { useState } from 'react';
import { Debito, Notificacao } from '../types';
import { getStatusDebito, parseDateSafely } from '../lib/statusDebito';
import { 
  Clock, 
  Calendar, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  Eye, 
  CheckSquare, 
  Search, 
  Filter, 
  AlertCircle,
  PlaySquare,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Archive,
  ArrowUpRight,
  X,
  FileCheck
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { updateDoc, doc } from 'firebase/firestore';
import { db, logAuditoria } from '../lib/firebase';

interface TaskPanelProps {
  debitos: Debito[];
  notifications: Notificacao[];
  onRefresh: () => Promise<void>;
  onViewDetails: (debito: Debito) => void;
  onEditDetails: (debito: Debito) => void;
}

type TaskTab = 'atrasadas' | 'proximas' | 'emprazo';

interface TaskItem {
  id: string;
  debito: Debito;
  fase: string;
  acaoDesc: string;
  acaoTipo: 'notificar' | 'divida_ativa' | 'protesto' | 'comunicar' | 'incluir' | 'aguardar';
  dataInicioFormatada: string;
  prazoFinalFormatada: string;
  temDataReal: boolean;
  prazo: 'EM PRAZO' | 'VENCIDO' | 'CONCLUÍDO';
  dias: number;
  situacao: string;
  isCritico: boolean;
  aviso?: string;
  semInscricaoDividaAtiva?: boolean;
}

export default function TaskPanel({ 
  debitos, 
  notifications, 
  onRefresh, 
  onViewDetails, 
  onEditDetails 
}: TaskPanelProps) {
  const [activeTab, setActiveTab] = useState<TaskTab>('atrasadas');
  const [searchTerm, setSearchTerm] = useState('');
  const [executingTask, setExecutingTask] = useState<TaskItem | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [inputCDA, setInputCDA] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter unpaid/pending debits using central business status logic
  const tasks = debitos.reduce<TaskItem[]>((acc, debito) => {
    const info = getStatusDebito(debito, notifications);

    if (info.isPago || info.prazo === 'CONCLUÍDO') return acc;
    if (info.fase === 'CADIN') return acc;

    acc.push({
      id: debito.id,
      debito,
      fase: info.fase,
      acaoDesc: info.acaoRecomendada,
      acaoTipo: (info.acaoTipo === 'nenhuma' ? 'aguardar' : info.acaoTipo) as any,
      dataInicioFormatada: info.dataInicioFormatada,
      prazoFinalFormatada: info.prazoFinalFormatado,
      temDataReal: info.temDataReal,
      prazo: info.prazo,
      dias: info.dias,
      situacao: info.situacao,
      isCritico: info.isCritico,
      aviso: info.aviso,
      semInscricaoDividaAtiva: info.semInscricaoDividaAtiva
    });

    return acc;
  }, []);

  // Classify tasks into Categories: ATRASADAS, PRÓXIMAS (<= 7 dias), EM PRAZO
  const classifiedTasks = tasks.reduce<{
    atrasadas: TaskItem[];
    proximas: TaskItem[];
    emprazo: TaskItem[];
  }>((groups, task) => {
    const isOverdue = task.prazo === 'VENCIDO';
    const isNear = !isOverdue && task.dias > 0 && task.dias <= 7;

    if (isOverdue) {
      groups.atrasadas.push(task);
    } else if (isNear) {
      groups.proximas.push(task);
    } else {
      groups.emprazo.push(task);
    }

    return groups;
  }, { atrasadas: [], proximas: [], emprazo: [] });

  // Get current active list and search filter
  const currentList = classifiedTasks[activeTab].filter(task => {
    const term = searchTerm.toLowerCase();
    return (
      task.debito.nome.toLowerCase().includes(term) ||
      task.debito.crb.toLowerCase().includes(term) ||
      task.debito.ano.toString().includes(term)
    );
  });

  // Handle direct action save
  const handleExecuteDirectAction = async () => {
    if (!executingTask) return;
    setSubmitting(true);

    try {
      const debtRef = doc(db, 'debits', executingTask.debito.id);
      let updatedFields: Partial<Debito> = {};
      let actionLog = '';

      switch (executingTask.acaoTipo) {
        case 'notificar':
          updatedFields = {
            notificacaoEnviada: true,
            dataNotificacao: selectedDate
          };
          actionLog = 'NOTIFICACAO_REGISTRADA';
          break;
        case 'divida_ativa':
          updatedFields = {
            dividaAtivaInscrita: true,
            dataInscricaoDividaAtiva: selectedDate,
            ...(inputCDA.trim() ? { numeroCDA: inputCDA.trim() } : {})
          };
          actionLog = 'INSCRICAO_DIVIDA_ATIVA_REGISTRADA';
          break;
        case 'protesto':
          if (!executingTask.debito.dataInscricaoDividaAtiva) {
            alert('Não é permitido marcar o envio ao cartório sem a data de inscrição em Dívida Ativa preenchida. Conforme a Resolução 259 do CFB, o débito deve estar previamente inscrito em Dívida Ativa.');
            setSubmitting(false);
            return;
          }
          updatedFields = {
            protestoEnviado: true,
            dataProtesto: selectedDate
          };
          actionLog = 'PROTESTO_REGISTRADO';
          break;
        case 'comunicar':
          updatedFields = {
            cadinComunicado: true,
            dataComunicacaoCadin: selectedDate
          };
          actionLog = 'COMUNICACAO_CADIN_REGISTRADA';
          break;
        case 'incluir':
          updatedFields = {
            cadinIncluido: true,
            dataCadin: selectedDate
          };
          actionLog = 'CADIN_INCLUSAO_REGISTRADA';
          break;
        default:
          alert('Esta é uma tarefa de monitoramento aguardando o prazo finalizar.');
          setSubmitting(false);
          return;
      }

      await updateDoc(debtRef, {
        ...updatedFields,
        updatedAt: new Date().toISOString()
      });

      await logAuditoria('EDICAO', 'DEBITOS', executingTask.debito.id);
      alert('Ação registrada com sucesso!');
      setExecutingTask(null);
      await onRefresh();
    } catch (err) {
      console.error("Erro ao salvar ação direta de cobrança:", err);
      alert('Erro ao registrar a ação operada.');
    } finally {
      setSubmitting(false);
    }
  };

  // Setup visual guides for actions
  const getActionConfig = (type: string) => {
    switch (type) {
      case 'notificar':
        return {
          badge: 'Notificar Devedor',
          color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/50',
          badgeStyle: 'bg-indigo-100 text-indigo-800'
        };
      case 'divida_ativa':
        return {
          badge: 'Inscrever em Dívida Ativa',
          color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100/50',
          badgeStyle: 'bg-amber-100 text-amber-900'
        };
      case 'protesto':
        return {
          badge: 'Enviar a Protesto',
          color: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100/50',
          badgeStyle: 'bg-rose-100 text-rose-800'
        };
      case 'comunicar':
        return {
          badge: 'Comunicar CADIN',
          color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100/50',
          badgeStyle: 'bg-purple-100 text-purple-800'
        };
      case 'incluir':
        return {
          badge: 'Incluir no CADIN',
          color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/50',
          badgeStyle: 'bg-amber-100 text-amber-800'
        };
      default:
        return {
          badge: 'Aguardar Decurso',
          color: 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/30',
          badgeStyle: 'bg-slate-100 text-slate-600'
        };
    }
  };

  return (
    <div className="space-y-8">
      {/* Visual Header */}
      <div className="bg-gradient-to-r from-crb-navy to-crb-purple rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="p-1 px-2.5 bg-white/20 rounded-md text-[10px] font-black uppercase tracking-wider">Módulo Operacional</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></div>
          </div>
          <h3 className="text-xl md:text-2xl font-serif font-black tracking-tight">Painel de Tarefas de Cobrança</h3>
          <p className="text-xs md:text-sm text-white/70 font-sans font-bold italic mt-1 leading-relaxed">
            Identificação inteligente de ações recomendadas no fluxo de débitos do conselho.
          </p>
        </div>
        
        {/* Search Bar Inline */}
        <div className="relative max-w-sm w-full md:w-80">
          <input
            type="text"
            placeholder="Buscar por profissional ou CRB..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/50 border border-white/20 pl-10 pr-4 py-3 rounded-2xl outline-none focus:bg-white focus:text-crb-navy focus:placeholder-slate-400 font-bold text-xs tracking-tight transition-all"
          />
          <Search size={16} className="absolute left-3.5 top-3.5 text-white/40" />
        </div>
      </div>

      {/* Metrics Top Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overdue card */}
        <button
          onClick={() => setActiveTab('atrasadas')}
          className={cn(
            "p-6 rounded-3xl border text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-40 shadow-sm",
            activeTab === 'atrasadas'
              ? "bg-red-50 border-red-200 text-red-950 shadow-md scale-[1.02] ring-2 ring-red-300/30"
              : "bg-white border-slate-200 hover:border-red-200/50 hover:bg-slate-50/50"
          )}
        >
          <div className="flex justify-between items-start w-full">
            <div className="p-2.5 bg-red-100 text-red-700 rounded-xl">
              <AlertTriangle size={20} />
            </div>
            {activeTab === 'atrasadas' && <div className="text-[10px] bg-red-200 text-red-900 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Ativo</div>}
          </div>
          <div>
            <p className="text-[11px] font-black text-red-600 uppercase tracking-widest leading-none">Ações Atrasadas / Críticas</p>
            <h4 className="text-3xl font-serif font-black mt-2">{classifiedTasks.atrasadas.length}</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Requer providência manual imediata</p>
          </div>
        </button>

        {/* Near card */}
        <button
          onClick={() => setActiveTab('proximas')}
          className={cn(
            "p-6 rounded-3xl border text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-40 shadow-sm",
            activeTab === 'proximas'
              ? "bg-amber-50 border-amber-200 text-amber-950 shadow-md scale-[1.02] ring-2 ring-amber-300/30"
              : "bg-white border-slate-200 hover:border-amber-200/50 hover:bg-slate-50/50"
          )}
        >
          <div className="flex justify-between items-start w-full">
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
              <Clock size={20} />
            </div>
            {activeTab === 'proximas' && <div className="text-[10px] bg-amber-200 text-amber-900 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Ativo</div>}
          </div>
          <div>
            <p className="text-[11px] font-black text-amber-600 uppercase tracking-widest leading-none">Próximos Prazos (até 7 dias)</p>
            <h4 className="text-3xl font-serif font-black mt-2">{classifiedTasks.proximas.length}</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Monitoramento preventivo e envio</p>
          </div>
        </button>

        {/* Regular card */}
        <button
          onClick={() => setActiveTab('emprazo')}
          className={cn(
            "p-6 rounded-3xl border text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-40 shadow-sm",
            activeTab === 'emprazo'
              ? "bg-indigo-50 border-indigo-200 text-indigo-950 shadow-md scale-[1.02] ring-2 ring-indigo-300/30"
              : "bg-white border-slate-200 hover:border-indigo-200/50 hover:bg-slate-50/50"
          )}
        >
          <div className="flex justify-between items-start w-full">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <CheckCircle2 size={20} />
            </div>
            {activeTab === 'emprazo' && <div className="text-[10px] bg-indigo-200 text-indigo-900 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Ativo</div>}
          </div>
          <div>
            <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest leading-none">Fluxos em Prazo</p>
            <h4 className="text-3xl font-serif font-black mt-2">{classifiedTasks.emprazo.length}</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Ações planejadas no cronograma</p>
          </div>
        </button>
      </div>

      {/* Task Listing */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Filter size={12} />
            Listagem de Tarefas ({currentList.length}) ({activeTab.toUpperCase()})
          </h4>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence mode="popLayout">
            {currentList.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white border border-slate-150 p-16 text-center rounded-3xl flex flex-col items-center justify-center gap-3"
              >
                <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center border border-slate-100">
                  <Archive size={20} />
                </div>
                <h5 className="font-serif font-black text-slate-700 text-base">Nenhum débito nesta categoria</h5>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed font-medium">
                  Excelente trabalho! Atualmente não existem registros que necessitem desta ação operacional ou com prazos associados.
                </p>
              </motion.div>
            ) : (
              currentList.map((task) => {
                const config = getActionConfig(task.acaoTipo);
                return (
                  <motion.div
                    layout
                    key={task.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "bg-white p-6 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6",
                      activeTab === 'atrasadas' && "border-l-4 border-l-red-500",
                      activeTab === 'proximas' && "border-l-4 border-l-amber-500",
                      activeTab === 'emprazo' && "border-l-4 border-l-indigo-400"
                    )}
                  >
                    {/* Left: Professional details */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-serif font-black text-crb-navy">{task.debito.nome}</span>
                        <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-600 rounded-md">
                          {task.debito.crb}
                        </span>
                        <span className="text-xs font-bold text-slate-400">/{task.debito.ano}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
                        <p className="font-bold">
                          Origem: <span className="text-crb-navy">{task.debito.nomeDebito || 'Anuidade'}</span>
                        </p>
                        <p className="font-bold text-rose-600">
                          Valor Corrigido: <span className="font-mono">{formatCurrency(task.debito.valorCorrigido || task.debito.valor)}</span>
                        </p>
                        <p className="font-bold flex items-center gap-1 mt-0.5">
                          Fase atual: <span className="text-crb-navy font-black">{task.fase}</span>
                        </p>
                        <p className="font-bold flex items-center gap-1 mt-0.5">
                          Estágio iniciado em: <span className="text-slate-600 font-sans">{task.dataInicioFormatada}</span>
                        </p>
                        {task.debito.numeroCDA && (
                          <p className="font-bold flex items-center gap-1 mt-0.5">
                            CDA: <span className="text-amber-800 font-mono font-bold">{task.debito.numeroCDA}</span>
                          </p>
                        )}
                        {task.aviso && (
                          <div className="col-span-1 md:col-span-2 mt-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 inline-flex items-center gap-1">
                              ⚠️ {task.aviso}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle: Recommended Action / Timers */}
                    <div className="flex flex-col gap-1 items-start lg:items-end w-full lg:w-fit shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider",
                          config.badgeStyle
                        )}>
                          RECOMENDADO: {config.badge}
                        </span>
                      </div>
                      
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        {task.prazo === 'VENCIDO' ? (
                          <span className="text-red-600 font-black flex items-center gap-1 bg-red-50 border border-red-100 px-2 py-0.5 rounded">
                            <ShieldAlert size={12} /> {task.dias > 0 ? `Atrasado há ${task.dias} dia(s)` : 'Prazo regulamentar esgotado'}
                          </span>
                        ) : task.dias > 0 && task.temDataReal ? (
                          <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded">
                            Prazo regulamentar: {task.dias} dia(s) restante(s)
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                            Apto para execução
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Quick action buttons */}
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-fit shrink-0 pt-4 lg:pt-0 border-t border-slate-100 lg:border-none">
                      <button
                        onClick={() => onViewDetails(task.debito)}
                        className="flex-1 lg:flex-none p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-crb-navy rounded-xl transition-all font-bold text-xs flex items-center justify-center gap-1"
                        title="Ver Ficha Completa"
                      >
                        <Eye size={14} />
                        Detalhe
                      </button>

                      {task.acaoTipo !== 'aguardar' ? (
                        <button
                          onClick={() => {
                            setExecutingTask(task);
                            setSelectedDate(new Date().toISOString().split('T')[0]);
                            setInputCDA(task.debito.numeroCDA || '');
                          }}
                          className={cn(
                            "flex-1 lg:flex-none p-2.5 border rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all text-white bg-crb-navy hover:bg-[#152e6c] border-transparent"
                          )}
                        >
                          <PlaySquare size={14} />
                          Executar Ação
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex-1 lg:flex-none p-2.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                        >
                          <Clock size={14} />
                          Prazo Correndo
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Action Modal Overlay */}
      <AnimatePresence>
        {executingTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-crb-navy to-crb-purple p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl text-white">
                    <FileCheck size={20} />
                  </div>
                  <div>
                    <h5 className="font-serif font-black text-sm">Registrar Ação Cobrança</h5>
                    <p className="text-[10px] text-white/75 font-bold uppercase tracking-widest">{executingTask.acaoDesc}</p>
                  </div>
                </div>
                <button
                  onClick={() => setExecutingTask(null)}
                  className="p-1 text-white/70 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl text-xs space-y-1 text-slate-600">
                  <p className="font-bold">Profissional: <span className="text-crb-navy font-black">{executingTask.debito.nome}</span></p>
                  <p className="font-bold">Registro: <span className="text-slate-700">{executingTask.debito.crb}</span></p>
                  <p className="font-bold">Exercício de Referência: <span className="text-slate-700">{executingTask.debito.ano}</span></p>
                  <p className="font-bold">Valor das Custas: <span className="text-rose-600 font-mono font-bold">{formatCurrency(executingTask.debito.valorCorrigido || executingTask.debito.valor)}</span></p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Data de Realização da Etapa</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none font-bold text-xs text-crb-navy"
                  />
                  <p className="text-[9px] text-slate-400 font-bold italic ml-1">
                    Esta data iniciará a contagem do respectivo prazo legal de cobrança correspondente.
                  </p>
                </div>

                {executingTask.acaoTipo === 'divida_ativa' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">
                      Número da CDA (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: CDA-2026/001"
                      value={inputCDA}
                      onChange={(e) => setInputCDA(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-2.5 px-4 rounded-xl focus:border-crb-purple outline-none font-bold text-xs text-crb-navy"
                    />
                    <p className="text-[9px] text-slate-400 font-bold italic ml-1">
                      Certidão de Dívida Ativa correspondente ao título executivo extrajudicial.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-150 flex gap-4">
                <button
                  type="button"
                  onClick={() => setExecutingTask(null)}
                  className="flex-1 py-3 text-xs bg-white text-slate-600 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleExecuteDirectAction}
                  className="flex-1 py-3 text-xs bg-crb-navy text-white font-bold rounded-xl hover:bg-[#142e6c] uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? 'Gravando...' : 'Confirmar e Salvar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
