import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, getAggregateFromServer, count, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { FolderOpen, CheckCircle, Clock, Search, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const COLORS = ['#1e3a8a', '#1d4ed8', '#7c3aed', '#ef4444', '#10b981'];

export default function ProcessosView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'processos');
        const agg = await getAggregateFromServer(col, { total: count() });
        
        const snapshot = await getDocs(query(col, limit(1000)));
        const data = snapshot.docs.map(d => d.data());
        
        const statusMap: any = { 
          'EM ANÁLISE': 0, 
          'DEFERIDO': 0, 
          'INDEFERIDO': 0, 
          'SOBRESTADO': 0 
        };
        data.forEach((d: any) => {
          const s = d.status?.toUpperCase() || 'EM ANÁLISE';
          statusMap[s] = (statusMap[s] || 0) + 1;
        });

        const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

        setStats({
          total: agg.data().total,
          statusMap,
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

  if (loading) return <div className="h-96 flex items-center justify-center font-sans font-bold text-crb-navy uppercase tracking-widest animate-pulse transition-all">Carregando painel de processos...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatusCard title="Total" value={stats.total} icon={FolderOpen} color="bg-crb-navy" />
        <StatusCard title="Deferidos" value={stats.statusMap['DEFERIDO'] || 0} icon={CheckCircle} color="bg-emerald-600" />
        <StatusCard title="Em Análise" value={stats.statusMap['EM ANÁLISE'] || 0} icon={Search} color="bg-crb-purple" />
        <StatusCard title="Sobrestados" value={stats.statusMap['SOBRESTADO'] || 0} icon={Clock} color="bg-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center overflow-hidden">
          <h4 className="text-xl font-serif font-bold text-crb-navy mb-8 w-full">Panorama de Status</h4>
          <div className="w-full h-[350px] min-h-[350px]">
            <ResponsiveContainer width="99%" height="100%">
              <PieChart>
                <Pie
                  data={stats.statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.statusData.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="text-xl font-serif font-bold text-crb-navy mb-6 flex items-center gap-2">
              <AlertCircle className="text-red-500" />
              Alertas de Plenária
            </h4>
            <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
               <div>
                  <p className="font-bold text-blue-800">Em Aberto / Análise</p>
                  <p className="text-xs text-blue-600">Processos aguardando parecer ou votação próxima.</p>
               </div>
               <span className="text-3xl font-serif font-bold text-blue-900">{stats.statusMap['EM ANÁLISE'] || 0}</span>
            </div>
          </div>

          <div className="bg-crb-navy p-8 rounded-3xl shadow-lg text-white relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
               <FolderOpen size={120} />
            </div>
            <h4 className="text-xl font-serif font-bold mb-4">Gestão Processual</h4>
            <p className="text-white/70 text-sm mb-6 max-w-[250px]">Visualize e acompanhe o fluxo completo dos processos administrativos e solicitações.</p>
            <button className="bg-crb-purple text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-white transition-colors">
              Ver Detalhes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:border-crb-purple transition-all">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform", color)}>
        <Icon size={20} />
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
      <p className="text-2xl font-serif font-bold text-crb-navy">{value}</p>
    </div>
  );
}
