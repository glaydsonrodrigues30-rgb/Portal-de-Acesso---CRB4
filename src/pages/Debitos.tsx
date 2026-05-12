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
  AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Debitos() {
  const { isAdmin, isOperacional } = useAuth();
  const [debitos, setDebitos] = useState<Debito[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCRB, setSearchCRB] = useState('');
  const [searchAno, setSearchAno] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  const [editingDebito, setEditingDebito] = useState<Partial<Debito> | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const pageSize = 50;

  const fetchDebitos = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'debits'),
        orderBy('crb'),
        orderBy('ano', 'desc'),
        limit(pageSize)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Debito[];
      setDebitos(data);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'debits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebitos();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebito?.crb || !editingDebito?.nome || !editingDebito?.valor || !editingDebito?.ano) return;

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
        updatedAt: new Date().toISOString()
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

      await fetchDebitos();
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
    const matchesNome = d.nome.toLowerCase().includes(search);
    const matchesCRB = d.crb.toLowerCase().includes(search) || d.crb.toLowerCase().includes(searchCRB.toLowerCase());
    const matchesAno = searchAno ? d.ano.toString() === searchAno : true;
    return (matchesNome || matchesCRB) && matchesAno;
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

      {/* Modal de Débito */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="bg-crb-navy p-6 flex justify-between items-center bg-gradient-to-r from-crb-navy to-crb-purple">
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

              <form onSubmit={handleSave} className="p-8 space-y-6">
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
                      onChange={(e) => setEditingDebito({...editingDebito!, statusGeral: e.target.value})}
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Pago">Pago</option>
                      <option value="Em Negociação">Em Negociação</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>

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

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs"
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
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 border rounded-xl font-bold text-sm tracking-wide transition-all",
              showFilters ? "bg-crb-navy text-white border-crb-navy" : "bg-white text-crb-navy border-slate-200 hover:border-crb-purple hover:bg-slate-50"
            )}
          >
            <Filter size={18} className={showFilters ? "text-white" : "text-crb-navy"} />
            Filtros Avançados
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100"
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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ano do Exercício</label>
                <input 
                  type="number" 
                  value={searchAno}
                  onChange={(e) => setSearchAno(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crb-purple focus:border-crb-navy transition-all font-medium"
                  placeholder="2024"
                />
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
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Valor Original</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Valor Corrigido</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Situação</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-crb-navy border-t-crb-purple rounded-full animate-spin"></div>
                      <span className="text-sm font-bold text-slate-400 uppercase tracking-widest font-sans">Sincronizando com Base de Dados...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                       <Search size={40} className="text-slate-200 mb-2" />
                       <span className="text-lg font-serif font-bold text-slate-400">Nenhum registro encontrado</span>
                       <p className="text-sm text-slate-400 font-medium">Tente ajustar seus critérios de busca ou filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5 text-sm font-bold text-crb-navy">{item.crb}</td>
                    <td className="px-8 py-5 text-sm text-slate-700 font-bold uppercase tracking-tight">{item.nome}</td>
                    <td className="px-8 py-5">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">{item.ano}</span>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500 font-medium">{formatCurrency(item.valorOriginal || item.valor)}</td>
                    <td className="px-8 py-5 text-sm font-serif font-bold text-crb-navy">{formatCurrency(item.valorCorrigido || item.valor)}</td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm",
                        item.statusGeral?.includes('Pago') 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {item.statusGeral || 'Pendente'}
                      </span>
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
                ))
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
    </div>
  );
}
