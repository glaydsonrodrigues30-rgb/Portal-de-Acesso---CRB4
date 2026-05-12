import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, getAggregateFromServer, sum, count, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { CreditCard, DollarSign, Activity, AlertCircle, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const COLORS = ['#1e3a8a', '#3b82f6', '#ef4444', '#10b981', '#7c3aed'];

export default function DebitosView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'debits');
        
        // Basic Aggregates
        const agg = await getAggregateFromServer(col, {
          total: count(),
          valorTotal: sum('valor'),
          valorCorrigido: sum('valorCorrigido')
        });

        // Vencidos & Antigos
        const vencidosAgg = await getAggregateFromServer(query(col, where('statusGeral', '==', 'VENCIDO')), { count: count() });
        
        const fiveYearsAgo = (new Date().getFullYear()) - 5;
        const antigosAgg = await getAggregateFromServer(query(col, where('ano', '<=', fiveYearsAgo)), { count: count() });

        // Ranking (Limit to top 5)
        const rankingSnap = await getDocs(query(col, orderBy('valorCorrigido', 'desc'), limit(5)));
        const ranking = rankingSnap.docs.map(d => ({
          crb: d.data().crb,
          nome: d.data().nome,
          valor: d.data().valorCorrigido
        }));

        // Grouping logic (Since Firestore doesn't support GROUP BY yet)
        const snapshot = await getDocs(query(col, limit(1000)));
        const data = snapshot.docs.map(d => d.data());
        
        const statusMap: any = {};
        const yearMap: any = {};
        
        data.forEach((d: any) => {
          statusMap[d.statusGeral] = (statusMap[d.statusGeral] || 0) + 1;
          yearMap[d.ano] = (yearMap[d.ano] || 0) + 1;
        });

        const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));
        const yearData = Object.entries(yearMap)
          .map(([name, value]) => ({ name: name.toString(), value: value as number }))
          .sort((a, b) => parseInt(a.name) - parseInt(b.name));

        setStats({
          agg: agg.data(),
          vencidos: vencidosAgg.data().count,
          antigos: antigosAgg.data().count,
          ranking,
          statusData,
          yearData
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="h-96 flex items-center justify-center">Carregando painel financeiro...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MiniCard title="Volume de Débitos" value={stats.agg.total} icon={CreditCard} color="blue" />
        <MiniCard title="Valor Original" value={formatCurrency(stats.agg.valorTotal)} icon={DollarSign} color="purple" />
        <MiniCard title="Valor Corrigido" value={formatCurrency(stats.agg.valorCorrigido)} icon={Activity} color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Charts */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 transition-all hover:shadow-2xl overflow-hidden">
          <h4 className="text-xl font-serif font-black text-crb-navy mb-8 px-2 border-l-4 border-crb-blue pl-4">Débitos por Status</h4>
          <div className="w-full h-[300px] min-h-[300px] flex items-center justify-center">
             {stats.statusData.length > 0 ? (
               <ResponsiveContainer width="99%" height="100%">
                 <PieChart>
                   <Pie 
                    data={stats.statusData} 
                    innerRadius={60} 
                    outerRadius={100} 
                    paddingAngle={8} 
                    dataKey="value"
                    stroke="none"
                   >
                     {stats.statusData.map((_: any, i: any) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                   </Pie>
                   <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                   />
                   <Legend verticalAlign="bottom" height={36} iconType="circle" />
                 </PieChart>
               </ResponsiveContainer>
             ) : (
               <div className="text-slate-400 font-bold italic text-sm text-center">
                 Sem dados suficientes para exibição de status
               </div>
             )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 transition-all hover:shadow-2xl overflow-hidden">
          <h4 className="text-xl font-serif font-black text-crb-navy mb-8 px-2 border-l-4 border-crb-purple pl-4">Distribuição por Ano</h4>
          <div className="w-full h-[300px] min-h-[300px] flex items-center justify-center">
            {stats.yearData.length > 0 ? (
              <ResponsiveContainer width="99%" height="100%">
                <BarChart data={stats.yearData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" fill="#1e3a8a" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 font-bold italic text-sm text-center">
                Sem dados suficientes para exibição temporal
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="text-lg font-serif font-bold text-crb-navy mb-6">Maiores Devedores (Valor Corrigido)</h4>
            <div className="space-y-4">
              {stats.ranking.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-crb-navy/10 flex items-center justify-center text-crb-navy font-bold text-xs">
                      #{i+1}
                    </div>
                    <div>
                      <p className="font-bold text-crb-navy text-sm uppercase">{r.nome}</p>
                      <p className="text-xs text-slate-500">CRB: {r.crb}</p>
                    </div>
                  </div>
                  <span className="font-serif font-bold text-emerald-600">{formatCurrency(r.valor)}</span>
                </div>
              ))}
            </div>
         </div>

         <div className="space-y-6">
            <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
               <div className="flex items-center gap-3 text-red-700 mb-2">
                 <AlertCircle size={20} />
                 <span className="font-bold text-sm uppercase tracking-wider">Débitos Vencidos</span>
               </div>
               <p className="text-4xl font-serif font-bold text-red-800">{stats.vencidos}</p>
               <p className="text-xs text-red-600 font-medium mt-1">Ação imediata recomendada</p>
            </div>

            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
               <div className="flex items-center gap-3 text-blue-700 mb-2">
                 <TrendingDown size={20} />
                 <span className="font-bold text-sm uppercase tracking-wider">Antigos (+5 anos)</span>
               </div>
               <p className="text-4xl font-serif font-bold text-blue-800">{stats.antigos}</p>
               <p className="text-xs text-blue-600 font-medium mt-1">Risco de prescrição iminente</p>
            </div>
         </div>
      </div>
    </div>
  );
}

function MiniCard({ title, value, icon: Icon, color }: any) {
  const colors = {
    blue: 'bg-crb-navy text-white',
    purple: 'bg-crb-purple text-white',
    emerald: 'bg-emerald-600 text-white'
  };
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 group hover:border-crb-blue/30 transition-all">
      <div className={cn("p-4 rounded-xl transition-transform group-hover:scale-110", colors[color as keyof typeof colors])}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
        <p className="text-xl font-serif font-bold text-crb-navy">{value}</p>
      </div>
    </div>
  );
}
