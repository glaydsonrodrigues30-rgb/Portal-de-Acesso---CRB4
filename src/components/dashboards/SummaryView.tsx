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

        // 3. Negociações: apenas status ativo ou concluído
        const negociacoesValidas = negotiations.filter(n => {
          const status = (n.status || n.statusGeral || n.statusContato || '').toLowerCase();
          return status === 'ativo' || status === 'concluido' || status === 'concluído';
        });

        // 4. Notificações: registros válidos (count non-empty)
        const notificacoesValidas = notifications.filter(n => n.tipo || n.dataNotificacao);

        setStats({
          totalDebitos: debitos.length,
          valorTotalAberto: valorTotalAberto,
          valorTotalVencido: valorTotalVencido,
          totalNotificacoes: notificacoesValidas.length,
          totalNegociacoes: negociacoesValidas.length,
          totalOficios: oficiosSnap.size,
          totalProcessos: processosSnap.size,
          debitosVencidos: vencidos.length,
          processosPendentes: processosSnap.docs.filter(p => (p.data().status || '').toLowerCase() === 'pendente').length,
          notificacoesAtrasadas: notifications.filter(n => {
            const refDate = n.dataLimite ? parseDate(n.dataLimite) : (n.dataNotificacao && n.prazoDias ? new Date(parseDate(n.dataNotificacao)!.getTime() + (n.prazoDias * 86400000)) : null);
            return refDate && refDate < today && (n.statusPrazo || '').toLowerCase() !== 'respondido';
          }).length,
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
    <div className="space-y-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <StatItem 
          title="Débitos Totais" 
          value={stats.totalDebitos.toString()} 
          icon={CreditCard} 
          color="bg-crb-navy" 
          label="Base Sincronizada"
          onClick={() => onTabChange('debitos')}
        />
        <StatItem 
          title="Valor Global" 
          value={formatCurrency(stats.valorTotalAberto)} 
          icon={TrendingUp} 
          color="bg-emerald-600" 
          label="Total Corrigido"
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
          label="Comunicações Válidas"
          onClick={() => onTabChange('notificacoes')}
        />
        <StatItem 
          title="Negociações" 
          value={stats.totalNegociacoes.toString()} 
          icon={Handshake} 
          color="bg-crb-purple" 
          label="Acordos Ativos/Concluídos"
          onClick={() => onTabChange('negociacoes')}
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
      className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between gap-6 group hover:border-crb-blue/40 transition-all cursor-pointer h-full"
    >
      <div className="flex items-center gap-4">
        <div className={cn("p-4 rounded-2xl transition-transform group-hover:scale-110 shadow-lg text-white", color)}>
          <Icon size={20} />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-80">{title}</p>
      </div>
      <div>
        <p className="text-3xl font-serif font-black text-crb-navy tracking-tighter leading-tight truncate">{value}</p>
        <p className="text-[10px] text-slate-500 font-bold mt-2 flex items-center gap-2">
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
