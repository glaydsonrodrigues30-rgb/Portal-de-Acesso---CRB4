import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, getAggregateFromServer, sum, count, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { CreditCard, DollarSign, Activity, AlertCircle, TrendingDown, Mail, Shield, AlertTriangle, ShieldCheck, Hourglass, CheckCircle2, ChevronRight, HelpCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { calculateFlow } from '../../lib/flowEngine';

const COLORS = ['#1e3a8a', '#3b82f6', '#ef4444', '#10b981', '#7c3aed'];

export default function DebitosView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'debits');
        const snapshot = await getDocs(query(col, limit(2000))); // Fetch more for better charts
        const allDebits = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const notifCol = collection(db, 'notifications');
        const notifSnapshot = await getDocs(query(notifCol, limit(1000)));
        const notifications = notifSnapshot.docs.map(n => ({ id: n.id, ...n.data() })) as any[];

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

        let valorTotal = 0;
        let valorCorrigido = 0;
        let vencidosCount = 0;
        let antigosCount = 0;
        const statusMap: any = {};
        const yearMap: any = {};
        const yearValueMap: any = {};
        const fiveYearsAgo = (new Date().getFullYear()) - 5;

        // Flow control metrics
        let fluxoVencidoCount = 0;
        let fluxoProximoVencimentoCount = 0;
        let emComunicacaoCadinCount = 0;
        let aguardandoInclusaoCadinCount = 0;

        const faseMap: Record<string, number> = {
          'Aguardando Notificação': 0,
          'Notificação': 0,
          'Protesto': 0,
          'Comunicação CADIN': 0,
          'Aguardando inclusão CADIN': 0,
          'CADIN': 0
        };
        const faseValorMap: Record<string, number> = {
          'Aguardando Notificação': 0,
          'Notificação': 0,
          'Protesto': 0,
          'Comunicação CADIN': 0,
          'Aguardando inclusão CADIN': 0,
          'CADIN': 0
        };

        const flowDetailsList: any[] = [];

        allDebits.forEach((d: any) => {
          valorTotal += Number(d.valor || 0);
          const vCorrigido = Number(d.valorCorrigido || d.valor || 0);
          valorCorrigido += vCorrigido;
          
          const vDate = parseDate(d.dataVencimento);
          const status = String(d.situacao || d.status || d.statusGeral || '').toLowerCase();
          const isVencido = vDate && vDate < today && status !== "pago" && status !== "regularizado";
          
          if (isVencido) vencidosCount++;
          if (Number(d.ano) <= fiveYearsAgo) antigosCount++;

          const statusLabel = isVencido ? 'Vencido' : (status === 'pago' || status === 'regularizado' ? 'Regularizado' : 'Em Aberto');
          statusMap[statusLabel] = (statusMap[statusLabel] || 0) + 1;
          
          const ano = d.ano || 'S/A';
          yearMap[ano] = (yearMap[ano] || 0) + 1;
          yearValueMap[ano] = (yearValueMap[ano] || 0) + vCorrigido;

          // Flow calculations
          const flow = calculateFlow(d as any, notifications);
          faseMap[flow.faseAtual] = (faseMap[flow.faseAtual] || 0) + 1;
          faseValorMap[flow.faseAtual] = (faseValorMap[flow.faseAtual] || 0) + vCorrigido;

          if (flow.faseAtual === 'Comunicação CADIN') {
            emComunicacaoCadinCount++;
          } else if (flow.faseAtual === 'Aguardando inclusão CADIN') {
            aguardandoInclusaoCadinCount++;
          }

          if (flow.status === 'Vencido') {
            fluxoVencidoCount++;
          } else if (flow.status === 'Em prazo' && flow.diasRestantes > 0 && flow.diasRestantes <= 7) {
            fluxoProximoVencimentoCount++;
          }

          flowDetailsList.push({
            id: d.id,
            crb: d.crb,
            nome: d.nome,
            valor: vCorrigido,
            flow
          });
        });

        const statusData = Object.entries(statusMap).map(([name, value]) => ({ 
          name, 
          value,
          percent: ((value as number) / allDebits.length * 100).toFixed(1)
        }));

        const yearData = Object.entries(yearMap)
          .map(([name, count]) => ({ 
            name: name.toString(), 
            count: count as number,
            value: yearValueMap[name] || 0
          }))
          .sort((a, b) => parseInt(a.name) - parseInt(b.name));

        const flowStatsData = Object.entries(faseMap).map(([name, value]) => ({
          name,
          value,
          valor: faseValorMap[name] || 0,
          percent: allDebits.length > 0 ? ((value / allDebits.length) * 100).toFixed(1) : '0'
        }));

        // Ranking with status
        const ranking = [...allDebits]
          .sort((a: any, b: any) => (b.valorCorrigido || 0) - (a.valorCorrigido || 0))
          .slice(0, 5)
          .map((d: any) => {
            const vDate = parseDate(d.dataVencimento);
            const status = String(d.situacao || d.status || d.statusGeral || '').toLowerCase();
            const isVencido = vDate && vDate < today && status !== "pago" && status !== "regularizado";
            return {
              crb: d.crb,
              nome: d.nome,
              valor: d.valorCorrigido,
              status: isVencido ? 'Vencido' : 'Em Dia'
            };
          });

        setStats({
          total: allDebits.length,
          valorTotal,
          valorCorrigido,
          vencidos: vencidosCount,
          antigos: antigosCount,
          ranking,
          statusData,
          yearData,
          // Flow stats
          fluxoVencidoCount,
          fluxoProximoVencimentoCount,
          emComunicacaoCadinCount,
          aguardandoInclusaoCadinCount,
          flowStatsData,
          flowDetailsList: flowDetailsList.sort((a, b) => {
            // Put Vencidos first, then near vencimento, then by remaining days
            if (a.flow.status === 'Vencido' && b.flow.status !== 'Vencido') return -1;
            if (a.flow.status !== 'Vencido' && b.flow.status === 'Vencido') return 1;
            return a.flow.diasRestantes - b.flow.diasRestantes;
          }).slice(0, 8)
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="h-96 flex items-center justify-center font-sans text-sm font-bold text-slate-400 uppercase tracking-widest">Carregando painel financeiro...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-12">
      {/* Top Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MiniCard title="Volume de Débitos" value={stats.total} icon={CreditCard} color="blue" />
        <MiniCard title="Valor Original" value={formatCurrency(stats.valorTotal)} icon={DollarSign} color="purple" />
        <MiniCard title="Valor Corrigido" value={formatCurrency(stats.valorCorrigido)} icon={Activity} color="emerald" />
      </div>

      {/* INSTITUTIONAL COLLECTION FLOW - STATUS & PROGRESS PIPELINE */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-l-4 border-crb-purple pl-4">
          <div>
            <h3 className="text-2xl font-serif font-black text-crb-navy tracking-tight">Fluxograma de Cobrança Institucional</h3>
            <p className="text-slate-500 font-medium font-sans text-sm mt-1">Acompanhamento automatizado de fases, prazos regulamentares e alertas de vencimento.</p>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest leading-none">Fluxos Vencidos</p>
                <p className="text-base font-serif font-bold text-red-900 mt-1">{stats.fluxoVencidoCount} débitos</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                <Hourglass size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest leading-none">Atenção (≤ 7 dias)</p>
                <p className="text-base font-serif font-bold text-amber-950 mt-1">{stats.fluxoProximoVencimentoCount} em risco</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                <Clock size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest leading-none">Em Comunicação CADIN</p>
                <p className="text-base font-serif font-bold text-blue-950 mt-1">{stats.emComunicacaoCadinCount || 0} ativos</p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700">
                <Hourglass size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest leading-none">Aguardando Inclusão CADIN</p>
                <p className="text-base font-serif font-bold text-orange-950 mt-1">{stats.aguardandoInclusaoCadinCount || 0} aptos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Pipeline Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {stats.flowStatsData.map((fase: any, i: number) => {
            const configMap: Record<string, { icon: any, color: string, border: string, text: string, flowDesc: string }> = {
              'Aguardando Notificação': {
                icon: HelpCircle,
                color: 'bg-slate-100 text-slate-700',
                border: 'border-slate-200',
                text: 'Fase Inicial',
                flowDesc: 'Débito registrado sem notificação ativa.'
              },
              'Notificação': {
                icon: Mail,
                color: 'bg-blue-100 text-blue-700',
                border: 'border-blue-200',
                text: 'Prazo: 30 dias',
                flowDesc: 'Inicia com a criação da notificação formal do débito.'
              },
              'Protesto': {
                icon: Shield,
                color: 'bg-purple-100 text-purple-700',
                border: 'border-purple-200',
                text: 'Prazo: 180 dias',
                flowDesc: 'Executado em cartório após expirar a Notificação.'
              },
              'Comunicação CADIN': {
                icon: Clock,
                color: 'bg-indigo-100 text-indigo-700',
                border: 'border-indigo-200',
                text: 'Prazo: 75 dias',
                flowDesc: 'Período obrigatório de notificação prévia de CADIN.'
              },
              'Aguardando inclusão CADIN': {
                icon: Hourglass,
                color: 'bg-orange-100 text-orange-700',
                border: 'border-orange-200',
                text: 'Pronto p/ CADIN',
                flowDesc: 'Prazo de 75 dias transcorrido, aguardando registro.'
              },
              'CADIN': {
                icon: AlertTriangle,
                color: 'bg-red-100 text-red-700',
                border: 'border-red-200',
                text: 'Ativo no CADIN',
                flowDesc: 'Inscrição restritiva externa efetivada e ativa.'
              }
            };
            const config = configMap[fase.name] || {
              icon: HelpCircle,
              color: 'bg-slate-100 text-slate-700',
              border: 'border-slate-200',
              text: 'Ativo',
              flowDesc: ''
            };
            const IconComponent = config.icon;

            return (
              <div key={fase.name} className={cn("bg-slate-50/55 p-6 rounded-3xl border transition-all hover:bg-slate-50 flex flex-col justify-between h-full relative overflow-hidden group", config.border)}>
                <div className="absolute right-3 top-3 opacity-5 group-hover:scale-125 transition-transform duration-500">
                  <IconComponent size={64} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Etapa {i + 1}</span>
                    <span className={cn("px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider", config.color)}>
                      {config.text}
                    </span>
                  </div>
                  
                  <h4 className="text-xl font-serif font-black text-crb-navy mb-1 group-hover:text-crb-purple transition-colors">{fase.name}</h4>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed mb-6 mr-4">{config.flowDesc}</p>
                </div>

                <div className="border-t border-slate-100 pt-4 mt-auto">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-serif font-black text-crb-navy">{fase.value}</span>
                    <span className="text-xs text-slate-500 font-bold">({fase.percent}%)</span>
                  </div>
                  <p className="text-xs font-serif font-bold text-slate-500">
                    Soma: <span className="text-crb-navy font-sans">{formatCurrency(fase.valor)}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                     formatter={(value: any, name: any, props: any) => [`${value} (${props.payload.percent}%)`, name]}
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
          <h4 className="text-xl font-serif font-black text-crb-navy mb-8 px-2 border-l-4 border-crb-purple pl-4">Distribuição por Ano (Valor)</h4>
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
                    tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: any, name: any, props: any) => {
                      if (name === 'value') return [formatCurrency(val), 'Valor Total'];
                      return [val, name];
                    }}
                    labelFormatter={(label) => `Ano: ${label}`}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100">
                            <p className="font-black text-crb-navy mb-2">Ano {label}</p>
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-emerald-600 flex justify-between gap-4">
                                <span>Valor:</span>
                                <span>{formatCurrency(data.value)}</span>
                              </p>
                              <p className="text-xs text-slate-500 font-bold flex justify-between gap-4">
                                <span>Quantidade:</span>
                                <span>{data.count} débitos</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
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

      {/* Critical Flow Tracking Table & Standard Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden hover:shadow-2xl transition-all">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h4 className="text-lg font-serif font-black text-crb-navy">Acompanhamento Ativo de Prazos</h4>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-black uppercase tracking-wider">Top 8 Críticos</span>
          </div>
          
          <div className="overflow-x-auto font-sans">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Profissional / CRB</th>
                  <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Fase Atual</th>
                  <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Prazo Final</th>
                  <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Situação do Fluxo</th>
                  <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Valor Corrigido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.flowDetailsList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-bold text-sm">Nenhum débito no fluxo de cobrança.</td>
                  </tr>
                ) : (
                  stats.flowDetailsList.map((item: any) => {
                    const isVenc = item.flow.status === 'Vencido';
                    const isNear = item.flow.status === 'Em prazo' && item.flow.diasRestantes <= 7 && item.flow.diasRestantes > 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 pr-4">
                          <p className="font-bold text-crb-navy text-sm uppercase truncate max-w-[180px]">{item.nome}</p>
                          <span className="text-[10px] font-bold text-slate-400">CRB: {item.crb}</span>
                        </td>
                        <td className="py-4">
                          <span className="font-serif font-black text-crb-navy text-sm">{item.flow.faseAtual}</span>
                        </td>
                        <td className="py-4">
                          <p className="text-xs font-bold text-slate-600">{item.flow.prazoFinal ? item.flow.prazoFinal.split('-').reverse().join('/') : 'S/A'}</p>
                          {item.flow.status !== 'Concluído' && (
                            <span className={cn(
                              "text-[9px] font-black uppercase",
                              isVenc ? "text-red-600" : isNear ? "text-amber-600" : "text-emerald-600"
                            )}>
                              {isVenc 
                                ? `Atrasado há ${item.flow.atrasoDias}d` 
                                : item.flow.diasRestantes === 0 ? 'Expira hoje' : `${item.flow.diasRestantes}d restantes`}
                            </span>
                          )}
                        </td>
                        <td className="py-4">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                            item.flow.status === 'Concluído' 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : isVenc 
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : isNear
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-blue-50 text-blue-700 border border-blue-200"
                          )}>
                            {item.flow.status}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="font-serif font-black text-crb-navy text-sm">{formatCurrency(item.valor)}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts & Sidebar Sidebar Elements */}
        <div className="space-y-6">
          <div className="bg-red-50 p-8 rounded-[2rem] border border-red-100 hover:shadow-lg transition-all">
             <div className="flex items-center gap-3 text-red-800 mb-4">
               <AlertCircle size={22} className="stroke-[2.5]" />
               <span className="font-black text-xs uppercase tracking-widest leading-none">Débitos Vencidos</span>
             </div>
             <p className="text-4xl font-serif font-black text-red-900 leading-none">{stats.vencidos}</p>
             <p className="text-xs text-red-700 font-medium mt-3 leading-relaxed">Mensalidades expiradas sem pagamento. Ação corporativa recomendada.</p>
          </div>

          <div className="bg-blue-50 p-8 rounded-[2rem] border border-blue-100 hover:shadow-lg transition-all">
             <div className="flex items-center gap-3 text-blue-700 mb-2">
               <TrendingDown size={22} className="stroke-[2.5]" />
               <span className="font-black text-xs uppercase tracking-widest leading-none">Antigos (+5 anos)</span>
             </div>
             <p className="text-4xl font-serif font-black text-blue-800">{stats.antigos}</p>
             <p className="text-xs text-blue-600 font-medium mt-1">Risco de prescrição iminente</p>
          </div>

          <div className="bg-gradient-to-br from-crb-navy to-crb-purple p-8 rounded-[2rem] text-white overflow-hidden relative group shadow-xl">
             <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:scale-125 transition-transform duration-500">
               <ShieldCheck size={160} />
             </div>
             <div className="relative z-10 space-y-4">
                <span className="bg-white/10 text-white border border-white/20 rounded-full px-3 py-1 font-black uppercase text-[10px] tracking-widest">Alerta de Gestão</span>
                <h4 className="text-xl font-serif font-black tracking-tight leading-snug">Metodologia Institucional</h4>
                <p className="text-xs text-white/70 font-medium leading-relaxed">
                  Para garantir total conformidade, assegure a devida transição ao Protesto antes de proceder com a restrição final no CADIN.
                </p>
             </div>
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
