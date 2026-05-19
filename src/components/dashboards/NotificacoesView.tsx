import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { Bell, Send, CheckCircle, Clock, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function NotificacoesView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'notifications');
        const snapshot = await getDocs(query(col, orderBy('dataNotificacao', 'desc'), limit(2000)));
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const next7Days = new Date(today);
        next7Days.setDate(today.getDate() + 7);

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

        let respondidas = 0;
        let vencidas = 0;
        let proximas = 0;
        let totalRespostaTime = 0;
        let countRespostaTime = 0;

        const monthMap: any = {};
        
        data.forEach((d: any) => {
          const statusPrazo = String(d.statusPrazo || '').toLowerCase();
          const dataNotif = parseDate(d.dataNotificacao);
          const dataRespost = parseDate(d.dataResposta);
          
          const refDate = d.dataLimite ? parseDate(d.dataLimite) : (dataNotif && d.prazoDias ? new Date(dataNotif.getTime() + (d.prazoDias * 86400000)) : null);

          if (statusPrazo === 'respondido') {
            respondidas++;
            if (dataRespost && dataNotif) {
              const diff = (dataRespost.getTime() - dataNotif.getTime()) / (1000 * 60 * 60 * 24);
              if (diff >= 0) {
                totalRespostaTime += diff;
                countRespostaTime++;
              }
            }
          } else {
            if (refDate && refDate < today) {
              vencidas++;
            } else if (refDate && refDate <= next7Days) {
              proximas++;
            }
          }
          
          if (dataNotif) {
            const month = dataNotif.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
            monthMap[month] = (monthMap[month] || 0) + 1;
          }
        });

        const monthData = Object.entries(monthMap)
          .map(([name, value]) => ({ name, value }))
          .reverse();

        setStats({
          total: data.length,
          respondidas,
          vencidas,
          proximas,
          taxaResposta: data.length > 0 ? (respondidas / data.length) * 100 : 0,
          tempoMedio: countRespostaTime > 0 ? (totalRespostaTime / countRespostaTime).toFixed(1) : 'N/A',
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Total Enviado" 
          value={stats.total} 
          icon={Send} 
          color="bg-crb-navy" 
          label="Mapeamento Geral"
        />
        <MetricCard 
          title="Taxa de Resposta" 
          value={`${stats.taxaResposta.toFixed(1)}%`} 
          icon={TrendingUp} 
          color="bg-emerald-500" 
          label={`${stats.respondidas} retornos confirmados`}
        />
        <MetricCard 
          title="Vencidas" 
          value={stats.vencidas} 
          icon={AlertTriangle} 
          color="bg-red-600" 
          label="Sem resposta pós-prazo"
        />
        <MetricCard 
          title="Tempo Médio" 
          value={`${stats.tempoMedio} dias`} 
          icon={Clock} 
          color="bg-crb-purple" 
          label="Para retorno do devedor"
        />
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <h4 className="text-xl font-serif font-black text-crb-navy border-l-4 border-crb-purple pl-4">Evolução Mensal</h4>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-full border border-slate-100 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-crb-purple"></span>
            Volume de Envio
          </div>
        </div>
        
        <div className="w-full h-[350px]">
          {stats.monthData.length > 0 ? (
            <ResponsiveContainer width="99%" height="100%">
              <AreaChart data={stats.monthData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                  itemStyle={{ fontWeight: '800', color: '#1e3a8a' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#7c3aed" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorValue)"
                  dot={{r: 6, fill: '#7c3aed', strokeWidth: 3, stroke: '#fff'}} 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
               <Bell size={40} className="mb-4 opacity-20" />
               <p className="font-bold italic text-sm">Sem dados históricos para este período</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-red-50 p-8 rounded-[2rem] border border-red-100 flex items-start gap-6 group hover:shadow-lg transition-all">
          <div className="p-4 bg-red-100 text-red-600 rounded-2xl group-hover:scale-110 transition-transform">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h5 className="font-bold text-red-800 text-lg font-serif">Ações Críticas</h5>
            <p className="text-red-600 font-medium mb-4 text-sm">Notificações sem retorno após o período legal. Recomenda-se envio para execução ou protesto.</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-serif font-black text-red-900">{stats.vencidas}</span>
              <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Pendentes</span>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 p-8 rounded-[2rem] border border-amber-100 flex items-start gap-6 group hover:shadow-lg transition-all">
          <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
            <Calendar size={32} />
          </div>
          <div>
            <h5 className="font-bold text-amber-800 text-lg font-serif">Prazos Próximos</h5>
            <p className="text-amber-600 font-medium mb-4 text-sm">Comunicações que vencem nos próximos 7 dias. Monitoramento intensivo sugerido.</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-serif font-black text-amber-900">{stats.proximas}</span>
              <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">A vencer</span>
            </div>
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
