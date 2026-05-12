import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, getAggregateFromServer, sum, count } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  CreditCard, Mail, Handshake, FileText, FolderOpen, 
  TrendingUp, AlertTriangle, Clock, ListFilter
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface SummaryStats {
  totalDebitos: number;
  valorTotalAberto: number;
  valorTotalVencido: number;
  totalNotificacoes: number;
  totalNegociacoes: number;
  totalOficios: number;
  totalProcessos: number;
  debitosVencidos: number;
  processosPendentes: number;
  notificacoesAtrasadas: number;
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

        // Aggregates for main stats
        const [
          debitosAgg, 
          notifAgg, 
          negAgg, 
          oficiosAgg, 
          processosAgg,
          vencidosAgg,
          vencidosValorAgg,
          procPendentesAgg
        ] = await Promise.all([
          getAggregateFromServer(debitosCol, { 
            total: count(), 
            valorAberto: sum('valorCorrigido') 
          }),
          getAggregateFromServer(notifCol, { total: count() }),
          getAggregateFromServer(negCol, { total: count() }),
          getAggregateFromServer(oficiosCol, { total: count() }),
          getAggregateFromServer(processosCol, { total: count() }),
          getAggregateFromServer(query(debitosCol, where('statusGeral', '==', 'VENCIDO')), { count: count() }),
          getAggregateFromServer(query(debitosCol, where('statusGeral', '==', 'VENCIDO')), { valorVencido: sum('valorCorrigido') }),
          getAggregateFromServer(query(processosCol, where('status', '==', 'PENDENTE')), { count: count() })
        ]);

        // Correct logic for overdue debts (dataVencimento < today and not regularized)
        const today = new Date();
        const todayISO = today.toISOString();
        
        // We'll fetch the debits that are not regularized to calculate the overdue stats accurately
        const debitsSnap = await getDocs(query(debitosCol, where('statusGeral', '!=', 'regularizado')));
        
        let overdueCount = 0;
        let overdueSum = 0;
        
        debitsSnap.forEach(doc => {
          const data = doc.data();
          if (data.dataVencimento) {
            const vencimento = new Date(data.dataVencimento);
            if (vencimento < today) {
              overdueCount++;
              overdueSum += data.valorCorrigido || 0;
            }
          }
        });

        // Logic for notifications with deadline passed and no response (simplified)
        const lateNotifSnap = await getDocs(query(notifCol, where('dataLimite', '<', todayISO)));
        const lateNotifCount = lateNotifSnap.size;

        setStats({
          totalDebitos: debitosAgg.data().total,
          valorTotalAberto: debitosAgg.data().valorAberto || 0,
          valorTotalVencido: overdueSum,
          totalNotificacoes: notifAgg.data().total,
          totalNegociacoes: negAgg.data().total,
          totalOficios: oficiosAgg.data().total,
          totalProcessos: processosAgg.data().total,
          debitosVencidos: overdueCount,
          processosPendentes: procPendentesAgg.data().count,
          notificacoesAtrasadas: lateNotifCount,
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl" />)}
    </div>
  </div>;

  if (!stats) return null;

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <StatItem 
          title="Débitos" 
          value={stats.totalDebitos.toString()} 
          icon={CreditCard} 
          color="bg-crb-navy" 
          label="Total de Registros"
          onClick={() => onTabChange('debitos')}
        />
        <StatItem 
          title="Valor em Aberto" 
          value={formatCurrency(stats.valorTotalAberto)} 
          icon={TrendingUp} 
          color="bg-emerald-600" 
          label="Valor Corrigido Total"
          onClick={() => onTabChange('debitos')}
        />
        <StatItem 
          title="Débitos Vencidos" 
          value={stats.debitosVencidos.toString()} 
          icon={AlertTriangle} 
          color="bg-red-600" 
          label={`Total: ${formatCurrency(stats.valorTotalVencido)}`}
          onClick={() => onTabChange('debitos')}
        />
        <StatItem 
          title="Notificações" 
          value={stats.totalNotificacoes.toString()} 
          icon={Mail} 
          color="bg-crb-blue" 
          label="Comunicações Enviadas"
          onClick={() => onTabChange('notificacoes')}
        />
        <StatItem 
          title="Negociações" 
          value={stats.totalNegociacoes.toString()} 
          icon={Handshake} 
          color="bg-crb-purple" 
          label="Acordos Realizados"
          onClick={() => onTabChange('negociacoes')}
        />
        <StatItem 
          title="Processos" 
          value={stats.totalProcessos.toString()} 
          icon={FolderOpen} 
          color="bg-crb-blue text-white" 
          label="Ações Administrativas"
          onClick={() => onTabChange('processos')}
        />
      </div>
    </div>
  );
}

function StatItem({ title, value, icon: Icon, color, label, onClick }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      onClick={onClick}
      className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex items-center gap-6 group hover:border-crb-blue/40 transition-all cursor-pointer"
    >
      <div className={cn("p-5 rounded-2xl transition-transform group-hover:scale-110 shadow-2xl text-white", color)}>
        <Icon size={24} />
      </div>
      <div className="flex-1">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 opacity-80">{title}</p>
        <p className="text-4xl font-serif font-black text-crb-navy tracking-tighter leading-none">{value}</p>
        <p className="text-xs text-slate-500 font-bold mt-2.5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
          {label}
        </p>
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
