import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { FolderOpen, Clock, Search, AlertCircle, Calendar, TrendingUp } from 'lucide-react';

const COLORS = ['#1e3a8a', '#7c3aed', '#10b981', '#f59e0b', '#ef4444'];

export default function ProcessosView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'processos');
        const snapshot = await getDocs(query(col, limit(1000)));
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

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

        const statusMap: any = { 
          'Novo': 0,
          'Em Análise': 0, 
          'Plenária': 0,
          'Concluído': 0,
          'Outros': 0
        };

        let totalDays = 0;
        let countDays = 0;
        let processosAntigos = 0;
        let prioridadeAlta = 0;

        data.forEach((d: any) => {
          const s = String(d.status || '').toLowerCase();
          if (s.includes('novo')) statusMap['Novo']++;
          else if (s.includes('analise') || s.includes('análise')) statusMap['Em Análise']++;
          else if (s.includes('plenaria') || s.includes('plenária')) statusMap['Plenária']++;
          else if (s.includes('concluido') || s.includes('concluído') || s.includes('deferido') || s.includes('indeferido')) statusMap['Concluído']++;
          else statusMap['Outros']++;

          const dateEntrada = parseDate(d.dataEntrada || d.createdAt);
          if (dateEntrada) {
            const diffDays = Math.floor((today.getTime() - dateEntrada.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              totalDays += diffDays;
              countDays++;
              if (diffDays > 90 && !s.includes('concluido')) processosAntigos++;
            }
          }

          if (String(d.prioridade || '').toLowerCase() === 'alta') prioridadeAlta++;
        });

        const statusData = Object.entries(statusMap)
          .map(([name, value]) => ({ 
            name, 
            value: value as number,
            percent: data.length > 0 ? ((value as number) / data.length * 100).toFixed(1) : 0
          }))
          .filter(i => i.value > 0);

        setStats({
          total: data.length,
          statusMap,
          statusData,
          tempoMedio: countDays > 0 ? (totalDays / countDays).toFixed(0) : '0',
          processosAntigos,
          prioridadeAlta
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
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard title="Total Geral" value={stats.total} icon={FolderOpen} color="bg-crb-navy" label="Base Processual" />
        <StatusCard title="Tempo Médio" value={`${stats.tempoMedio} dias`} icon={Clock} color="bg-crb-purple" label="Permanência média" />
        <StatusCard title="Prioridade Alta" value={stats.prioridadeAlta} icon={AlertCircle} color="bg-red-600" label="Atenção imediata" />
        <StatusCard title="Novo / Recent" value={stats.statusMap['Novo']} icon={Calendar} color="bg-blue-600" label="Entradas recentes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
          <h4 className="text-xl font-serif font-black text-crb-navy mb-10 border-l-4 border-crb-navy pl-4">Panorama de Status</h4>
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
                  {stats.statusData.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                   formatter={(value: any, name: any, props: any) => [`${value} (${props.payload.percent}%)`, name]}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40">
             <h4 className="text-lg font-serif font-black text-crb-navy mb-6 flex items-center gap-3">
                <AlertCircle className="text-red-600" size={20} />
                Alertas Estratégicos
             </h4>
             <div className="space-y-4">
                <div className="p-6 bg-red-50 border border-red-100 rounded-[1.5rem] flex items-center justify-between group hover:shadow-md transition-all">
                   <div>
                      <p className="font-black text-red-900 uppercase text-[10px] tracking-widest mb-1">Processos Atrasados</p>
                      <p className="text-xs text-red-700 font-medium">Mais de 90 dias sem movimentação final.</p>
                   </div>
                   <span className="text-3xl font-serif font-black text-red-900">{stats.processosAntigos}</span>
                </div>

                <div className="p-6 bg-blue-50 border border-blue-100 rounded-[1.5rem] flex items-center justify-between group hover:shadow-md transition-all">
                   <div>
                      <p className="font-black text-blue-900 uppercase text-[10px] tracking-widest mb-1">Em Pauta / Plenária</p>
                      <p className="text-xs text-blue-700 font-medium">Processos aguardando decisão colegiada.</p>
                   </div>
                   <span className="text-3xl font-serif font-black text-blue-900">{stats.statusMap['Plenária']}</span>
                </div>
             </div>
          </div>

          <div className="bg-crb-navy p-10 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-125 transition-transform duration-700">
               <FolderOpen size={200} />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
                <TrendingUp size={20} className="text-crb-purple-light" />
              </div>
              <h4 className="text-2xl font-serif font-black mb-4">Eficiência Institucional</h4>
              <p className="text-white/60 text-sm mb-8 max-w-[280px] leading-relaxed">
                O tempo médio de análise atual é de <span className="text-white font-bold">{stats.tempoMedio} dias</span>. 
                Recomenda-se priorizar os {stats.prioridadeAlta} processos de alta prioridade.
              </p>
              <button className="bg-crb-purple hover:bg-white hover:text-crb-navy text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95">
                Otimizar Fluxo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, value, icon: Icon, color, label }: any) {
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40 hover:shadow-2xl transition-all h-full flex flex-col justify-between group">
      <div>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg transition-transform group-hover:rotate-12 bg-slate-100", color)}>
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

function cn(...inputs: any) {
  return inputs.filter(Boolean).join(' ');
}
