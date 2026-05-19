import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, getAggregateFromServer, count, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { FileText, Send, Settings, Calendar, User, TrendingUp } from 'lucide-react';
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
        const monthMap: any = {};
        const destMap: any = {};
        const tipoMap: any = {};
        
        const today = new Date();
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

        data.forEach((d: any) => {
          const date = parseDate(d.dataEmissao || d.createdAt);
          const ano = d.ano || (date ? date.getFullYear() : 'S/A');
          
          yearMap[ano] = (yearMap[ano] || 0) + 1;
          
          if (date) {
            const mKey = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
            monthMap[mKey] = (monthMap[mKey] || 0) + 1;
          }

          if (d.destinatario) {
            destMap[d.destinatario] = (destMap[d.destinatario] || 0) + 1;
          }

          if (d.tipo) {
            tipoMap[d.tipo] = (tipoMap[d.tipo] || 0) + 1;
          }
        });

        const yearData = Object.entries(yearMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        const monthData = Object.entries(monthMap)
          .map(([name, value]) => ({ name, value }))
          .reverse()
          .slice(0, 12);

        const destData = Object.entries(destMap)
          .map(([name, value]) => ({ name, value: value as number }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        const tipoData = Object.entries(tipoMap)
          .map(([name, value]) => ({ name, value: value as number }))
          .sort((a, b) => b.value - a.value);

        setStats({
          total: data.length,
          yearData,
          monthData,
          destData,
          tipoData
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
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between h-40">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-crb-navy rounded-2xl flex items-center justify-center text-white shadow-lg">
                <FileText size={20} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total</p>
           </div>
           <p className="text-4xl font-serif font-black text-crb-navy">{stats.total}</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between h-40">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Send size={20} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Expedidos</p>
           </div>
           <p className="text-4xl font-serif font-black text-crb-navy">{stats.total}</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between h-40">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <TrendingUp size={20} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Produtividade</p>
           </div>
           <p className="text-2xl font-serif font-black text-crb-navy">
             {(stats.total / (stats.monthData.length || 1)).toFixed(1)} <span className="text-xs font-sans text-slate-400">/mês</span>
           </p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between h-40">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-crb-purple rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Calendar size={20} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cobertura</p>
           </div>
           <p className="text-4xl font-serif font-black text-crb-navy">{stats.yearData.length} <span className="text-xs font-sans text-slate-400">Anos</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
          <h4 className="text-xl font-serif font-black text-crb-navy mb-8 border-l-4 border-crb-purple pl-4">Evolução Mensal</h4>
          <div className="w-full h-[300px]">
             {stats.monthData.length > 0 ? (
               <ResponsiveContainer width="99%" height="100%">
                 <BarChart data={stats.monthData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                   <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                    cursor={{fill: '#f8fafc'}}
                   />
                   <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} barSize={30} />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-slate-400 font-bold italic">Sem dados históricos</div>
             )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
          <h4 className="text-xl font-serif font-black text-crb-navy mb-8 border-l-4 border-crb-navy pl-4">Concentração / Destinatários</h4>
          <div className="space-y-4">
            {stats.destData.map((d: any, i: number) => (
              <div key={i} className="group p-5 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-white hover:shadow-lg transition-all">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-serif font-black text-crb-navy shadow-sm group-hover:bg-crb-navy group-hover:text-white transition-colors">
                      {i + 1}
                   </div>
                   <div className="flex flex-col">
                      <span className="font-bold text-sm text-crb-navy truncate max-w-[200px] uppercase tracking-tighter">{d.name}</span>
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mt-1">Instituição / Órgão</span>
                   </div>
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-lg font-serif font-black text-crb-navy">{d.value}</span>
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ofícios</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats.tipoData.length > 0 && (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
           <h4 className="text-xl font-serif font-black text-crb-navy mb-8 border-l-4 border-emerald-500 pl-4">Tipos de Ofícios</h4>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.tipoData.map((t: any, i: number) => (
                <div key={i} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 flex flex-col justify-between gap-4">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.name || 'Geral'}</p>
                   <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-serif font-black text-crb-navy">{t.value}</span>
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">({((t.value / stats.total) * 100).toFixed(0)}%)</span>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
