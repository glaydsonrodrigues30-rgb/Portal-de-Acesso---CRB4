import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, getAggregateFromServer, sum, count } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  CreditCard, Mail, Handshake, FileText, FolderOpen, 
  TrendingUp, AlertTriangle, Clock, ListFilter, DollarSign
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface SummaryStats {
  totalDebitos: number;
  valorTotalAberto: number;
  valorTotalVencido: number;
  totalNotificacoes: number;
  totalNegociacoes: number;
  totalNegociacoesAtivas: number;
  totalNegociacoesConcluidas: number;
  valorNegociadoTotal: number;
  totalOficios: number;
  totalProcessos: number;
  debitosVencidos: number;
  processosPendentes: number;
  notificacoesAtrasadas: number;
  inadimplenciaPercent: number;
}

export default function SummaryView({ onTabChange }: { onTabChange: (tab: any) => void }) {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        
        const debitosCol = collection(db, 'debits');
        const notifCol = collection(db, 'notifications');
        const negCol = collection(db, 'negotiations');
        const oficiosCol = collection(db, 'oficios');
        const processosCol = collection(db, 'processos');

        // Fetching all to apply complex JS logic as requested
        const [
          debitosSnap,
          notifSnap,
          negSnap,
          oficiosSnap,
          processosSnap
        ] = await Promise.all([
          getDocs(debitosCol),
          getDocs(notifCol),
          getDocs(negCol),
          getDocs(oficiosCol),
          getDocs(processosCol)
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day

        // Robust Date Parser as requested
        const parseDate = (d: any) => {
          if (!d) return null;
          if (d instanceof Date) return d;
          const s = String(d);
          if (s.includes('/')) {
            const [dia, mes, ano] = s.split('/');
            return new Date(`${ano}-${mes}-${dia}`);
          }
          return new Date(s);
        };
        
        // Calculation Logic according to request
        const debitos = debitosSnap.docs.map(doc => doc.data());
        const notifications = notifSnap.docs.map(doc => doc.data());
        const negotiations = negSnap.docs.map(doc => doc.data());

        // 1. Débitos Vencidos: data < hoje && status !== "pago"
        const vencidos = debitos.filter(d => {
          const data = parseDate(d.dataVencimento);
          if (!data || isNaN(data.getTime())) return false;
          
          const status = String(d.situacao || d.status || d.statusGeral || '').toLowerCase();
          return data < today && status !== "pago" && status !== "regularizado";
        });

        // 2. Valor Total: sum of valorCorrigido
        const valorTotalAberto = debitos.reduce(
          (acc, d) => acc + Number(d.valorCorrigido || 0),
          0
        );

        const valorTotalVencido = vencidos.reduce(
          (acc, d) => acc + Number(d.valorCorrigido || 0),
          0
        );

        const inadimplenciaPercent = valorTotalAberto > 0 
          ? (valorTotalVencido / valorTotalAberto) * 100 
          : 0;

        // 3. Negociações: apenas status ativo ou concluído
        const negociacoesAtivas = negotiations.filter(n => {
          const status = String(n.status || n.statusGeral || n.statusContato || '').toLowerCase();
          return status === 'ativo';
        });

        const negociacoesConcluidas = negotiations.filter(n => {
          const status = String(n.status || n.statusGeral || n.statusContato || '').toLowerCase();
          return status === 'concluido' || status === 'concluído';
        });

        const valorNegociadoTotal = negotiations.reduce(
          (acc, n) => acc + Number(n.valorNegociado || 0),
          0
        );

        // 4. Notificações: registros válidos (count non-empty)
        const notificacoesValidas = notifications.filter(n => n.tipo || n.dataNotificacao);

        setStats({
          totalDebitos: debitos.length,
          valorTotalAberto: valorTotalAberto,
          valorTotalVencido: valorTotalVencido,
          totalNotificacoes: notificacoesValidas.length,
          totalNegociacoes: negotiations.length,
          totalNegociacoesAtivas: negociacoesAtivas.length,
          totalNegociacoesConcluidas: negociacoesConcluidas.length,
          valorNegociadoTotal: valorNegociadoTotal,
          totalOficios: oficiosSnap.size,
          totalProcessos: processosSnap.size,
          debitosVencidos: vencidos.length,
          processosPendentes: processosSnap.docs.filter(p => String(p.data().status || '').toLowerCase() === 'pendente').length,
          notificacoesAtrasadas: notifications.filter(n => {
            const refDate = n.dataLimite ? parseDate(n.dataLimite) : (n.dataNotificacao && n.prazoDias ? new Date(parseDate(n.dataNotificacao)!.getTime() + (n.prazoDias * 86400000)) : null);
            return refDate && refDate < today && String(n.statusPrazo || '').toLowerCase() !== 'respondido';
          }).length,
          inadimplenciaPercent,
        });
      } catch (err) {
        console.error("Erro ao carregar summary stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-40 bg-slate-100 rounded-[2rem]" />)}
    </div>
  </div>;

  if (!stats) return null;

  return (
    <div className="space-y-12 pb-10">
      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
          <span className="w-8 h-[2px] bg-crb-blue"></span>
          Indicadores Financeiros
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <StatItem 
            title="Total em Aberto" 
            value={formatCurrency(stats.valorTotalAberto)} 
            icon={TrendingUp} 
            color="bg-crb-navy" 
            label={`${stats.totalDebitos} registros ativos`}
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Valor Vencido" 
            value={formatCurrency(stats.valorTotalVencido)} 
            icon={AlertTriangle} 
            color="bg-red-600" 
            label={`${stats.debitosVencidos} débitos fora do prazo`}
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Inadimplência" 
            value={`${stats.inadimplenciaPercent.toFixed(1)}%`} 
            icon={ListFilter} 
            color="bg-amber-500" 
            label="Percentual sobre o total"
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Valor Negociado" 
            value={formatCurrency(stats.valorNegociadoTotal)} 
            icon={DollarSign} 
            color="bg-emerald-600" 
            label={`${stats.totalNegociacoes} acordos totais`}
            onClick={() => onTabChange('negociacoes')}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
          <span className="w-8 h-[2px] bg-crb-purple"></span>
          Gestão de Acordos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatItem 
            title="Acordos Ativos" 
            value={stats.totalNegociacoesAtivas.toString()} 
            icon={Handshake} 
            color="bg-crb-purple" 
            label="Em fase de pagamento"
            onClick={() => onTabChange('negociacoes')}
          />
          <StatItem 
            title="Acordos Concluídos" 
            value={stats.totalNegociacoesConcluidas.toString()} 
            icon={Clock} 
            color="bg-emerald-500" 
            label="Regularização finalizada"
            onClick={() => onTabChange('negociacoes')}
          />
          <div className="bg-slate-50 p-8 rounded-[2rem] border border-dashed border-slate-300 flex flex-col justify-center items-center text-center group hover:border-crb-blue/30 transition-all cursor-pointer" onClick={() => onTabChange('negociacoes')}>
            <p className="text-slate-500 font-bold mb-2">Visão Detalhada</p>
            <p className="text-xs text-slate-400">Acesse o módulo de negociações para filtros avançados</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
          <span className="w-8 h-[2px] bg-slate-400"></span>
          Ações e Expedições
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <StatItem 
            title="Notificações" 
            value={stats.totalNotificacoes.toString()} 
            icon={Mail} 
            color="bg-crb-blue" 
            label={`${stats.notificacoesAtrasadas} sem retorno`}
            onClick={() => onTabChange('notificacoes')}
          />
          <StatItem 
            title="Ofícios" 
            value={stats.totalOficios.toString()} 
            icon={FileText} 
            color="bg-slate-600" 
            label="Expedições Registradas"
            onClick={() => onTabChange('oficios')}
          />
          <StatItem 
            title="Processos" 
            value={stats.totalProcessos.toString()} 
            icon={FolderOpen} 
            color="bg-blue-600" 
            label={`${stats.processosPendentes} em análise`}
            onClick={() => onTabChange('processos')}
          />
        </div>
      </div>
    </div>
  );
}

function StatItem({ title, value, icon: Icon, color, label, onClick }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between gap-6 group hover:border-crb-blue/40 transition-all cursor-pointer h-full"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={cn("p-4 rounded-2xl transition-transform group-hover:scale-110 shadow-lg text-white", color)}>
            <Icon size={20} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-80">{title}</p>
        </div>
        <div className="text-crb-blue opacity-0 group-hover:opacity-100 transition-opacity">
          <ListFilter size={16} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-serif font-black text-crb-navy tracking-tighter leading-tight truncate">{value}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-slate-500 font-bold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            {label}
          </p>
          <span className="text-[9px] font-black text-crb-blue uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
            Ver Detalhes
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function AlertRow({ label, value, status, onClick }: any) {
  const colors = {
    error: 'bg-red-50 text-red-800 border-red-100 hover:bg-red-100',
    warning: 'bg-amber-50 text-amber-800 border-amber-100 hover:bg-amber-100',
    info: 'bg-crb-navy/5 text-crb-navy border-crb-navy/10 hover:bg-crb-navy/10'
  };

  return (
    <div 
      onClick={onClick}
      className={cn("flex items-center justify-between p-6 rounded-2xl border transition-all cursor-pointer", colors[status as keyof typeof colors])}
    >
      <span className="font-black flex items-center gap-4 text-sm md:text-base">
        <Clock size={22} className="opacity-60" />
        {label}
      </span>
      <span className="text-3xl font-serif font-black">{value}</span>
    </div>
  );
}
