import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency, cn } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Handshake, DollarSign, Target, Calendar, AlertCircle, TrendingUp, Percent, ArrowDownRight } from 'lucide-react';

const COLORS = ['#1e3a8a', '#10b981', '#f59e0b', '#ef4444'];

export default function NegociacoesView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const negCol = collection(db, 'negotiations');
        const notifCol = collection(db, 'notifications');
        
        const [negSnap, notifSnap] = await Promise.all([
          getDocs(query(negCol, limit(1000))),
          getDocs(query(notifCol, limit(1000)))
        ]);

        const negotiations = negSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const totalNotificacoes = notifSnap.size;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let valorTotalOriginal = 0;
        let valorTotalNegociado = 0;
        let concluidos = 0;
        let ativos = 0;
        let cancelados = 0;
        let emAtraso = 0;
        let proximosVencimento = 0;

        const statusMap: any = { 'Ativo': 0, 'Concluído': 0, 'Cancelado': 0 };

        negotiations.forEach((n: any) => {
          const status = String(n.status || n.statusGeral || n.statusContato || 'Ativo').toLowerCase();
          const valorOriginal = Number(n.valorTotal || n.valorOriginal || 0);
          const valorNegociado = Number(n.valorNegociado || 0);

          valorTotalOriginal += valorOriginal;
          valorTotalNegociado += valorNegociado;

          if (status === 'concluido' || status === 'concluído') {
            concluidos++;
            statusMap['Concluído']++;
          } else if (status === 'cancelado') {
            cancelados++;
            statusMap['Cancelado']++;
          } else {
            ativos++;
            statusMap['Ativo']++;
            
            // Logic for alerts
            if (n.proximaParcelaVencimento) {
              const vDate = new Date(n.proximaParcelaVencimento);
              if (vDate < today) emAtraso++;
              else if (vDate.getTime() - today.getTime() < 7 * 86400000) proximasVencimento++;
            }
          }
        });

        const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));
        
        // requested conversion: concluidos / total notificações
        const conversionRate = totalNotificacoes > 0 ? (concluidos / totalNotificacoes) * 100 : 0;
        const discountAvg = valorTotalOriginal > 0 ? ((1 - (valorTotalNegociado / valorTotalOriginal)) * 100) : 0;
        const recoveryRate = valorTotalOriginal > 0 ? (valorTotalNegociado / valorTotalOriginal) * 100 : 0;

        setStats({
          total: negotiations.length,
          valorTotalOriginal,
          valorTotalNegociado,
          concluidos,
          ativos,
          cancelados,
          emAtraso,
          proximosVencimento,
          conversionRate,
          discountAvg,
          recoveryRate,
          statusData
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="h-96 flex items-center justify-center">Carregando painel de negociações...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Taxa de Conversão" 
          value={`${stats.conversionRate.toFixed(1)}%`} 
          icon={Target} 
          color="bg-crb-navy" 
          label={`De ${stats.concluidos} negociações concluídas`}
        />
        <MetricCard 
          title="Valor Negociado" 
          value={formatCurrency(stats.valorTotalNegociado)} 
          icon={DollarSign} 
          color="bg-emerald-600" 
          label={`Base original: ${formatCurrency(stats.valorTotalOriginal)}`}
        />
        <MetricCard 
          title="Desconto Médio" 
          value={`${stats.discountAvg.toFixed(1)}%`} 
          icon={ArrowDownRight} 
          color="bg-amber-500" 
          label="Em relação ao valor original"
        />
        <MetricCard 
          title="Recuperação" 
          value={`${stats.recoveryRate.toFixed(1)}%`} 
          icon={TrendingUp} 
          color="bg-crb-purple" 
          label="Percentual de capital mantido"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
          <div className="flex items-center justify-between mb-10">
            <h4 className="text-xl font-serif font-black text-crb-navy border-l-4 border-emerald-500 pl-4">Distribuição por Status</h4>
            <div className="flex gap-4">
               {stats.statusData.map((s: any, i: number) => (
                 <div key={i} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }}></span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.name}</span>
                 </div>
               ))}
            </div>
          </div>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="99%" height="100%">
              <PieChart>
                <Pie
                  data={stats.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {stats.statusData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <AlertCard 
            title="Próximos Vencimentos" 
            value={stats.proximosVencimento} 
            description="Acordos com parcelas a vencer nos próximos 7 dias. Risco moderado."
            icon={Calendar} 
            color="bg-amber-50" 
            textColor="text-amber-800"
            subColor="text-amber-600"
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
          />

          <AlertCard 
            title="Acordos em Atraso" 
            value={stats.emAtraso} 
            description="Negociações com parcelas vencidas e não pagas. Risco de cancelamento."
            icon={AlertCircle} 
            color="bg-red-50" 
            textColor="text-red-800"
            subColor="text-red-600"
            iconBg="bg-red-100"
            iconColor="text-red-600"
          />

          <div className="bg-crb-navy p-8 rounded-[2rem] text-white flex flex-col justify-between h-[200px] shadow-lg">
             <div>
                <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">Acordos Ativos</p>
                <p className="text-4xl font-serif font-black">{stats.ativos}</p>
             </div>
             <p className="text-xs text-white/70 font-medium">Fluxo de caixa recorrente em monitoramento pelo sistema.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color, label }: any) {
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 hover:shadow-2xl transition-all h-full flex flex-col justify-between group">
      <div>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg transition-transform group-hover:rotate-12", color)}>
          <Icon size={20} />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{title}</p>
        <p className="text-3xl font-serif font-black text-crb-navy tracking-tight truncate">{value}</p>
      </div>
      <p className="text-[10px] text-slate-500 font-bold mt-4 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
        {label}
      </p>
    </div>
  );
}

function AlertCard({ title, value, description, icon: Icon, color, textColor, subColor, iconBg, iconColor }: any) {
  return (
    <div className={cn("p-8 rounded-[2rem] border flex items-start gap-6 group hover:shadow-md transition-all", color, color.replace('bg-', 'border-').replace('50', '100'))}>
      <div className={cn("p-4 rounded-2xl group-hover:scale-110 transition-transform", iconBg, iconColor)}>
        <Icon size={32} />
      </div>
      <div>
        <h5 className={cn("font-bold text-lg font-serif", textColor)}>{title}</h5>
        <p className={cn("font-medium mb-4 text-xs", subColor)}>{description}</p>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-4xl font-serif font-black", textColor)}>{value}</span>
          <span className={cn("text-[10px] font-black uppercase tracking-widest", subColor)}>Registros</span>
        </div>
      </div>
    </div>
  );
}
