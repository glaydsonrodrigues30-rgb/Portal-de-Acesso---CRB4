import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getDoc, addDoc, doc, updateDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logAuditoria } from '../lib/firebase';
import { Negociacao, Debito } from '@/src/types';
import { Plus, Handshake, Search, Calendar, DollarSign, Wallet, FileCheck, CheckCircle, Info, X, Edit2, Save, Trash2, Eye } from 'lucide-react';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Negociacoes() {
  const { isAdmin, isOperacional } = useAuth();
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selection / Autocomplete
  const [debitoSearch, setDebitoSearch] = useState('');
  const [foundDebitos, setFoundDebitos] = useState<Debito[]>([]);
  const [selectedDebitos, setSelectedDebitos] = useState<Debito[]>([]);
  const [editingNegociacao, setEditingNegociacao] = useState<Partial<Negociacao> | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [negData, setNegData] = useState({
    valorNegociado: 0,
    formaNegociacao: 'Parcelado via Boleto',
    nParcelas: 12,
    statusContato: 'Em Negociação',
    observacoes: ''
  });

  const fetchNegociacoes = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'negotiations'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Negociacao[];
      
      const enrichedData = await Promise.all(data.map(async (n) => {
        try {
          const debSnap = await getDoc(doc(db, 'debits', n.debitosIds[0]));
          return { ...n, profissional: debSnap.exists() ? debSnap.data().nome : 'N/A' };
        } catch {
          return n;
        }
      }));

      setNegociacoes(enrichedData as any);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'negotiations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNegociacoes(); }, []);

  const searchDebitos = async () => {
    if (debitoSearch.length < 2) {
      setFoundDebitos([]);
      return;
    }
    try {
      // Search by exact CRB first
      const qCrb = query(collection(db, 'debits'), where('crb', '==', debitoSearch.toUpperCase()));
      const snapCrb = await getDocs(qCrb);
      let results = snapCrb.docs.map(d => ({ id: d.id, ...d.data() })) as Debito[];

      // If no CRB match or if we want partial name matches, fetch more and filter
      // Note: Firestore doesn't support easy case-insensitive partial match queries without a search provider,
      // so for small-ish datasets we fetch a few and filter locallly, or use prefixed queries.
      if (results.length === 0) {
        const qAll = query(collection(db, 'debits'), limit(100));
        const snapAll = await getDocs(qAll);
        const all = snapAll.docs.map(d => ({ id: d.id, ...d.data() })) as Debito[];
        results = all.filter(d => 
          d.nome.toLowerCase().includes(debitoSearch.toLowerCase()) || 
          d.crb.toLowerCase().includes(debitoSearch.toLowerCase())
        );
      }
      
      setFoundDebitos(results.slice(0, 10));
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debitoSearch) searchDebitos();
    }, 500);
    return () => clearTimeout(timer);
  }, [debitoSearch]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir esta negociação?')) return;
    try {
      await deleteDoc(doc(db, 'negotiations', id));
      await logAuditoria('EXCLUSAO', 'NEGOCIACOES', id);
      setNegociacoes(prev => prev.filter(n => n.id !== id));
      alert('Negociação excluída com sucesso!');
    } catch (err) {
      alert('Erro ao excluir negociação.');
      handleFirestoreError(err, OperationType.DELETE, 'negotiations');
    }
  };

  const toggleDebito = (debito: Debito) => {
    if (selectedDebitos.find(d => d.id === debito.id)) {
      setSelectedDebitos(selectedDebitos.filter(d => d.id !== debito.id));
    } else {
      setSelectedDebitos([...selectedDebitos, debito]);
    }
  };

  const totalDebitos = selectedDebitos.reduce((acc, curr) => acc + curr.valor, 0);

  const handleSave = async () => {
    if (!editingNegociacao && selectedDebitos.length === 0) return;
    setSaving(true);
    try {
      if (editingNegociacao?.id) {
        // Edit Mode
        const payload = {
          valorNegociado: negData.valorNegociado,
          nParcelas: negData.nParcelas,
          formaNegociacao: negData.formaNegociacao,
          statusContato: negData.statusContato,
          observacoes: negData.observacoes,
          updatedAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'negotiations', editingNegociacao.id), payload);
        await logAuditoria('EDICAO', 'NEGOCIACOES', editingNegociacao.id);
        alert('Negociação atualizada com sucesso!');
      } else {
        // Create Mode
        const payload = {
          ...negData,
          crb: selectedDebitos[0].crb,
          debitosIds: selectedDebitos.map(d => d.id),
          valorTotal: totalDebitos,
          dataNegociacao: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'negotiations'), payload);
        await logAuditoria('CRIACAO', 'NEGOCIACOES', docRef.id);
        alert('Negociação registrada com sucesso!');
      }
      
      setIsModalOpen(false);
      resetForm();
      fetchNegociacoes();
    } catch (err) {
      alert('Erro ao salvar negociação.');
      handleFirestoreError(err, editingNegociacao?.id ? OperationType.UPDATE : OperationType.CREATE, 'negotiations');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingNegociacao(null);
    setSelectedDebitos([]);
    setFoundDebitos([]);
    setDebitoSearch('');
    setIsReadOnly(false);
    setNegData({
      valorNegociado: 0,
      formaNegociacao: 'Parcelado via Boleto',
      nParcelas: 12,
      statusContato: 'Em Negociação',
      observacoes: ''
    });
  };

  const openEdit = (n: Negociacao, readOnly = false) => {
    setEditingNegociacao(n);
    setIsReadOnly(readOnly);
    setNegData({
      valorNegociado: n.valorNegociado || 0,
      formaNegociacao: n.formaNegociacao,
      nParcelas: n.nParcelas,
      statusContato: n.statusContato,
      observacoes: n.observacoes
    });
    // In edit mode we don't reload selectedDebitos just for visualization of IDs,
    // but the modal will show professional name.
    setIsModalOpen(true);
  };

  const filtered = negociacoes.filter(n => {
    const search = searchTerm.toLowerCase();
    const matchesNome = (n as any).profissional?.toLowerCase().includes(search);
    const matchesCRB = n.crb.toLowerCase().includes(search);
    return matchesNome || matchesCRB || !search;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Negociações</h2>
          <p className="text-slate-500 font-medium font-sans">Gestão de acordos e parcelamentos de débitos.</p>
        </div>
        {(isAdmin || isOperacional) && (
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm tracking-wide"
          >
            <Plus size={20} className="text-white" />
            Novo Acordo
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Pesquisar por Profissional ou CRB..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-crb-navy text-white">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Acordo / CRB</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Profissional</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Data Acordo</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Valor Original</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Valor Acordado</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Parcelas</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Situação</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-crb-navy border-t-crb-purple rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest font-sans tracking-[0.2em]">Processando Acordos...</span>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center text-slate-400 font-medium font-sans italic">Nenhum acordo registrado.</td></tr>
              ) : (
                filtered.map(n => (
                  <tr key={n.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-crb-purple/10 text-crb-purple flex items-center justify-center shadow-inner">
                          <Handshake size={24} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-crb-navy">{n.crb}</span>
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{n.id.substring(0, 8)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-700 uppercase line-clamp-1">{(n as any).profissional}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-black text-crb-navy">{formatDate(n.dataNegociacao)}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-medium text-slate-400 line-through">{formatCurrency(n.valorTotal)}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-emerald-600 font-serif">{formatCurrency(n.valorNegociado)}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-black text-crb-navy">{n.nParcelas}x</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                        n.statusContato === 'Concluído' 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                          : n.statusContato === 'Em Negociação' || n.statusContato === 'Em Aberto'
                            ? "bg-purple-50 text-purple-700 border-purple-100"
                            : "bg-red-50 text-red-700 border-red-100"
                      )}>
                        {n.statusContato}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                        {(isAdmin || isOperacional) && (
                          <>
                            <button 
                              onClick={() => openEdit(n, false)}
                              className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs"
                              title="Editar Acordo"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(n.id)}
                              className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs"
                              title="Excluir Acordo"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => openEdit(n, true)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-400 rounded-lg transition-all border border-slate-100 shadow-xs"
                          title="Visualizar Detalhes"
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

      {/* Modal Novo/Editar Acordo */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col my-8 border border-white/20 overflow-hidden"
            >
              <div className="p-6 bg-crb-navy text-white bg-gradient-to-r from-crb-navy to-crb-purple flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    {isReadOnly ? <Eye size={24} /> : <Handshake size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-serif font-bold text-white">
                      {isReadOnly ? 'Visualizar Acordo' : (editingNegociacao ? 'Editar Acordo de Negociação' : 'Novo Acordo de Negociação')}
                    </h3>
                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">
                      {isReadOnly ? 'Detalhes do parcelamento e condições acordadas' : (editingNegociacao ? 'Ajuste os Termos do Acordo Existente' : 'Selecione os débitos e defina as condições')}
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 flex flex-col lg:flex-row gap-8 overflow-y-auto max-h-[80vh]">
                {/* Left: Selection/Info */}
                <div className="flex-1 space-y-6">
                  {editingNegociacao ? (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Profissional</label>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                           <div className="w-12 h-12 rounded-xl bg-crb-navy/5 flex items-center justify-center text-crb-navy font-black">
                             {((editingNegociacao as any).profissional || 'N').charAt(0)}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-crb-navy uppercase line-clamp-1">{(editingNegociacao as any).profissional}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{editingNegociacao.crb}</p>
                           </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Débitos Incluídos no Acordo</label>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest italic text-center">
                          {editingNegociacao.debitosIds?.length || 0} débitos consolidados neste contrato
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">1. Localizar Profissional e Débitos</label>
                        <div className="relative group">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-crb-purple transition-colors" size={18} />
                          <input 
                            type="text" 
                            placeholder="Buscar por Nome ou CRB..."
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-crb-navy uppercase transition-all"
                            value={debitoSearch}
                            onChange={(e) => setDebitoSearch(e.target.value)}
                          />
                          
                          {foundDebitos.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 z-10 border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white shadow-2xl">
                              {foundDebitos.map(d => (
                                <button 
                                  key={d.id}
                                  type="button"
                                  onClick={() => {
                                    if (!selectedDebitos.find(sd => sd.id === d.id)) {
                                      setSelectedDebitos([...selectedDebitos, d]);
                                    }
                                    setDebitoSearch('');
                                    setFoundDebitos([]);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm transition-all hover:bg-slate-50 flex items-center justify-between group"
                                >
                                  <div>
                                    <p className="font-bold text-crb-navy uppercase group-hover:text-crb-purple">[{d.crb}] {d.nome}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{d.nomeDebito} • Exercício {d.ano}</p>
                                  </div>
                                  <Plus size={16} className="text-slate-300 group-hover:text-crb-purple" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">2. Débitos Selecionados para Acordo</label>
                        <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-64 overflow-y-auto bg-slate-50 shadow-inner">
                          {selectedDebitos.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest italic flex flex-col items-center gap-3">
                              <Info size={24} className="opacity-20" />
                              Selecione os débitos acima para compor o total
                            </div>
                          ) : selectedDebitos.map(d => (
                            <div key={d.id} className="flex items-center gap-3 p-4 bg-white/50 hover:bg-white transition-colors">
                              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                <FileCheck size={16} />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-crb-navy uppercase">{d.nomeDebito || 'Débito'}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Ano {d.ano} • {formatCurrency(d.valorCorrigido || d.valor)}</p>
                              </div>
                              <button 
                                onClick={() => toggleDebito(d)}
                                className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Conditions */}
                <div className="w-full lg:w-96 space-y-6 bg-slate-50 p-8 rounded-3xl border border-slate-100">
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Resumo Financeiro</label>
                      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-400 uppercase">Dívida Original:</span>
                            <span className="font-black text-slate-400 line-through">{formatCurrency(editingNegociacao ? editingNegociacao.valorTotal : totalDebitos)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Economia Gerada:</span>
                            <span className="text-sm font-black text-emerald-600 font-serif">
                              {formatCurrency((editingNegociacao ? editingNegociacao.valorTotal : totalDebitos) - negData.valorNegociado)}
                            </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Valor Negociado</label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600"><DollarSign size={16} /></div>
                          <input 
                            type="number" 
                            disabled={isReadOnly}
                            className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-emerald-600 disabled:opacity-70"
                            value={negData.valorNegociado}
                            onChange={(e) => setNegData({...negData, valorNegociado: parseFloat(e.target.value)})}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nº Parcelas</label>
                        <input 
                          type="number" 
                          disabled={isReadOnly}
                          className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-crb-navy disabled:opacity-70"
                          value={negData.nParcelas}
                          onChange={(e) => setNegData({...negData, nParcelas: parseInt(e.target.value)})}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status</label>
                        <select 
                          disabled={isReadOnly}
                          className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-crb-navy text-[10px] uppercase disabled:opacity-70"
                          value={negData.statusContato}
                          onChange={(e) => setNegData({...negData, statusContato: e.target.value})}
                        >
                          <option value="Em Negociação">Em Negociação</option>
                          <option value="Concluído">Concluído</option>
                          <option value="Cancelado">Cancelado</option>
                          <option value="Inadimplente">Inadimplente</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Forma de Pagamento</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-crb-navy text-[10px] uppercase disabled:opacity-70"
                        value={negData.formaNegociacao}
                        onChange={(e) => setNegData({...negData, formaNegociacao: e.target.value})}
                      >
                        <option>Parcelado via Boleto</option>
                        <option>Cartão de Crédito</option>
                        <option>Pix à Vista</option>
                        <option>Transferência Bancária</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Observações</label>
                      <textarea 
                        disabled={isReadOnly}
                        className="w-full p-4 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple text-xs h-24 resize-none font-medium disabled:opacity-70"
                        placeholder="Detalhes do contato, promessas de pagamento..."
                        value={negData.observacoes}
                        onChange={(e) => setNegData({...negData, observacoes: e.target.value})}
                      ></textarea>
                    </div>

                    <div className="flex gap-4 pt-4 mt-auto">
                      <button 
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 py-4 border-2 border-slate-200 text-slate-400 font-bold rounded-2xl hover:bg-white transition uppercase tracking-widest text-[10px]"
                      >
                        {isReadOnly ? 'Fechar' : 'Cancelar'}
                      </button>
                      {!isReadOnly && (
                        <button 
                          onClick={handleSave}
                          disabled={saving || (!editingNegociacao && selectedDebitos.length === 0)}
                          className="flex-[1.5] py-4 bg-crb-purple text-white font-bold rounded-2xl hover:bg-crb-purple-light disabled:opacity-50 disabled:bg-slate-200 transition-all shadow-lg shadow-crb-purple/20 flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]"
                        >
                          {saving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          ) : (
                            <Save size={18} />
                          )}
                          {editingNegociacao ? 'Salvar Edição' : 'Confirmar Acordo'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
