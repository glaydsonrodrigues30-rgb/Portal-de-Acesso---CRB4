import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, getAggregateFromServer, count, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Bell, Send, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function NotificacoesView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'notifications');
        
        const agg = await getAggregateFromServer(col, { total: count() });
        
        const snapshot = await getDocs(query(col, limit(1000)));
        const data = snapshot.docs.map(d => d.data());
        
        const statusMap: any = { enviadas: 0, respondidas: 0, pendentes: 0 };
        const monthMap: any = {};
        
        data.forEach((d: any) => {
          // Logic based on statusPrazo or similar
          if (d.statusPrazo === 'CRÍTICO' || d.statusPrazo === 'VENCIDO') statusMap.pendentes++;
          else statusMap.enviadas++;
          
          const month = d.createdAt ? new Date(d.createdAt).toLocaleString('pt-BR', { month: 'short' }) : 'N/A';
          monthMap[month] = (monthMap[month] || 0) + 1;
        });

        const monthData = Object.entries(monthMap).map(([name, value]) => ({ name, value }));

        setStats({
          total: agg.data().total,
          statusMap,
          monthData
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="h-96 flex items-center justify-center">Carregando painel de notificações...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard title="Total" value={stats.total} icon={Bell} color="bg-crb-navy" />
        <MetricCard title="Enviadas" value={stats.statusMap.enviadas} icon={Send} color="bg-blue-500" />
        <MetricCard title="Pendentes" value={stats.statusMap.pendentes} icon={Clock} color="bg-crb-purple" />
        <MetricCard title="Respondidas" value={stats.statusMap.respondidas} icon={CheckCircle} color="bg-emerald-500" />
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
        <h4 className="text-xl font-serif font-black text-crb-navy mb-8 border-l-4 border-crb-purple pl-4">Fluxo de Notificações</h4>
        <div className="w-full h-[350px] min-h-[350px] flex items-center justify-center">
          {stats.monthData.length > 0 ? (
            <ResponsiveContainer width="99%" height="100%">
              <LineChart data={stats.monthData}>
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
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#7c3aed" 
                  strokeWidth={4} 
                  dot={{r: 6, fill: '#7c3aed', strokeWidth: 3, stroke: '#fff'}} 
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-slate-400 font-bold italic text-sm text-center">
              Sem históricos de notificações para exibição
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-red-50 p-8 rounded-3xl border border-red-100 flex items-start gap-6">
          <div className="p-4 bg-red-100 text-red-600 rounded-2xl">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h5 className="font-bold text-red-800 text-lg">Sem Resposta</h5>
            <p className="text-red-600 font-medium mb-4">Notificações com prazo excedido sem interação do devedor.</p>
            <span className="text-4xl font-serif font-bold text-red-900">{stats.statusMap.pendentes}</span>
          </div>
        </div>

        <div className="bg-crb-navy p-8 rounded-3xl border border-crb-navy flex items-start gap-6 text-white">
          <div className="p-4 bg-white/10 rounded-2xl">
            <Clock size={32} />
          </div>
          <div>
            <h5 className="font-bold text-white text-lg font-serif">Aguardando Prazo</h5>
            <p className="text-white/70 font-medium mb-4">Comunicações que ainda estão dentro do período de resposta legal.</p>
            <span className="text-4xl font-serif font-bold text-crb-purple-light">{stats.statusMap.enviadas}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4 shadow-md", color)}>
        <Icon size={20} />
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      <p className="text-2xl font-serif font-bold text-crb-navy">{value}</p>
    </div>
  );
}
