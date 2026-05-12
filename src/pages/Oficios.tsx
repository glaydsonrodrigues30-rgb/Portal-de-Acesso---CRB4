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
import { Oficio } from '@/src/types';
import { 
  Plus, 
  FileText, 
  Search, 
  Calendar, 
  Hash, 
  UserCircle, 
  X, 
  Save, 
  Edit2, 
  Trash2, 
  Eye,
  Settings
} from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Oficios() {
  const { isAdmin, isOperacional } = useAuth();
  const [oficios, setOficios] = useState<Oficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchAno, setSearchAno] = useState('');
  const [searchTipo, setSearchTipo] = useState('');
  
  const [editingOficio, setEditingOficio] = useState<Partial<Oficio> | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchOficios = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'oficios'), orderBy('dataEnvio', 'desc'));
      const snap = await getDocs(q);
      setOficios(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Oficio[]);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'oficios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOficios(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOficio || isReadOnly) return;
    setSaving(true);
    try {
      const payload = {
        ...editingOficio,
        updatedAt: new Date().toISOString(),
        createdAt: editingOficio.id ? undefined : new Date().toISOString()
      };
      
      if (editingOficio.id) {
        await updateDoc(doc(db, 'oficios', editingOficio.id), payload);
        await logAuditoria('EDICAO', 'OFICIOS', editingOficio.id);
        alert('Ofício atualizado com sucesso.');
      } else {
        const docRef = await addDoc(collection(db, 'oficios'), payload);
        await logAuditoria('CRIACAO', 'OFICIOS', docRef.id);
        alert('Ofício cadastrado com sucesso.');
      }
      setIsModalOpen(false);
      fetchOficios();
    } catch (err) {
      alert('Erro ao salvar ofício.');
      handleFirestoreError(err, OperationType.WRITE, 'oficios');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este ofício?')) return;
    try {
      await deleteDoc(doc(db, 'oficios', id));
      await logAuditoria('EXCLUSAO', 'OFICIOS', id);
      setOficios(prev => prev.filter(o => o.id !== id));
      alert('Ofício excluído com sucesso!');
    } catch (err) {
      alert('Erro ao excluir ofício.');
      handleFirestoreError(err, OperationType.DELETE, 'oficios');
    }
  };

  const filteredOficios = oficios.filter(o => {
    const search = searchTerm.toLowerCase();
    const matchesSubject = o.assunto?.toLowerCase().includes(search);
    const matchesDest = o.destinatario?.toLowerCase().includes(search);
    const matchesNum = (o.numeroOficio || o.numero)?.toLowerCase().includes(search);
    const matchesAno = searchAno ? (o.dataEnvio?.startsWith(searchAno) || o.ano?.toString() === searchAno) : true;
    const matchesTipo = searchTipo ? o.tipoOficio === searchTipo : true;
    return (matchesSubject || matchesDest || matchesNum) && matchesAno && matchesTipo;
  });

  return (
    <div className="space-y-8 text-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Ofícios Expedidos</h2>
          <p className="text-slate-500 font-medium font-sans">Controle de correspondências oficiais enviadas.</p>
        </div>
        {(isAdmin || isOperacional) && (
          <button 
            onClick={() => { 
              setEditingOficio({ status: 'Aguardando Envio', tipoOficio: 'Circular' }); 
              setIsReadOnly(false);
              setIsModalOpen(true); 
            }}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm tracking-wide"
          >
            <Plus size={20} className="text-white" />
            Novo Ofício
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative group col-span-1 md:col-span-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por Assunto, Destinatário ou Número..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all placeholder:text-slate-400 font-medium"
            />
          </div>
          <div className="flex gap-4 col-span-1 md:col-span-2">
            <select 
              value={searchTipo}
              onChange={(e) => setSearchTipo(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crb-purple font-bold text-sm text-crb-navy min-w-[160px]"
            >
              <option value="">Todos os Tipos</option>
              <option value="Circular">Circular</option>
              <option value="Interno">Interno</option>
              <option value="Externo">Externo</option>
              <option value="Gabinete">Gabinete</option>
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
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Nº do Ofício</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Assunto</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Tipo</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Destinatário</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Data</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Status</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-crb-navy border-t-crb-purple rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest font-sans tracking-[0.2em]">Processando Ofícios...</span>
                  </div>
                </td></tr>
              ) : filteredOficios.length === 0 ? (
                <tr><td colSpan={7} className="px-8 py-20 text-center text-slate-400 font-medium font-sans italic">Nenhum ofício encontrado.</td></tr>
              ) : (
                filteredOficios.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-crb-navy/5 text-crb-purple flex items-center justify-center">
                          <FileText size={20} />
                        </div>
                        <span className="text-sm font-black text-crb-navy font-mono tracking-tighter uppercase">{o.numeroOficio || o.numero}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-700 uppercase tracking-tight line-clamp-1 max-w-[200px]">{o.assunto}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{o.tipoOficio || 'N/A'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-tight line-clamp-1">{o.destinatario}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-black text-crb-navy">{formatDate(o.dataEnvio || o.dataEmissao)}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                        o.status === 'Enviado' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                        o.status === 'Aguardando Envio' ? "bg-purple-50 text-purple-700 border-purple-100" :
                        "bg-red-50 text-red-700 border-red-100"
                      )}>
                        {o.status || 'Enviado'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                        {(isAdmin || isOperacional) && (
                          <>
                            <button 
                              onClick={() => { setEditingOficio(o); setIsReadOnly(false); setIsModalOpen(true); }}
                              className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(o.id)}
                              className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => { setEditingOficio(o); setIsReadOnly(true); setIsModalOpen(true); }}
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
                    {isReadOnly ? <Eye size={24} className="text-white" /> : <FileText size={24} className="text-white" />}
                  </div>
                  <h3 className="text-xl font-serif font-bold text-white">
                    {isReadOnly ? 'Visualizar Ofício' : (editingOficio?.id ? 'Editar Ofício' : 'Registro de Documento Oficial')}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Número do Ofício</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      placeholder="000/2024"
                      value={editingOficio?.numeroOficio || editingOficio?.numero || ''}
                      onChange={(e) => setEditingOficio({...editingOficio!, numeroOficio: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Assunto / Tópico</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy uppercase disabled:opacity-70"
                      placeholder="DESCRIÇÃO DO ASSUNTO"
                      value={editingOficio?.assunto || ''}
                      onChange={(e) => setEditingOficio({...editingOficio!, assunto: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Ofício</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingOficio?.tipoOficio || 'Circular'}
                      onChange={(e) => setEditingOficio({...editingOficio!, tipoOficio: e.target.value as any})}
                    >
                      <option value="Circular">Ofício Circular</option>
                      <option value="Interno">Comunicação Interna</option>
                      <option value="Externo">Ofício Externo</option>
                      <option value="Gabinete">Gabinete da Presidência</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome do Destinatário</label>
                    <input 
                      required
                      type="text"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy uppercase disabled:opacity-70"
                      placeholder="NOME OU INSTITUIÇÃO"
                      value={editingOficio?.destinatario || ''}
                      onChange={(e) => setEditingOficio({...editingOficio!, destinatario: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data de Emissão/Envio</label>
                    <input 
                      required
                      type="date"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingOficio?.dataEnvio?.split('T')[0] || editingOficio?.dataEmissao?.split('T')[0] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingOficio({...editingOficio!, dataEnvio: val ? new Date(val).toISOString() : ''});
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Situação Atual</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingOficio?.status || 'Aguardando Envio'}
                      onChange={(e) => setEditingOficio({...editingOficio!, status: e.target.value as any})}
                    >
                      <option value="Enviado">Enviado / Protocolado</option>
                      <option value="Aguardando Envio">Aguardando Envio</option>
                      <option value="Pendente">Pendente</option>
                      <option value="Cancelado">Cancelado / Sem Efeito</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Observações Adicionais</label>
                  <textarea 
                    disabled={isReadOnly}
                    className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy min-h-[100px] resize-none disabled:opacity-70"
                    placeholder="Notas ou referências adicionais..."
                    value={editingOficio?.observacao || ''}
                    onChange={(e) => setEditingOficio({...editingOficio!, observacao: e.target.value})}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs font-sans"
                  >
                    {isReadOnly ? 'Fechar' : 'Descartar'}
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
                      {saving ? 'Gravando...' : 'Confirmar Registro'}
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
