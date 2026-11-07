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
import { Oficio } from '@/src/types';
import { 
  Plus, 
  FileText, 
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
  normalizarTipoOficio 
} from '../lib/numeracao';

const CURRENT_YEAR = new Date().getFullYear();

export default function Oficios() {
  const { userData, isAdmin, isOperacional } = useAuth();
  const [oficios, setOficios] = useState<Oficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // B) Seletor de Ano com padrão no ano atual
  const [searchAno, setSearchAno] = useState<string>(CURRENT_YEAR.toString());
  const [searchTipo, setSearchTipo] = useState('');
  
  const [editingOficio, setEditingOficio] = useState<Partial<Oficio> | null>(null);
  const [isNumeroManual, setIsNumeroManual] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleOficioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        
        setEditingOficio(prev => {
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

  const removeOficioAnexo = (id: string) => {
    setEditingOficio(prev => {
      if (!prev) return prev;
      const currentAnexos = prev.anexos || [];
      return {
        ...prev,
        anexos: currentAnexos.filter(anexo => anexo.id !== id)
      };
    });
  };

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

  // Lista dinâmica de anos a partir dos dados existentes
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(CURRENT_YEAR);
    oficios.forEach(o => {
      const a = o.ano || getAnoDe(o.dataEnvio || o.dataEmissao);
      if (a) set.add(a);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [oficios]);

  // Lista dinâmica de tipos de ofício
  const availableTipos = useMemo(() => {
    const set = new Set<string>(['Circular', 'Presidente', 'Administrativo', 'Gabinete', 'Interno', 'Externo']);
    oficios.forEach(o => {
      const t = o.tipoOficio || o.tipo;
      if (t) set.add(normalizarTipoOficio(t));
    });
    return Array.from(set).sort();
  }, [oficios]);

  // Abertura do formulário de Novo Ofício com preenchimento automático
  const handleOpenNovoOficio = () => {
    const anoAtual = CURRENT_YEAR;
    const prox = proximoNumero(oficios, anoAtual);
    const dataPadrao = new Date().toISOString();

    setEditingOficio({
      status: 'Aguardando Envio',
      tipoOficio: 'Circular',
      tipo: 'Circular',
      dataEnvio: dataPadrao,
      dataEmissao: dataPadrao,
      ano: anoAtual,
      numeroOficio: prox,
      numero: prox
    });
    setIsNumeroManual(false);
    setIsReadOnly(false);
    setIsModalOpen(true);
  };

  // Re-geração automática do número sugerido
  const handleGerarNumeroAutomatico = () => {
    const docDate = editingOficio?.dataEnvio || editingOficio?.dataEmissao;
    const ano = getAnoDe(docDate);
    const sugerido = proximoNumero(oficios, ano);
    setEditingOficio(prev => prev ? ({
      ...prev,
      numeroOficio: sugerido,
      numero: sugerido,
      ano
    }) : prev);
    setIsNumeroManual(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOficio || isReadOnly) return;

    const numLimpo = (editingOficio.numeroOficio || editingOficio.numero || '').trim();
    if (!numLimpo) {
      alert('Por favor, informe o número do ofício.');
      return;
    }

    const formAno = getAnoDe(editingOficio.dataEnvio || editingOficio.dataEmissao);

    // Validação de unicidade no mesmo ano
    if (existeNumeroNoAno(oficios, numLimpo, formAno, editingOficio.id)) {
      const proxLivre = proximoNumero(oficios, formAno);
      alert(`Número já utilizado em ${formAno}. Próximo disponível: ${proxLivre}`);
      return;
    }

    setSaving(true);
    try {
      const tipoFinal = normalizarTipoOficio(editingOficio.tipoOficio || editingOficio.tipo || 'Circular');
      
      const payload: any = {
        ...editingOficio,
        numero: numLimpo,
        numeroOficio: numLimpo,
        tipo: tipoFinal,
        tipoOficio: tipoFinal,
        ano: formAno,
        updatedAt: new Date().toISOString(),
        createdAt: editingOficio.id ? (editingOficio.createdAt || new Date().toISOString()) : new Date().toISOString()
      };

      if (editingOficio.id) {
        await updateDoc(doc(db, 'oficios', editingOficio.id), payload);
        await logAuditoria('EDICAO', 'OFICIOS', editingOficio.id);
        alert('Ofício atualizado com sucesso.');
      } else {
        // Chave natural determinística ofi_NNN_AAAA
        const parsed = extrairSeqAno(numLimpo);
        const seqStr = parsed ? String(parsed.seq).padStart(3, '0') : numLimpo.replace(/[^a-zA-Z0-9]/g, '_');
        const chaveNatural = `ofi_${seqStr}_${formAno}`;

        payload.id = chaveNatural;
        await setDoc(doc(db, 'oficios', chaveNatural), payload, { merge: true });
        await logAuditoria('CRIACAO', 'OFICIOS', chaveNatural);
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

  // Filtragem e ordenação decrescente por número dentro do ano
  const filteredOficios = useMemo(() => {
    return oficios.filter(o => {
      const search = searchTerm.toLowerCase();
      const matchesSubject = o.assunto?.toLowerCase().includes(search);
      const matchesDest = o.destinatario?.toLowerCase().includes(search);
      const matchesNum = (o.numeroOficio || o.numero)?.toLowerCase().includes(search);

      // Filtro de ano estrito
      let matchesAno = true;
      if (searchAno && searchAno !== 'TODOS') {
        const itemAno = o.ano || extrairSeqAno(o.numeroOficio || o.numero)?.ano || getAnoDe(o.dataEnvio || o.dataEmissao);
        matchesAno = itemAno.toString() === searchAno;
      }

      // Filtro de tipo normalizado
      let matchesTipo = true;
      if (searchTipo) {
        const itemTipo = normalizarTipoOficio(o.tipoOficio || o.tipo);
        matchesTipo = itemTipo === searchTipo;
      }

      return (matchesSubject || matchesDest || matchesNum) && matchesAno && matchesTipo;
    }).sort((a, b) => {
      // Ordenação decrescente por número dentro do ano
      const seqA = extrairSeqAno(a.numeroOficio || a.numero)?.seq || 0;
      const seqB = extrairSeqAno(b.numeroOficio || b.numero)?.seq || 0;
      if (seqB !== seqA) return seqB - seqA;

      const dateA = new Date(a.dataEnvio || a.dataEmissao || 0).getTime();
      const dateB = new Date(b.dataEnvio || b.dataEmissao || 0).getTime();
      return dateB - dateA;
    });
  }, [oficios, searchTerm, searchAno, searchTipo]);

  const formAnoAtual = getAnoDe(editingOficio?.dataEnvio || editingOficio?.dataEmissao);
  const proximoSugestao = proximoNumero(oficios, formAnoAtual);

  return (
    <div className="space-y-8 text-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Ofícios Expedidos</h2>
          <p className="text-slate-500 font-medium font-sans">
            Controle de correspondências oficiais enviadas ({searchAno === 'TODOS' || !searchAno ? 'Todos os Anos' : `Exercício ${searchAno}`}).
          </p>
        </div>
        {(isAdmin || isOperacional) && (
          <button 
            onClick={handleOpenNovoOficio}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm tracking-wide cursor-pointer"
          >
            <Plus size={20} className="text-white" />
            Novo Ofício
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
              placeholder="Buscar por Assunto, Destinatário ou Número..." 
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

          {/* Seletor de Tipo com tipos dinâmicos */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Ofício</label>
            <select 
              value={searchTipo}
              onChange={(e) => setSearchTipo(e.target.value)}
              className="px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none focus:border-crb-purple font-bold text-sm text-crb-navy bg-white transition-all cursor-pointer"
            >
              <option value="">Todos os Tipos</option>
              {availableTipos.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Ofícios */}
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
                <tr><td colSpan={7} className="px-8 py-20 text-center text-slate-400 font-medium font-sans italic">
                  Nenhum ofício encontrado para os filtros selecionados.
                </td></tr>
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
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2.5 py-1 rounded-md bg-slate-100">
                        {normalizarTipoOficio(o.tipoOficio || o.tipo)}
                      </span>
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
                              className="p-2 text-crb-navy hover:text-white hover:bg-crb-navy rounded-lg transition-all border border-slate-100 shadow-xs cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(o.id)}
                              className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all border border-slate-100 shadow-xs cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => { setEditingOficio(o); setIsReadOnly(true); setIsModalOpen(true); }}
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

      {/* Modal de Cadastro/Edição de Ofício */}
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
                        Número do Ofício
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
                        value={editingOficio?.numeroOficio || editingOficio?.numero || ''}
                        onChange={(e) => {
                          setIsNumeroManual(true);
                          setEditingOficio({
                            ...editingOficio!,
                            numeroOficio: e.target.value,
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

                  {/* Tipo de Ofício com opções completas */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Ofício</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70 cursor-pointer"
                      value={editingOficio?.tipoOficio || editingOficio?.tipo || 'Circular'}
                      onChange={(e) => setEditingOficio({
                        ...editingOficio!,
                        tipoOficio: e.target.value,
                        tipo: e.target.value
                      })}
                    >
                      <option value="Circular">Ofício Circular</option>
                      <option value="Presidente">Presidente</option>
                      <option value="Administrativo">Administrativo</option>
                      <option value="Gabinete">Gabinete da Presidência</option>
                      <option value="Interno">Comunicação Interna</option>
                      <option value="Externo">Ofício Externo</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
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

                  {/* Data com recálculo automático de número caso usuário não tenha editado manualmente */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data de Emissão/Envio</label>
                    <input 
                      required
                      type="date"
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70"
                      value={editingOficio?.dataEnvio?.split('T')[0] || editingOficio?.dataEmissao?.split('T')[0] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const novoAno = getAnoDe(val);
                        const isoStr = val ? new Date(val).toISOString() : '';

                        setEditingOficio(prev => {
                          if (!prev) return prev;
                          // Se o usuário não editou manualmente e for novo registro, recalcula a sugestão do ano
                          const numAtualizado = (!isNumeroManual && !prev.id)
                            ? proximoNumero(oficios, novoAno)
                            : prev.numeroOficio;

                          return {
                            ...prev,
                            dataEnvio: isoStr,
                            dataEmissao: isoStr,
                            ano: novoAno,
                            numeroOficio: numAtualizado,
                            numero: numAtualizado
                          };
                        });
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Situação Atual</label>
                    <select 
                      disabled={isReadOnly}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-crb-navy disabled:opacity-70 cursor-pointer"
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
                          onChange={handleOficioFileUpload} 
                        />
                      </label>
                    )}
                  </div>
                  
                  {editingOficio?.anexos && editingOficio.anexos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                      {editingOficio.anexos.map((file) => (
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
                                onClick={() => removeOficioAnexo(file.id)}
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
                    <p className="text-[11px] text-slate-400 italic">Nenhum documento anexado a este ofício.</p>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs font-sans cursor-pointer"
                  >
                    {isReadOnly ? 'Fechar' : 'Descartar'}
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
