import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, getAggregateFromServer, count, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { FileText, Send, Settings, Calendar, User } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function OficiosView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'oficios');
        const agg = await getAggregateFromServer(col, { total: count() });
        
        const snapshot = await getDocs(query(col, limit(1000)));
        const data = snapshot.docs.map(d => d.data());
        
        const yearMap: any = {};
        const destMap: any = {};
        
        data.forEach((d: any) => {
          yearMap[d.ano] = (yearMap[d.ano] || 0) + 1;
          destMap[d.destinatario] = (destMap[d.destinatario] || 0) + 1;
        });

        const yearData = Object.entries(yearMap).map(([name, value]) => ({ name, value }));
        const destData = Object.entries(destMap)
          .map(([name, value]) => ({ name, value: value as number }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        setStats({
          total: agg.data().total,
          yearData,
          destData
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="h-96 flex items-center justify-center">Carregando painel de ofícios...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-8">
          <div className="w-20 h-20 bg-crb-navy rounded-2xl flex items-center justify-center text-white shadow-lg">
            <FileText size={40} />
          </div>
          <div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Total de Ofícios</p>
            <p className="text-5xl font-serif font-bold text-crb-navy">{stats.total}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <Send size={24} className="text-blue-600 mb-3" />
              <p className="text-2xl font-serif font-bold text-blue-900">{stats.total}</p>
              <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Enviados</p>
           </div>
           <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <Settings size={24} className="text-slate-600 mb-3" />
              <p className="text-2xl font-serif font-bold text-slate-900">0</p>
              <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">Em Preparação</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h4 className="text-lg font-serif font-bold text-crb-navy flex items-center gap-2">
              <Calendar size={20} className="text-crb-purple" />
              Ofícios por Ano
            </h4>
          </div>
          <div className="w-full h-[300px] min-h-[300px]">
             <ResponsiveContainer width="99%" height="100%">
               <BarChart data={stats.yearData}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} />
                 <YAxis axisLine={false} tickLine={false} />
                 <Tooltip />
                 <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h4 className="text-lg font-serif font-bold text-crb-navy mb-8 flex items-center gap-2">
            <User size={20} className="text-crb-yellow" />
            Top Destinatários
          </h4>
          <div className="space-y-4">
            {stats.destData.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-sm text-crb-navy truncate max-w-[200px]">{d.name}</span>
                <span className="bg-white px-3 py-1 rounded-lg text-xs font-bold text-crb-navy shadow-sm">{d.value} ofícios</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
