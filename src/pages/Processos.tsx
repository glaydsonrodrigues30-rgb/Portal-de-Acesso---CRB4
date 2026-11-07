import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logAuditoria } from '../lib/firebase';
import { Processo } from '@/src/types';
import { 
  Plus, 
  FolderOpen, 
  Search, 
  Calendar, 
  X, 
  Save, 
  Edit2, 
  Trash2, 
  Eye,
  RefreshCw,
  Sparkles,
  Layers,
  Filter
} from 'lucide-react';
import { formatDate, cn, openAttachment } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getAnoDe, 
  proximoNumero, 
  extrairSeqAno, 
  existeNumeroNoAno, 
  normalizarStatusProcesso,
  normalizarTipoSolicitacao
} from '../lib/numeracao';

const CURRENT_YEAR = new Date().getFullYear();

export default function Processos() {
  const { userData, isAdmin, isOperacional } = useAuth();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  
  // B) Seletor de Ano com padrão no ano atual
  const [searchAno, setSearchAno] = useState<string>(CURRENT_YEAR.toString());
  
  const [editingProcesso, setEditingProcesso] = useState<Partial<Processo> | null>(null);
  const [isNumeroManual, setIsNumeroManual] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleProcessoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        
        setEditingProcesso(prev => {
          if (!prev) return prev;
          const currentAnexos = prev.anexos || [];
          return {
            ...prev,
            anexos: [...currentAnexos, novoAnexo]
          };
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeProcessoAnexo = (id: string) => {
    setEditingProcesso(prev => {
      if (!prev) return prev;
      const currentAnexos = prev.anexos || [];
      return {
        ...prev,
        anexos: currentAnexos.filter(anexo => anexo.id !== id)
      };
    });
  };

  const fetchProcessos = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'processos'), orderBy('dataSolicitacao', 'desc'));
      const snap = await getDocs(q);
      setProcessos(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Processo[]);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'processos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProcessos(); }, []);

  // Anos disponíveis dinamicamente
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(CURRENT_YEAR);
    processos.forEach(p => {
      const a = p.ano || getAnoDe(p.dataSolicitacao || p.dataAbertura);
      if (a) set.add(a);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [processos]);

  // Abertura do formulário de Novo Processo com preenchimento automático
  const handleOpenNovoProcesso = () => {
    const anoAtual = CURRENT_YEAR;
    const prox = proximoNumero(processos, anoAtual);
    const dataPadrao = new Date().toISOString();

    setEditingProcesso({
      status: 'Em Análise',
      dataSolicitacao: dataPadrao,
      dataAbertura: dataPadrao,
      ano: anoAtual,
      numeroProcesso: prox,
      numero: prox
    });
    setIsNumeroManual(false);
    setIsReadOnly(false);
    setIsModalOpen(true);
  };

  // Re-geração automática do número sugerido
  const handleGerarNumeroAutomatico = () => {
    const docDate = editingProcesso?.dataSolicitacao || editingProcesso?.dataAbertura;
    const ano = getAnoDe(docDate);
    const sugerido = proximoNumero(processos, ano);
    setEditingProcesso(prev => prev ? ({
      ...prev,
      numeroProcesso: sugerido,
      numero: sugerido,
      ano
    }) : prev);
    setIsNumeroManual(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProcesso || isReadOnly) return;

    const numLimpo = (editingProcesso.numeroProcesso || editingProcesso.numero || '').trim();
    if (!numLimpo) {
      alert('Por favor, informe o número do processo.');
      return;
    }

    const formAno = getAnoDe(editingProcesso.dataSolicitacao || editingProcesso.dataAbertura);

    // Validação de unicidade no mesmo ano
    if (existeNumeroNoAno(processos, numLimpo, formAno, editingProcesso.id)) {
      const proxLivre = proximoNumero(processos, formAno);
      alert(`Número já utilizado em ${formAno}. Próximo disponível: ${proxLivre}`);
      return;
    }

    setSaving(true);
    try {
      const solNorm = normalizarTipoSolicitacao(editingProcesso.solicitacao || editingProcesso.descricao);
      const stNorm = normalizarStatusProcesso(editingProcesso.status);

      const payload: any = {
        ...editingProcesso,
        numero: numLimpo,
        numeroProcesso: numLimpo,
        solicitacao: solNorm,
        descricao: solNorm,
        status: stNorm,
        ano: formAno,
        updatedAt: new Date().toISOString(),
        createdAt: editingProcesso.id ? (editingProcesso.createdAt || new Date().toISOString()) : new Date().toISOString()
      };

      if (editingProcesso.id) {
        await updateDoc(doc(db, 'processos', editingProcesso.id), payload);
        await logAuditoria('EDICAO', 'PROCESSOS', editingProcesso.id);
        alert('Processo atualizado com sucesso.');
      } else {
        // Chave natural determinística prc_NNN_AAAA
        const parsed = extrairSeqAno(numLimpo);
        const seqStr = parsed ? String(parsed.seq).padStart(3, '0') : numLimpo.replace(/[^a-zA-Z0-9]/g, '_');
        const chaveNatural = `prc_${seqStr}_${formAno}`;

        payload.id = chaveNatural;
        await setDoc(doc(db, 'processos', chaveNatural), payload, { merge: true });
        await logAuditoria('CRIACAO', 'PROCESSOS', chaveNatural);
        alert('Processo registrado com sucesso.');
      }

      setIsModalOpen(false);
      fetchProcessos();
    } catch (err) {
      alert('Erro ao salvar processo.');
      handleFirestoreError(err, OperationType.WRITE, 'processos');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este processo administrativo?')) return;
    try {
      await deleteDoc(doc(db, 'processos', id));
      await logAuditoria('EXCLUSAO', 'PROCESSOS', id);
      setProcessos(prev => prev.filter(p => p.id !== id));
      alert('Processo excluído com sucesso!');
    } catch (err) {
      alert('Erro ao excluir processo.');
      handleFirestoreError(err, OperationType.DELETE, 'processos');
    }
  };

  // Filtragem e ordenação decrescente por número dentro do ano
  const filteredProcessos = useMemo(() => {
    return processos.filter(p => {
      const search = searchTerm.toLowerCase();
      const matchesProfessional = (p.profissional || p.interessado)?.toLowerCase().includes(search);
      const matchesNum = (p.numeroProcesso || p.numero)?.toLowerCase().includes(search);
      const matchesRequest = (p.solicitacao || p.descricao)?.toLowerCase().includes(search);

      // Filtro de ano
      let matchesAno = true;
      if (searchAno && searchAno !== 'TODOS') {
        const itemAno = p.ano || extrairSeqAno(p.numeroProcesso || p.numero)?.ano || getAnoDe(p.dataSolicitacao || p.dataAbertura);
        matchesAno = itemAno.toString() === searchAno;
      }

      let matchesStatus = true;
      if (searchStatus) {
        matchesStatus = normalizarStatusProcesso(p.status) === searchStatus;
      }

      return (matchesProfessional || matchesNum || matchesRequest) && matchesStatus && matchesAno;
    }).sort((a, b) => {
      // Ordenação decrescente por número dentro do ano
      const seqA = extrairSeqAno(a.numeroProcesso || a.numero)?.seq || 0;
      const seqB = extrairSeqAno(b.numeroProcesso || b.numero)?.seq || 0;
      if (seqB !== seqA) return seqB - seqA;

      const dateA = new Date(a.dataSolicitacao || a.dataAbertura || 0).getTime();
      const dateB = new Date(b.dataSolicitacao || b.dataAbertura || 0).getTime();
      return dateB - dateA;
    });
  }, [processos, searchTerm, searchAno, searchStatus]);

  const formAnoAtual = getAnoDe(editingProcesso?.dataSolicitacao || editingProcesso?.dataAbertura);
  const proximoSugestao = proximoNumero(processos, formAnoAtual);

  return (
    <div className="space-y-8 text-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Processos</h2>
          <p className="text-slate-500 font-medium font-sans">
            Gestão de solicitações e registros administrativos para plenária ({searchAno === 'TODOS' || !searchAno ? 'Todos os Anos' : `Exercício ${searchAno}`}).
          </p>
        </div>
        {(isAdmin || isOperacional) && (
          <button 
            onClick={handleOpenNovoProcesso}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm tracking-wide cursor-pointer"
          >
            <Plus size={20} className="text-white" />
            Novo Processo
          </button>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative group col-span-1 md:col-span-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por Profissional, Registro ou Solicitação..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* B) Seletor de Ano */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ano</label>
            <select 
              value={searchAno}
              onChange={(e) => setSearchAno(e.target.value)}
              className="px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-sm text-crb-navy bg-white transition-all cursor-pointer"
            >
              <option value="TODOS">Todos os anos</option>
              {availableYears.map(y => (
                <option key={y} value={y.toString()}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status</label>
            <select 
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
              className="px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-sm text-crb-navy bg-white transition-all cursor-pointer"
            >
              <option value="">Todos os Status</option>
              <option value="Em Análise">Em Análise</option>
              <option value="Deferido">Deferido</option>
              <option value="Indeferido">Indeferido</option>
              <option value="Aguardando Plenária">Aguardando Plenária</option>
              <option value="Ad Referendum">Ad Referendum</option>
              <option value="Pendente">Pendente</option>
              <option value="Sobrestado">Sobrestado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Processos */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-crb-navy text-white">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Nº Processo</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Profissional / Interessado</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Solicitação</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Data Plenária</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Status</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-crb-navy border-t-crb-purple rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest font-sans tracking-[0.2em]">Consultando Processos...</span>
                  </div>
                </td></tr>
              ) : filteredProcessos.length === 0 ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-400 font-medium font-sans italic">
                  Nenhum processo administrativo encontrado para os filtros selecionados.
                </td></tr>
              ) : (
                filteredProcessos.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-crb-navy/5 text-crb-purple flex items-center justify-center">
                          <FolderOpen size={20} />
                        </div>
                        <span className="text-sm font-black text-crb-navy font-mono tracking-tighter uppercase">{p.numeroProcesso || p.numero}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-700 uppercase tracking-tight line-clamp-1 max-w-[200px]">{p.profissional || p.interessado}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-tight line-clamp-1">
                        {normalizarTipoSolicitacao(p.solicitacao || p.descricao)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-black text-crb-navy">
                        {p.dataPlenaria ? formatDate(p.dataPlenaria) : (p.observacaoPlenaria ? p.observacaoPlenaria : 'A definir')}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                        p.status === 'Deferido' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                        p.status === 'Indeferido' ? "bg-red-50 text-red-700 border-red-100" :
                        p.status === 'Aguardando Plenária' ? "bg-blue-50 text-blue-700 border-blue-100" :
                        p.status === 'Ad Referendum' ? "bg-violet-50 text-violet-700 border-violet-100" :
                        "bg-purple-50 text-purple-700 border-purple-100"
                      )}>
                        {normalizarStatusProcesso(p.status)}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                        {(isAdmin || isOperacional) && (
                          <>
                            <button 
                              onClick={() => { setEditingProcesso(p); setIsReadOnly(false); setIsModalOpen(true); }}
                              className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(p.id)}
                              className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => { setEditingProcesso(p); setIsReadOnly(true); setIsModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-400 rounded-lg transition-all border border-slate-100 shadow-xs cursor-pointer"
                          title="Visualizar"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro/Edição de Processo */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="bg-crb-navy p-6 flex justify-between items-center bg-gradient-to-r from-crb-navy to-crb-purple">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    {isReadOnly ? <Eye size={24} className="text-white" /> : <FolderOpen size={24} className="text-white" />}
                  </div>
                  <h3 className="text-xl font-serif font-bold text-white">
                    {isReadOnly ? 'Visualizar Processo' : (editingProcesso?.id ? 'Editar Processo' : 'Registro de Processo Administrativo')}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors cursor-pointer">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* A) Campo Número com sugestão automática, botão Gerar automático e texto de ajuda */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Número do Processo
                      </label>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={handleGerarNumeroAutomatico}
                          className="flex items-center gap-1 text-[10px] font-bold text-crb-purple hover:text-crb-purple-dark hover:underline transition-all cursor-pointer"
                          title="Restaurar sugestão automática do próximo sequencial livre"
                        >
                          <Sparkles size={11} />
                          Gerar automático
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input 
                        required
                        type="text"
                        disabled={isReadOnly}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-mono font-bold text-crb-navy disabled:opacity-70"
                        placeholder="001-2026"
                        value={editingProcesso?.numeroProcesso || editingProcesso?.numero || ''}
                        onChange={(e) => {
                          setIsNumeroManual(true);
                          setEditingProcesso({
                            ...editingProcesso!,
                            numeroProcesso: e.target.value,
                            numero: e.target.value
                          });
                        }}
                      />
                    </div>
                    {!isReadOnly && (
                      <p className="text-[11px] text-slate-400 font-medium ml-1">
                        Próximo disponível: <strong className="text-crb-purple font-mono">{proximoSugestao}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome do Profissional/Empresa</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy uppercase disabled:opacity-70"
                      placeholder="NOME COMPLETO"
                      value={editingProcesso?.profissional || editingProcesso?.interessado || ''}
                      onChange={(e) => setEditingProcesso({...editingProcesso!, profissional: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Solicitação</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy uppercase disabled:opacity-70"
                      placeholder="EX: LICENÇA DE 2 ANOS / REGISTRO DEFINITIVO"
                      value={editingProcesso?.solicitacao || editingProcesso?.descricao || ''}
                      onChange={(e) => setEditingProcesso({...editingProcesso!, solicitacao: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status do Processo</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70 cursor-pointer"
                      value={editingProcesso?.status || 'Em Análise'}
                      onChange={(e) => setEditingProcesso({...editingProcesso!, status: e.target.value as any})}
                    >
                      <option value="Em Análise">Em Análise</option>
                      <option value="Deferido">Deferido</option>
                      <option value="Indeferido">Indeferido</option>
                      <option value="Aguardando Plenária">Aguardando Plenária</option>
                      <option value="Ad Referendum">Ad Referendum</option>
                      <option value="Sobrestado">Sobrestado</option>
                      <option value="Pendente">Pendente</option>
                    </select>
                  </div>

                  {/* Data da Solicitação com recálculo do número sugerido caso não editado manualmente */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data da Solicitação</label>
                    <input 
                      required
                      type="date"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingProcesso?.dataSolicitacao?.split('T')[0] || editingProcesso?.dataAbertura?.split('T')[0] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const novoAno = getAnoDe(val);
                        const isoStr = val ? new Date(val).toISOString() : '';

                        setEditingProcesso(prev => {
                          if (!prev) return prev;
                          const numAtualizado = (!isNumeroManual && !prev.id)
                            ? proximoNumero(processos, novoAno)
                            : prev.numeroProcesso;

                          return {
                            ...prev,
                            dataSolicitacao: isoStr,
                            dataAbertura: isoStr,
                            ano: novoAno,
                            numeroProcesso: numAtualizado,
                            numero: numAtualizado
                          };
                        });
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data da Plenária</label>
                    <input 
                      type="date"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingProcesso?.dataPlenaria?.split('T')[0] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingProcesso({...editingProcesso!, dataPlenaria: val ? new Date(val).toISOString() : ''});
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Observação / Parecer Relator</label>
                  <textarea 
                    disabled={isReadOnly}
                    className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy min-h-[100px] resize-none disabled:opacity-70"
                    placeholder="Notas ou detalhes da decisão plenária..."
                    value={editingProcesso?.observacao || ''}
                    onChange={(e) => setEditingProcesso({...editingProcesso!, observacao: e.target.value})}
                  />
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Documentos em Anexo</label>
                    {!isReadOnly && (
                      <label className="flex items-center gap-1.5 bg-crb-navy/5 text-crb-navy hover:bg-crb-navy hover:text-white px-3 py-1.5 rounded-xl cursor-pointer transition-all text-xs font-bold">
                        <Plus size={14} />
                        Anexar Arquivo
                        <input 
                          type="file" 
                          multiple 
                          className="hidden" 
                          onChange={handleProcessoFileUpload} 
                        />
                      </label>
                    )}
                  </div>
                  
                  {editingProcesso?.anexos && editingProcesso.anexos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                      {editingProcesso.anexos.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-700 truncate" title={file.nome}>
                              {file.nome}
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">
                              {new Date(file.dataUpload).toLocaleDateString('pt-BR')} por {file.usuarioUpload}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => openAttachment(file)}
                              className="p-1.5 text-slate-500 hover:text-white hover:bg-crb-navy rounded-lg transition-all cursor-pointer"
                              title="Visualizar documento"
                            >
                              <Eye size={14} />
                            </button>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => removeProcessoAnexo(file.id)}
                                className="p-1.5 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all cursor-pointer"
                                title="Excluir documento"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">Nenhum documento anexado a este processo administrativo.</p>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs font-sans cursor-pointer"
                  >
                    {isReadOnly ? 'Fechar' : 'Voltar'}
                  </button>
                  {!isReadOnly && (
                    <button 
                      type="submit"
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 bg-crb-purple text-white px-6 py-4 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold uppercase tracking-widest text-xs disabled:opacity-50 cursor-pointer"
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
    </div>
  );
}
