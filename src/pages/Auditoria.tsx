import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AuditoriaLog } from '@/src/types';
import { History, User, Clock, Tag, Search, Filter } from 'lucide-react';
import { formatDate, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion } from 'motion/react';

export default function Auditoria() {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditoriaLog[]>([]);
  const [loading, setLoading] = useState(true);

  if (!isAdmin) return <div className="p-8 text-center">Acesso negado.</div>;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'auditoria'), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })) as AuditoriaLog[]);
    } catch (err) { handleFirestoreError(err, OperationType.LIST, 'auditoria'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, []);

  const getActionColor = (acao: string) => {
    switch(acao) {
      case 'CRIACAO': return 'text-emerald-600 bg-emerald-50';
      case 'EDICAO': return 'text-blue-600 bg-blue-50';
      case 'EXCLUSAO': return 'text-red-600 bg-red-50';
      case 'IMPORTACAO': return 'text-violet-600 bg-violet-50';
      default: return 'text-slate-600 bg-slate-50';
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-l-4 border-crb-purple pl-6">
        <h2 className="text-3xl font-serif font-bold text-crb-navy">Logs de Auditoria</h2>
        <p className="text-slate-500 font-medium tracking-tight">Rastro completo e imutável de todas as ações administrativas e operacionais.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-crb-navy">
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans">Stamp Temporal</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans">Agente</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans">Ação Executada</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans">Módulo/Contexto</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans">Metadados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Recuperando registros do servidor de auditoria...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-serif text-lg">Nenhum rastro de atividade encontrado no período.</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-8 py-5 whitespace-nowrap">
                    <div className="flex items-center gap-3 text-sm text-crb-navy font-bold">
                      <Clock size={16} className="text-crb-purple" />
                      {log.timestamp && (log.timestamp as any).toDate 
                        ? (log.timestamp as any).toDate().toLocaleString('pt-BR') 
                        : (log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'Data Indeterminada')}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{log.userEmail}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">ID: {log.userId.slice(0,8).toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm",
                      getActionColor(log.acao)
                    )}>
                      {log.acao}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-crb-navy uppercase tracking-widest bg-crb-navy/5 px-2 py-1 rounded-lg border border-crb-navy/10">
                      <Tag size={12} className="text-crb-yellow" />
                      {log.modulo}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-[10px] text-slate-500 font-mono font-bold bg-slate-50 p-2 rounded-xl border border-slate-200 max-w-[200px] truncate shadow-inner">
                      {log.entidadeId}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
