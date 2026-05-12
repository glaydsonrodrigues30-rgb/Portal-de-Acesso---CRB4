import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, getAggregateFromServer, sum, count, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Handshake, DollarSign, Target, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const COLORS = ['#1e3a8a', '#10b981', '#f59e0b', '#ef4444'];

export default function NegociacoesView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'negotiations');
        
        const agg = await getAggregateFromServer(col, {
          total: count(),
          valorTotal: sum('valorTotal'),
          valorNegociado: sum('valorNegociado')
        });

        const snapshot = await getDocs(query(col, limit(500)));
        const data = snapshot.docs.map(d => d.data());
        
        const statusMap: any = {};
        data.forEach((d: any) => {
          statusMap[d.statusContato] = (statusMap[d.statusContato] || 0) + 1;
        });

        const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

        setStats({
          total: agg.data().total,
          valorTotal: agg.data().valorTotal,
          valorNegociado: agg.data().valorNegociado,
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-crb-navy text-white p-8 rounded-3xl shadow-xl flex items-center justify-between">
          <div>
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Total Acordos</p>
            <p className="text-4xl font-serif font-bold">{stats.total}</p>
          </div>
          <Handshake size={48} className="text-crb-yellow/40" />
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Valor Negociado</p>
          <p className="text-3xl font-serif font-bold text-emerald-600">{formatCurrency(stats.valorNegociado)}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
             <DollarSign size={14} />
             <span>Base: {formatCurrency(stats.valorTotal)}</span>
          </div>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
           <div className="p-4 bg-crb-yellow/20 text-crb-navy rounded-2xl">
              <Target size={28} />
           </div>
           <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Taxa de Conversão</p>
              <p className="text-2xl font-serif font-bold text-crb-navy">
                {stats.valorTotal > 0 ? ((stats.valorNegociado / stats.valorTotal) * 100).toFixed(1) : 0}%
              </p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white p-10 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <h4 className="text-xl font-serif font-bold text-crb-navy mb-10">Status das Negociações</h4>
          <div className="w-full h-[300px] min-h-[300px]">
            <ResponsiveContainer width="99%" height="100%">
              <BarChart data={stats.statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{fontSize: 12, fontWeight: 700, fill: '#1e3a8a'}} />
                <Tooltip cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
            <h5 className="flex items-center gap-2 text-amber-800 font-bold mb-4">
              <Calendar size={18} />
              Follow-ups Atrasados
            </h5>
            <p className="text-4xl font-serif font-bold text-amber-900">0</p>
            <p className="text-sm text-amber-700 mt-2">Nenhum agendamento pendente para hoje.</p>
          </div>

          <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
            <h5 className="flex items-center gap-2 text-red-800 font-bold mb-4">
              <AlertCircle size={18} />
              Acordos em Atraso
            </h5>
            <p className="text-4xl font-serif font-bold text-red-900">0</p>
            <p className="text-sm text-red-700 mt-2">Monitoramento de parcelas inadimplentes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
