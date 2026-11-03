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
import { getStatusDebito } from '../../lib/statusDebito';

interface SummaryStats {
  totalDebitos: number;
  valorTotalAberto: number;
  valorTotalVencido: number;
  totalNotificacoes: number;
  notificacoesDefesaEsgotada: number;
  totalNegociacoes: number;
  totalNegociacoesAtivas: number;
  totalNegociacoesConcluidas: number;
  valorNegociadoTotal: number;
  totalOficios: number;
  totalProcessos: number;
  debitosVencidos: number;
  processosPendentes: number;
  inadimplenciaPercent: number;
  parcelasAtivas: number;
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
        const oficiosCol = collection(db, 'oficios');
        const processosCol = collection(db, 'processos');

        // Fetching all
        const [
          debitosSnap,
          notifSnap,
          oficiosSnap,
          processosSnap
        ] = await Promise.all([
          getDocs(debitosCol),
          getDocs(notifCol),
          getDocs(oficiosCol),
          getDocs(processosCol)
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day
        
        // Calculation Logic according to request
        const debitos = debitosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
        const notifications = notifSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);

        // 1. Débitos Vencidos: usando regra central única getStatusDebito
        const vencidos = debitos.filter(d => {
          const statusInfo = getStatusDebito(d, notifications);
          return statusInfo.prazo === 'VENCIDO';
        });

        // 2. Valor Total: sum of valorCorrigido (or valor)
        const valorTotalAberto = debitos.reduce(
          (acc, d) => acc + Number(d.valorCorrigido || d.valor || 0),
          0
        );

        const valorTotalVencido = vencidos.reduce(
          (acc, d) => acc + Number(d.valorCorrigido || d.valor || 0),
          0
        );

        const inadimplenciaPercent = valorTotalAberto > 0 
          ? (valorTotalVencido / valorTotalAberto) * 100 
          : 0;

        // 3. Negociações a partir dos débitos e do motor central
        const debitosEmNegociacao = debitos.filter(d => {
          const statusInfo = getStatusDebito(d, notifications);
          return statusInfo.isNegociacao || d.statusGeral === 'Em Negociação';
        });
        
        const totalNegociacoes = debitosEmNegociacao.length;
        const totalNegociacoesAtivas = debitosEmNegociacao.filter(d => d.negociacao?.ativo !== false).length;
        const totalNegociacoesConcluidas = debitos.filter(d => d.statusGeral === 'Pago' && d.negociacao).length;
        
        const valorNegociadoTotal = debitosEmNegociacao.reduce(
          (acc, d) => acc + Number(d.valorCorrigido || d.valor || 0),
          0
        );
        const totalParcelasAtivas = debitosEmNegociacao.reduce(
          (acc, d) => acc + Number(d.negociacao?.parcelas || 0),
          0
        );

        // 4. Notificações: contagem de débitos na fase Notificação e com prazo de defesa esgotado
        const debitosNaNotificacao = debitos.filter(d => {
          const statusInfo = getStatusDebito(d, notifications);
          return statusInfo.fase === 'Notificação';
        });

        const notificacoesDefesaEsgotada = debitosNaNotificacao.filter(d => {
          const statusInfo = getStatusDebito(d, notifications);
          return statusInfo.prazo === 'VENCIDO';
        }).length;

        setStats({
          totalDebitos: debitos.length,
          valorTotalAberto: valorTotalAberto,
          valorTotalVencido: valorTotalVencido,
          totalNotificacoes: debitosNaNotificacao.length,
          notificacoesDefesaEsgotada: notificacoesDefesaEsgotada,
          totalNegociacoes: totalNegociacoes,
          totalNegociacoesAtivas: totalNegociacoesAtivas,
          totalNegociacoesConcluidas: totalNegociacoesConcluidas,
          valorNegociadoTotal: valorNegociadoTotal,
          totalOficios: oficiosSnap.size,
          totalProcessos: processosSnap.size,
          debitosVencidos: vencidos.length,
          processosPendentes: processosSnap.docs.filter(p => String(p.data().status || '').toLowerCase() === 'pendente').length,
          inadimplenciaPercent,
          parcelasAtivas: totalParcelasAtivas,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatItem 
            title="Total em Aberto" 
            value={formatCurrency(stats.valorTotalAberto)} 
            icon={TrendingUp} 
            color="bg-crb-navy" 
            subtitle="Soma de todos os débitos em cobrança ativa"
            label={`${stats.totalDebitos} registros ativos`}
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Valor Vencido" 
            value={formatCurrency(stats.valorTotalVencido)} 
            icon={AlertTriangle} 
            color="bg-red-600" 
            subtitle="Valores com prazo de pagamento ou defesa expirado"
            label={`${stats.debitosVencidos} débitos fora do prazo`}
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Inadimplência" 
            value={`${stats.inadimplenciaPercent.toFixed(1)}%`} 
            icon={ListFilter} 
            color="bg-amber-500" 
            subtitle="Percentual do valor vencido sobre o total em aberto"
            label="Taxa de inadimplência sobre a carteira"
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Valor Negociado" 
            value={formatCurrency(stats.valorNegociadoTotal)} 
            icon={DollarSign} 
            color="bg-emerald-600" 
            subtitle="Total acordado em parcelamentos e negociações"
            label={`${stats.totalNegociacoes} débitos em negociação`}
            onClick={() => onTabChange('debitos')}
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
            subtitle="Parcelamentos ativos em cumprimento"
            label="Em fase de pagamento"
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Parcelas Ativas" 
            value={stats.parcelasAtivas.toString()} 
            icon={Clock} 
            color="bg-emerald-500" 
            subtitle="Total de parcelas registradas nos acordos"
            label="Soma das parcelas acordadas"
            onClick={() => onTabChange('debitos')}
          />
          <div className="bg-slate-50 p-8 rounded-[2rem] border border-dashed border-slate-300 flex flex-col justify-center items-center text-center group hover:border-crb-blue/30 transition-all cursor-pointer min-w-0" onClick={() => onTabChange('debitos')}>
            <p className="text-slate-500 font-bold mb-2">Visão Detalhada</p>
            <p className="text-xs text-slate-400">Acesse o módulo de débitos para filtros avançados</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
          <span className="w-8 h-[2px] bg-slate-400"></span>
          Ações e Expedições
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatItem 
            title="Notificações" 
            value={stats.totalNotificacoes.toString()} 
            icon={Mail} 
            color="bg-crb-blue" 
            subtitle="Débitos na fase de Notificação com controle de prazo de defesa (30 dias)"
            label={`${stats.notificacoesDefesaEsgotada} com prazo de defesa esgotado (sem retorno)`}
            onClick={() => onTabChange('debitos')}
          />
          <StatItem 
            title="Ofícios" 
            value={stats.totalOficios.toString()} 
            icon={FileText} 
            color="bg-slate-600" 
            subtitle="Ofícios e correspondências oficiais expedidas"
            label="Expedições Registradas"
            onClick={() => onTabChange('oficios')}
          />
          <StatItem 
            title="Processos" 
            value={stats.totalProcessos.toString()} 
            icon={FolderOpen} 
            color="bg-blue-600" 
            subtitle="Processos administrativos em acompanhamento"
            label={`${stats.processosPendentes} em análise`}
            onClick={() => onTabChange('processos')}
          />
        </div>
      </div>
    </div>
  );
}

function StatItem({ title, value, icon: Icon, color, label, subtitle, onClick }: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  label: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white p-5 sm:p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between gap-4 group hover:border-crb-blue/40 transition-all cursor-pointer h-full w-full min-w-0 overflow-hidden"
    >
      <div className="w-full flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between w-full">
          <div className={cn("p-3 rounded-2xl transition-transform group-hover:scale-110 shadow-lg text-white shrink-0", color)}>
            <Icon size={20} />
          </div>
          <div className="text-crb-blue opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <ListFilter size={16} />
          </div>
        </div>
        <div className="w-full min-w-0 text-left">
          <p 
            className="text-[11px] sm:text-xs font-black text-slate-500 uppercase tracking-tight text-left leading-tight w-full [overflow-wrap:normal] [word-break:normal] [hyphens:none]"
            style={{ overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none' }}
          >
            {title}
          </p>
        </div>
      </div>

      <div className="w-full min-w-0 space-y-2">
        <p className="text-[clamp(1.2rem,1.8vw,1.875rem)] font-serif font-black text-crb-navy tracking-tight leading-snug tabular-nums break-normal">
          {value}
        </p>
        {subtitle && (
          <p 
            className="text-[10px] sm:text-[11px] text-slate-400 font-medium leading-relaxed w-full [overflow-wrap:normal] [word-break:normal]"
            style={{ overflowWrap: 'normal', wordBreak: 'normal' }}
          >
            {subtitle}
          </p>
        )}
        <div className="w-full pt-2.5 border-t border-slate-100 min-w-0">
          <p 
            className="text-[10px] sm:text-[11px] text-slate-600 font-bold flex items-start gap-1.5 leading-normal w-full [overflow-wrap:normal] [word-break:normal] [hyphens:none]"
            style={{ overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1 shrink-0"></span>
            <span className="flex-1 w-full">{label}</span>
          </p>
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
