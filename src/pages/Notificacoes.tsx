import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logAuditoria } from '../lib/firebase';
import { Notificacao, Debito } from '@/src/types';
import { 
  Plus, 
  Mail, 
  Search, 
  Calendar, 
  CheckCircle, 
  X, 
  Clock, 
  Edit2, 
  Trash2, 
  Eye,
  Save,
  AlertCircle
} from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Notificacoes() {
  const { isAdmin, isOperacional } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Modal State
  const [editingNotif, setEditingNotif] = useState<Partial<Notificacao> | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  // Selection for debt attachment
  const [debitoSearch, setDebitoSearch] = useState('');
  const [debitosSelecionados, setDebitosSelecionados] = useState<Debito[]>([]);
  const [foundDebitos, setFoundDebitos] = useState<Debito[]>([]);

  const fetchNotificacoes = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Notificacao[];
      
      // Enriquecer com dados do débito para busca e exibição
      const enrichedData = await Promise.all(data.map(async (n) => {
        try {
          const debSnap = await getDoc(doc(db, 'debits', n.debitoId));
          return { ...n, debito: debSnap.exists() ? { id: debSnap.id, ...debSnap.data() } : null };
        } catch {
          return n;
        }
      }));
      
      setNotificacoes(enrichedData as any);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotificacoes(); }, []);

  const searchDebitos = async () => {
    if (debitoSearch.length < 2) {
      setFoundDebitos([]);
      return;
    }
    try {
      // Local search first if we had all data, but here we query
      const qCrb = query(collection(db, 'debits'), where('crb', '==', debitoSearch.toUpperCase()));
      const snapCrb = await getDocs(qCrb);
      
      let results = snapCrb.docs.map(d => ({ id: d.id, ...d.data() })) as Debito[];
      
      // If no CRB match, search generic by getting recent and filter
      if (results.length === 0) {
         const qAll = query(collection(db, 'debits'), orderBy('nome'), limit(100));
         const snapAll = await getDocs(qAll);
         const all = snapAll.docs.map(d => ({ id: d.id, ...d.data() })) as Debito[];
         results = all.filter(d => 
           d.nome.toLowerCase().includes(debitoSearch.toLowerCase()) || 
           d.crb.toLowerCase().includes(debitoSearch.toLowerCase())
         );
      }

      setFoundDebitos(results.slice(0, 5));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debitoSearch) searchDebitos();
    }, 500);
    return () => clearTimeout(timer);
  }, [debitoSearch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (debitosSelecionados.length === 0 || !editingNotif?.tipo) return;

    setSaving(true);
    try {
      const payload = {
        tipo: editingNotif.tipo,
        tipoEnvio: editingNotif.tipoEnvio || 'Correios',
        dataNotificacao: editingNotif.dataNotificacao || new Date().toISOString().split('T')[0],
        prazoDias: Number(editingNotif.prazoDias) || 15,
        debitosIds: debitosSelecionados.map(d => d.id),
        debitoId: debitosSelecionados[0].id, // Keep for backward compatibility
        statusPrazo: editingNotif.statusPrazo || 'Em Aberto',
        observacoes: editingNotif.observacoes || '',
        updatedAt: new Date().toISOString(),
        valorTotal: debitosSelecionados.reduce((acc, d) => acc + (d.valor || 0), 0)
      };

      if (editingNotif.id) {
        await updateDoc(doc(db, 'notifications', editingNotif.id), payload);
        await logAuditoria('EDICAO', 'NOTIFICACOES', editingNotif.id);
        alert('Notificação atualizada com sucesso!');
      } else {
        const docWithCreated = { ...payload, createdAt: new Date().toISOString() };
        const docRef = await addDoc(collection(db, 'notifications'), docWithCreated);
        await logAuditoria('CRIACAO', 'NOTIFICACOES', docRef.id);
        alert('Notificação registrada com sucesso!');
      }

      setIsModalOpen(false);
      fetchNotificacoes();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar notificação.');
      handleFirestoreError(err, editingNotif.id ? OperationType.UPDATE : OperationType.CREATE, 'notifications');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir esta notificação?')) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
      await logAuditoria('EXCLUSAO', 'NOTIFICACOES', id);
      setNotificacoes(prev => prev.filter(n => n.id !== id));
      alert('Notificação excluída com sucesso!');
    } catch (err) {
      alert('Erro ao excluir notificação.');
      handleFirestoreError(err, OperationType.DELETE, 'notifications');
    }
  };

  const filteredNotifs = notificacoes.filter(n => {
    const search = searchTerm.toLowerCase();
    const debito = (n as any).debito;
    const matchesNome = debito?.nome?.toLowerCase().includes(search);
    const matchesCRB = debito?.crb?.toLowerCase().includes(search);
    const matchesTipo = n.tipo.toLowerCase().includes(search);
    return matchesNome || matchesCRB || matchesTipo || !search;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-blue pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Notificações</h2>
          <p className="text-slate-500 font-medium font-sans">Histórico de comunicações e cobranças emitidas.</p>
        </div>
        {(isAdmin || isOperacional) && (
          <button 
            onClick={() => {
              setEditingNotif({ 
                tipo: 'Primeira Cobrança', 
                tipoEnvio: 'Correios',
                dataNotificacao: new Date().toISOString().split('T')[0],
                prazoDias: 15,
                statusPrazo: 'Em Aberto'
              });
              setDebitosSelecionados([]);
              setDebitoSearch('');
              setIsReadOnly(false);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-crb-blue text-white px-6 py-3 rounded-2xl hover:bg-crb-blue-light transition-all shadow-lg shadow-crb-blue/20 font-bold text-sm tracking-wide"
          >
            <Plus size={20} className="text-white" />
            Registrar Notificação
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Pesquisar por Profissional, CRB ou Tipo de Notificação..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crb-blue focus:border-crb-navy outline-none transition-all placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-crb-navy text-white">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Tipo de Notificação</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Envio</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">CRB</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Profissional</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Data</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Prazo</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Status</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-crb-navy border-t-crb-blue rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest font-sans tracking-[0.2em]">Consultando Notificações...</span>
                  </div>
                </td></tr>
              ) : filteredNotifs.length === 0 ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center text-slate-400 font-medium font-sans italic">Nenhuma notificação encontrada.</td></tr>
              ) : (
                filteredNotifs.map(n => {
                  const debito = (n as any).debito;
                  const isVencido = n.statusPrazo === 'Em Aberto' && 
                    new Date(n.dataNotificacao).getTime() + (n.prazoDias * 86400000) < Date.now();

                  return (
                    <tr key={n.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            n.tipo.includes('Cobrança') ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                          )}>
                            <Mail size={16} />
                          </div>
                          <span className="text-sm font-bold text-crb-navy">{n.tipo}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{n.tipoEnvio || '---'}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-bold text-crb-purple uppercase tracking-tight">{debito?.crb || '---'}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm font-bold text-slate-700 uppercase tracking-tight line-clamp-1">{debito?.nome || '---'}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-black text-crb-navy">{formatDate(n.dataNotificacao)}</span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className={isVencido ? "text-red-500" : "text-slate-300"} />
                          <span className={cn(
                            "text-xs font-bold",
                            isVencido ? "text-red-600" : "text-slate-500"
                          )}>{n.prazoDias} dias</span>
                          {isVencido && <AlertCircle size={14} className="text-red-500 animate-pulse" />}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                          n.statusPrazo === 'Concluído' 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : n.statusPrazo === 'Em Aberto'
                              ? "bg-blue-50 text-blue-600 border-blue-100"
                              : "bg-purple-50 text-purple-600 border-purple-100"
                        )}>
                          {n.statusPrazo}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                          {(isAdmin || isOperacional) && (
                            <>
                              <button 
                                onClick={async () => {
                                  setEditingNotif(n);
                                  // Fetch all debts if multiple
                                  const ids = (n as any).debitosIds || [n.debitoId];
                                  const docs = await Promise.all(ids.map((id: string) => getDoc(doc(db, 'debits', id))));
                                  const currentDebitos = docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })) as Debito[];
                                  setDebitosSelecionados(currentDebitos);
                                  setIsReadOnly(false);
                                  setIsModalOpen(true);
                                }}
                                className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs"
                                title="Editar Notificação"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDelete(n.id)}
                                className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs"
                                title="Excluir Notificação"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          <button 
                            onClick={async () => {
                              setEditingNotif(n);
                              const ids = (n as any).debitosIds || [n.debitoId];
                              const docs = await Promise.all(ids.map((id: string) => getDoc(doc(db, 'debits', id))));
                              const currentDebitos = docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })) as Debito[];
                              setDebitosSelecionados(currentDebitos);
                              setIsReadOnly(true);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-400 rounded-lg transition-all border border-slate-100 shadow-xs"
                            title="Visualizar Detalhes"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Notificação */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-white/20"
            >
              <div className="p-6 flex items-center justify-between bg-crb-navy text-white bg-gradient-to-r from-crb-navy to-crb-blue">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    {isReadOnly ? <Eye size={24} className="text-white" /> : <Mail size={24} className="text-white" />}
                  </div>
                  <h3 className="text-xl font-serif font-bold">
                    {isReadOnly ? 'Visualizar Notificação' : (editingNotif?.id ? 'Editar Notificação' : 'Nova Notificação')}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-8 space-y-6 overflow-y-auto">
                  
                  {/* Busca de Débito */}
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">1. Localizar Débitos para a Notificação</label>
                    {!isReadOnly && (
                      <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-crb-blue transition-colors" size={18} />
                        <input 
                          type="text" 
                          placeholder="Buscar por Nome ou CRB..."
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-blue font-bold text-crb-navy uppercase transition-all disabled:opacity-50"
                          value={debitoSearch}
                          onChange={(e) => setDebitoSearch(e.target.value)}
                        />
                        
                        {foundDebitos.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 z-10 border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white shadow-2xl">
                            {foundDebitos.map(d => {
                              const isAlreadySelected = debitosSelecionados.some(sel => sel.id === d.id);
                              return (
                                <button 
                                  key={d.id}
                                  type="button"
                                  disabled={isAlreadySelected}
                                  onClick={() => {
                                    if (!isAlreadySelected) {
                                      setDebitosSelecionados([...debitosSelecionados, d]);
                                      setDebitoSearch('');
                                      setFoundDebitos([]);
                                    }
                                  }}
                                  className={cn(
                                    "w-full text-left px-4 py-3 text-sm transition-all hover:bg-slate-50 flex items-center justify-between group",
                                    isAlreadySelected && "opacity-50 cursor-not-allowed bg-slate-50"
                                  )}
                                >
                                  <div>
                                    <p className={cn(
                                      "font-bold text-crb-navy uppercase group-hover:text-crb-blue",
                                      isAlreadySelected && "text-slate-400"
                                    )}>
                                      [{d.crb}] {d.nome}
                                      {isAlreadySelected && <span className="ml-2 text-[8px] bg-emerald-100 text-emerald-600 px-1 rounded">JÁ SELECIONADO</span>}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{d.nomeDebito} • Exercício {d.ano} • {d.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                  </div>
                                  {!isAlreadySelected && <Plus size={16} className="text-slate-300 group-hover:text-crb-blue" />}
                                  {isAlreadySelected && <CheckCircle size={16} className="text-emerald-500" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* DÉBITOS SELECIONADOS */}
                    {debitosSelecionados.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] font-bold text-crb-navy uppercase tracking-widest">DÉBITOS SELECIONADOS ({debitosSelecionados.length})</label>
                          <span className="text-[10px] font-black text-crb-purple">TOTAL: {debitosSelecionados.reduce((acc, d) => acc + (d.valor || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                          {debitosSelecionados.map(d => (
                            <div key={d.id} className="p-3 bg-slate-50 border-2 border-slate-100 rounded-xl flex items-center justify-between group animate-in fade-in slide-in-from-left-2 duration-300">
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-lg bg-crb-navy/5 flex items-center justify-center text-crb-navy font-black text-[10px]">
                                  {d.ano.toString().slice(-2)}
                                </div>
                                <div>
                                  <p className="text-[11px] font-bold text-crb-navy uppercase leading-tight line-clamp-1">{d.nomeDebito}</p>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">{d.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} • {d.crb}</p>
                                </div>
                              </div>
                              {!isReadOnly && (
                                <button 
                                  type="button"
                                  onClick={() => setDebitosSelecionados(debitosSelecionados.filter(sel => sel.id !== d.id))}
                                  className="p-1.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {debitosSelecionados.length === 0 && (
                      <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-center space-y-2">
                        <AlertCircle size={24} className="text-slate-200" />
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Nenhum débito selecionado</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo da Notificação</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-blue font-bold text-crb-navy text-sm disabled:opacity-70"
                        value={editingNotif?.tipo || ''}
                        onChange={(e) => setEditingNotif({ ...editingNotif!, tipo: e.target.value })}
                      >
                        <option value="Primeira Cobrança">Primeira Cobrança</option>
                        <option value="Aviso Amigável">Aviso Amigável</option>
                        <option value="Notificação Extrajudicial">Notificação Extrajudicial</option>
                        <option value="Ofício de Cobrança">Ofício de Cobrança</option>
                        <option value="Auto de Infração">Auto de Infração</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Envio</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-blue font-bold text-crb-navy text-sm disabled:opacity-70"
                        value={editingNotif?.tipoEnvio || 'Correios'}
                        onChange={(e) => setEditingNotif({ ...editingNotif!, tipoEnvio: e.target.value })}
                      >
                        <option value="Correios">Correios</option>
                        <option value="E-mail">E-mail</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Telefone">Telefone</option>
                        <option value="Presencial">Presencial</option>
                        <option value="Sistema">Sistema</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status do Prazo</label>
                      <select 
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-blue font-bold text-crb-navy text-sm disabled:opacity-70"
                        value={editingNotif?.statusPrazo || 'Em Aberto'}
                        onChange={(e) => setEditingNotif({ ...editingNotif!, statusPrazo: e.target.value })}
                      >
                        <option value="Em Aberto">Em Aberto</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Concluído">Concluído</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data da Notificação</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="date" 
                          disabled={isReadOnly}
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-blue font-bold text-crb-navy disabled:opacity-70"
                          value={editingNotif?.dataNotificacao?.split('T')[0] || ''}
                          onChange={(e) => setEditingNotif({ ...editingNotif!, dataNotificacao: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Prazo em Dias</label>
                      <div className="relative">
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="number" 
                          disabled={isReadOnly}
                          className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-blue font-bold text-crb-navy disabled:opacity-70"
                          value={editingNotif?.prazoDias || 15}
                          onChange={(e) => setEditingNotif({ ...editingNotif!, prazoDias: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Observações Internas</label>
                    <textarea 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-blue outline-none transition-all font-bold text-crb-navy h-24 resize-none disabled:opacity-70"
                      placeholder="Notas adicionais sobre esta comunicação..."
                      value={editingNotif?.observacoes || ''}
                      onChange={(e) => setEditingNotif({ ...editingNotif!, observacoes: e.target.value })}
                    />
                  </div>

                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4 mt-auto">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 border-2 border-slate-200 text-slate-400 font-bold rounded-2xl hover:bg-white transition uppercase tracking-widest text-[10px]"
                  >
                    {isReadOnly ? 'Fechar' : 'Cancelar'}
                  </button>
                  {!isReadOnly && (
                    <button 
                      type="submit"
                      disabled={saving || debitosSelecionados.length === 0}
                      className="flex-1 py-4 bg-crb-blue text-white font-bold rounded-2xl hover:bg-crb-blue-light disabled:opacity-50 disabled:bg-slate-300 transition-all shadow-lg shadow-crb-blue/20 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                    >
                      {saving ? (
                         <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <CheckCircle size={18} />
                      )}
                      {saving ? 'Gravando...' : (editingNotif?.id ? 'Atualizar Notificação' : 'Registrar Notificação')}
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
