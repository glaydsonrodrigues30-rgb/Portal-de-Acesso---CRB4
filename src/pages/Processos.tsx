import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc,
  orderBy, 
  where 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logAuditoria } from '../lib/firebase';
import { Processo } from '@/src/types';
import { 
  Plus, 
  FolderOpen, 
  Search, 
  Calendar, 
  FileText, 
  User, 
  ChevronRight, 
  Edit2, 
  X, 
  Save, 
  Trash2, 
  Eye,
  Settings
} from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Processos() {
  const { isAdmin, isOperacional } = useAuth();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searchAno, setSearchAno] = useState('');
  
  const [editingProcesso, setEditingProcesso] = useState<Partial<Processo> | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProcesso || isReadOnly) return;
    setSaving(true);
    try {
      const payload = {
        ...editingProcesso,
        updatedAt: new Date().toISOString(),
        createdAt: editingProcesso.id ? undefined : new Date().toISOString()
      };
      
      if (editingProcesso.id) {
        await updateDoc(doc(db, 'processos', editingProcesso.id), payload);
        await logAuditoria('EDICAO', 'PROCESSOS', editingProcesso.id);
        alert('Processo atualizado com sucesso.');
      } else {
        const docRef = await addDoc(collection(db, 'processos'), payload);
        await logAuditoria('CRIACAO', 'PROCESSOS', docRef.id);
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

  const filteredProcessos = processos.filter(p => {
    const search = searchTerm.toLowerCase();
    const matchesProfessional = (p.profissional || p.interessado)?.toLowerCase().includes(search);
    const matchesNum = (p.numeroProcesso || p.numero)?.toLowerCase().includes(search);
    const matchesRequest = (p.solicitacao || p.descricao)?.toLowerCase().includes(search);
    const matchesStatus = searchStatus ? p.status === searchStatus : true;
    const matchesAno = searchAno ? (p.dataSolicitacao?.startsWith(searchAno) || p.dataAbertura?.startsWith(searchAno) || p.ano?.toString() === searchAno) : true;
    return (matchesProfessional || matchesNum || matchesRequest) && matchesStatus && matchesAno;
  });

  return (
    <div className="space-y-8 text-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Processos</h2>
          <p className="text-slate-500 font-medium font-sans">Gestão de solicitações e registros administrativos para plenária.</p>
        </div>
        {(isAdmin || isOperacional) && (
          <button 
            onClick={() => { 
              setEditingProcesso({ status: 'Em Análise' }); 
              setIsReadOnly(false);
              setIsModalOpen(true); 
            }}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm tracking-wide"
          >
            <Plus size={20} className="text-white" />
            Novo Processo
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative group col-span-1 md:col-span-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por Profissional, Registro ou Solicitação..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all placeholder:text-slate-400 font-medium"
            />
          </div>
          <div className="flex gap-4 col-span-1 md:col-span-2">
            <select 
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crb-purple font-bold text-sm text-crb-navy min-w-[160px]"
            >
              <option value="">Todos os Status</option>
              <option value="Em Análise">Em Análise</option>
              <option value="Deferido">Deferido</option>
              <option value="Indeferido">Indeferido</option>
              <option value="Sobrestado">Sobrestado</option>
              <option value="Pendente">Pendente</option>
            </select>
            <input 
              type="number" 
              placeholder="Ano..." 
              value={searchAno}
              onChange={(e) => setSearchAno(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crb-purple font-bold text-sm text-crb-navy w-32"
            />
          </div>
        </div>
      </div>

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
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-400 font-medium font-sans italic">Nenhum processo administrativo encontrado.</td></tr>
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
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-tight line-clamp-1">{p.solicitacao || p.descricao}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-black text-crb-navy">{p.dataPlenaria ? formatDate(p.dataPlenaria) : 'A definir'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                        p.status === 'Deferido' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                        p.status === 'Em Análise' ? "bg-purple-50 text-purple-700 border-purple-100" :
                        "bg-red-50 text-red-700 border-red-100"
                      )}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                        {(isAdmin || isOperacional) && (
                          <>
                            <button 
                              onClick={() => { setEditingProcesso(p); setIsReadOnly(false); setIsModalOpen(true); }}
                              className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(p.id)}
                              className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => { setEditingProcesso(p); setIsReadOnly(true); setIsModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-400 rounded-lg transition-all border border-slate-100 shadow-xs"
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
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Número do Processo</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      placeholder="000/2024"
                      value={editingProcesso?.numeroProcesso || editingProcesso?.numero || ''}
                      onChange={(e) => setEditingProcesso({...editingProcesso!, numeroProcesso: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
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

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Solicitação</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy uppercase disabled:opacity-70"
                      placeholder="EX: BAIXA DE RESPONSÁVEL TÉCNICO"
                      value={editingProcesso?.solicitacao || editingProcesso?.descricao || ''}
                      onChange={(e) => setEditingProcesso({...editingProcesso!, solicitacao: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status do Processo</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingProcesso?.status || 'Em Análise'}
                      onChange={(e) => setEditingProcesso({...editingProcesso!, status: e.target.value as any})}
                    >
                      <option value="Em Análise">Em Análise</option>
                      <option value="Deferido">Deferido</option>
                      <option value="Indeferido">Indeferido</option>
                      <option value="Sobrestado">Sobrestado</option>
                      <option value="Pendente">Pendente</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data da Solicitação</label>
                    <input 
                      required
                      type="date"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingProcesso?.dataSolicitacao?.split('T')[0] || editingProcesso?.dataAbertura?.split('T')[0] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingProcesso({...editingProcesso!, dataSolicitacao: val ? new Date(val).toISOString() : ''});
                      }}
                    />
                  </div>
                  <div className="space-y-2">
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

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs font-sans"
                  >
                    {isReadOnly ? 'Fechar' : 'Voltar'}
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
    </div>
  );
}
