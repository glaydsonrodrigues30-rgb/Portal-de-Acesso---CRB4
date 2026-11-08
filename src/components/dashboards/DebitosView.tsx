import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, getAggregateFromServer, sum, count, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { CreditCard, DollarSign, Activity, AlertCircle, TrendingDown, Mail, Shield, AlertTriangle, ShieldCheck, Hourglass, CheckCircle2, ChevronRight, HelpCircle, Clock, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getStatusDebito, parseDateSafely } from '../../lib/statusDebito';

const COLORS = ['#1e3a8a', '#3b82f6', '#ef4444', '#10b981', '#7c3aed'];

const formatShortCurrency = (val: number) => {
  if (!val || isNaN(val)) return 'R$ 0';
  if (Math.abs(val) >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
  if (Math.abs(val) >= 1000) return `R$ ${(val / 1000).toFixed(0)}k`;
  return `R$ ${val.toFixed(0)}`;
};

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

        let valorTotal = 0;
        let valorCorrigido = 0;
        let vencidosCount = 0;
        let antigosCount = 0;
        const fiveYearsAgo = (new Date().getFullYear()) - 5;

        // Flow control metrics
        let fluxoVencidoCount = 0;
        let fluxoProximoVencimentoCount = 0;
        let emComunicacaoCadinCount = 0;
        let aguardandoInclusaoCadinCount = 0;

        const faseMap: Record<string, number> = {
          'Aguardando Notificação': 0,
          'Notificação': 0,
          'Dívida Ativa': 0,
          'Protesto': 0,
          'Comunicação CADIN': 0,
          'Aguardando inclusão CADIN': 0,
          'CADIN': 0
        };
        const faseValorMap: Record<string, number> = {
          'Aguardando Notificação': 0,
          'Notificação': 0,
          'Dívida Ativa': 0,
          'Protesto': 0,
          'Comunicação CADIN': 0,
          'Aguardando inclusão CADIN': 0,
          'CADIN': 0
        };

        // 1. Aging da carteira por faixa em valor R$ (a vencer, 0 a 90 dias, 91 a 365 dias, 1 a 3 anos, mais de 3 anos)
        const agingMap: Record<string, { valor: number; quantidade: number; color: string }> = {
          'A Vencer': { valor: 0, quantidade: 0, color: '#10b981' },
          '0 a 90 dias': { valor: 0, quantidade: 0, color: '#3b82f6' },
          '91 a 365 dias': { valor: 0, quantidade: 0, color: '#6366f1' },
          '1 a 3 anos': { valor: 0, quantidade: 0, color: '#f59e0b' },
          'Mais de 3 anos': { valor: 0, quantidade: 0, color: '#ef4444' }
        };

        // 2. Funil por fase do fluxo com a quantidade de débitos
        const funnelOrder = [
          'Aguardando Notificação',
          'Notificação',
          'Dívida Ativa',
          'Protesto',
          'Comunicação CADIN',
          'Aguardando inclusão CADIN',
          'CADIN'
        ];
        const funnelMap: Record<string, { quantidade: number; valor: number; color: string }> = {
          'Aguardando Notificação': { quantidade: 0, valor: 0, color: '#64748b' },
          'Notificação': { quantidade: 0, valor: 0, color: '#2563eb' },
          'Dívida Ativa': { quantidade: 0, valor: 0, color: '#f59e0b' },
          'Protesto': { quantidade: 0, valor: 0, color: '#7c3aed' },
          'Comunicação CADIN': { quantidade: 0, valor: 0, color: '#0284c7' },
          'Aguardando inclusão CADIN': { quantidade: 0, valor: 0, color: '#ea580c' },
          'CADIN': { quantidade: 0, valor: 0, color: '#dc2626' }
        };

        // 3. Valor em aberto por exercício (ano)
        const anoAbertoMap: Record<string, { valor: number; quantidade: number }> = {};

        const flowDetailsList: any[] = [];

        allDebits.forEach((d: any) => {
          const vOriginal = Number(d.valor || 0);
          const vCorrigido = Number(d.valorCorrigido || d.valor || 0);
          valorTotal += vOriginal;
          valorCorrigido += vCorrigido;
          
          // Flow and status calculations using central motor
          const statusInfo = getStatusDebito(d as any, notifications);
          const isVencido = statusInfo.prazo === 'VENCIDO';
          
          if (isVencido) vencidosCount++;
          if (Number(d.ano) <= fiveYearsAgo) antigosCount++;

          // Process open debts for the 3 charts
          if (!statusInfo.isPago && statusInfo.situacao !== 'CANCELADO') {
            // Chart 1: Aging da Carteira
            let faixa = 'A Vencer';
            if (statusInfo.prazo === 'VENCIDO') {
              let diasAtraso = 0;
              const vDate = parseDateSafely(d.dataVencimento);
              if (vDate) {
                diasAtraso = Math.max(0, Math.round((today.getTime() - vDate.getTime()) / (1000 * 60 * 60 * 24)));
              } else if (d.ano) {
                const yearDiff = today.getFullYear() - Number(d.ano);
                if (yearDiff >= 4) diasAtraso = 1200;
                else if (yearDiff >= 2) diasAtraso = 730;
                else if (yearDiff === 1) diasAtraso = 200;
                else diasAtraso = statusInfo.dias || 30;
              } else {
                diasAtraso = statusInfo.dias || statusInfo.atrasoDias || 0;
              }

              if (diasAtraso <= 90) {
                faixa = '0 a 90 dias';
              } else if (diasAtraso <= 365) {
                faixa = '91 a 365 dias';
              } else if (diasAtraso <= 1095) {
                faixa = '1 a 3 anos';
              } else {
                faixa = 'Mais de 3 anos';
              }
            } else {
              faixa = 'A Vencer';
            }

            if (agingMap[faixa]) {
              agingMap[faixa].valor += vCorrigido;
              agingMap[faixa].quantidade += 1;
            }

            // Chart 2: Funil por fase do fluxo
            const fase = statusInfo.fase || 'Aguardando Notificação';
            if (funnelMap[fase]) {
              funnelMap[fase].quantidade += 1;
              funnelMap[fase].valor += vCorrigido;
            }

            // Chart 3: Valor em aberto por exercício
            let ano = d.ano ? String(d.ano).trim() : '';
            if (!ano) {
              const vDate = parseDateSafely(d.dataVencimento);
              if (vDate) ano = String(vDate.getFullYear());
              else ano = 'S/A';
            }
            if (!anoAbertoMap[ano]) {
              anoAbertoMap[ano] = { valor: 0, quantidade: 0 };
            }
            anoAbertoMap[ano].valor += vCorrigido;
            anoAbertoMap[ano].quantidade += 1;
          }

          faseMap[statusInfo.fase] = (faseMap[statusInfo.fase] || 0) + 1;
          faseValorMap[statusInfo.fase] = (faseValorMap[statusInfo.fase] || 0) + vCorrigido;

          if (statusInfo.fase === 'Comunicação CADIN') {
            emComunicacaoCadinCount++;
          } else if (statusInfo.fase === 'Aguardando inclusão CADIN') {
            aguardandoInclusaoCadinCount++;
          }

          if (statusInfo.prazo === 'VENCIDO') {
            fluxoVencidoCount++;
          } else if (statusInfo.prazo === 'EM PRAZO' && statusInfo.dias > 0 && statusInfo.dias <= 7) {
            fluxoProximoVencimentoCount++;
          }

          flowDetailsList.push({
            id: d.id,
            crb: d.crb,
            nome: d.nome,
            valor: vCorrigido,
            flow: statusInfo
          });
        });

        // Datasets for the 3 charts
        const agingData = Object.entries(agingMap).map(([name, item]) => ({
          name,
          valor: item.valor,
          quantidade: item.quantidade,
          color: item.color
        }));

        const funnelData = funnelOrder.map(faseName => ({
          name: faseName,
          quantidade: funnelMap[faseName]?.quantidade || 0,
          valor: funnelMap[faseName]?.valor || 0,
          color: funnelMap[faseName]?.color || '#1e3a8a'
        }));

        const exercicioData = Object.entries(anoAbertoMap)
          .map(([name, item]) => ({
            name,
            valor: item.valor,
            quantidade: item.quantidade
          }))
          .sort((a, b) => {
            const numA = parseInt(a.name, 10);
            const numB = parseInt(b.name, 10);
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return numA - numB;
          });

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
            const statusInfo = getStatusDebito(d as any, notifications);
            const isVencido = statusInfo.prazo === 'VENCIDO';
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
          agingData,
          funnelData,
          exercicioData,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-6">
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
              'Dívida Ativa': {
                icon: FileText,
                color: 'bg-amber-100 text-amber-800',
                border: 'border-amber-200',
                text: 'Inscrição CDA',
                flowDesc: 'Inscrito em Dívida Ativa antes do cartório (Res. 259).'
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

      {/* 3 Gráficos Analíticos com dados reais e getStatusDebito */}
      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-2 flex items-center gap-3">
            <span className="w-8 h-[2px] bg-crb-navy"></span>
            Diagnóstico Analítico da Carteira
          </h3>
        </div>

        {/* Row 1: Aging da Carteira + Funil por Fase do Fluxo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gráfico 1: Aging da Carteira por Faixa em Valor R$ */}
          <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between">
            <div className="mb-6 border-l-4 border-crb-blue pl-4">
              <h4 className="text-xl font-serif font-black text-crb-navy">Aging da Carteira (Valor em R$)</h4>
              <p className="text-xs text-slate-400 font-medium mt-1">Montante financeiro em aberto segmentado por faixa de atraso</p>
            </div>

            <div className="w-full h-[320px] min-h-[320px] flex items-center justify-center">
              {stats.agingData && stats.agingData.some((d: any) => d.valor > 0 || d.quantidade > 0) ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={stats.agingData} margin={{ top: 20, right: 15, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tickFormatter={formatShortCurrency}
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          return (
                            <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 min-w-[200px]">
                              <p className="font-black text-crb-navy mb-2 text-sm">{item.name}</p>
                              <div className="space-y-1.5">
                                <p className="text-xs font-bold text-emerald-600 flex justify-between gap-4">
                                  <span className="text-slate-500 font-semibold">Valor em Aberto:</span>
                                  <span className="font-black tabular-nums">{formatCurrency(item.valor)}</span>
                                </p>
                                <p className="text-xs font-bold text-slate-700 flex justify-between gap-4">
                                  <span className="text-slate-500 font-semibold">Volume de Débitos:</span>
                                  <span className="font-black tabular-nums">{item.quantidade} débitos</span>
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="valor" radius={[8, 8, 0, 0]} maxBarSize={48}>
                      {stats.agingData.map((entry: any, index: number) => (
                        <Cell key={`cell-aging-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <AlertCircle size={32} className="text-slate-300 mb-2" />
                  <p className="font-bold text-sm">Sem dados suficientes para o aging da carteira</p>
                  <p className="text-xs text-slate-400 mt-1">Os débitos em aberto serão exibidos aqui.</p>
                </div>
              )}
            </div>
          </div>

          {/* Gráfico 2: Funil por Fase do Fluxo com Quantidade de Débitos */}
          <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col justify-between">
            <div className="mb-6 border-l-4 border-crb-purple pl-4">
              <h4 className="text-xl font-serif font-black text-crb-navy">Funil por Fase do Fluxo (Quantidade)</h4>
              <p className="text-xs text-slate-400 font-medium mt-1">Volume de débitos em cada etapa institucional do fluxo de cobrança</p>
            </div>

            <div className="w-full h-[320px] min-h-[320px] flex items-center justify-center">
              {stats.funnelData && stats.funnelData.some((d: any) => d.quantidade > 0) ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={stats.funnelData} margin={{ top: 20, right: 15, left: 10, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      allowDecimals={false}
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          return (
                            <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 min-w-[220px]">
                              <p className="font-black text-crb-navy mb-2 text-sm">{item.name}</p>
                              <div className="space-y-1.5">
                                <p className="text-xs font-bold text-crb-blue flex justify-between gap-4">
                                  <span className="text-slate-500 font-semibold">Quantidade:</span>
                                  <span className="font-black tabular-nums">{item.quantidade} débitos</span>
                                </p>
                                <p className="text-xs font-bold text-emerald-600 flex justify-between gap-4">
                                  <span className="text-slate-500 font-semibold">Valor Acumulado:</span>
                                  <span className="font-black tabular-nums">{formatCurrency(item.valor)}</span>
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="quantidade" radius={[8, 8, 0, 0]} maxBarSize={48}>
                      {stats.funnelData.map((entry: any, index: number) => (
                        <Cell key={`cell-funnel-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <AlertCircle size={32} className="text-slate-300 mb-2" />
                  <p className="font-bold text-sm">Sem débitos cadastrados no fluxo de cobrança</p>
                  <p className="text-xs text-slate-400 mt-1">O funil por fase será preenchido automaticamente.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Gráfico 3 - Valor em Aberto por Exercício */}
        <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-l-4 border-emerald-600 pl-4">
            <h4 className="text-xl font-serif font-black text-crb-navy">Valor em Aberto por Exercício</h4>
            <p className="text-xs text-slate-400 font-medium mt-1">Soma financeira dos débitos em cobrança agrupada por ano de competência</p>
          </div>

          <div className="w-full h-[320px] min-h-[320px] flex items-center justify-center">
            {stats.exercicioData && stats.exercicioData.some((d: any) => d.valor > 0) ? (
              <ResponsiveContainer width="99%" height="100%">
                <BarChart data={stats.exercicioData} margin={{ top: 20, right: 15, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={formatShortCurrency}
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 min-w-[220px]">
                            <p className="font-black text-crb-navy mb-2 text-sm">Exercício {item.name}</p>
                            <div className="space-y-1.5">
                              <p className="text-xs font-bold text-emerald-600 flex justify-between gap-4">
                                <span className="text-slate-500 font-semibold">Valor em Aberto:</span>
                                <span className="font-black tabular-nums">{formatCurrency(item.valor)}</span>
                              </p>
                              <p className="text-xs font-bold text-slate-700 flex justify-between gap-4">
                                <span className="text-slate-500 font-semibold">Volume de Débitos:</span>
                                <span className="font-black tabular-nums">{item.quantidade} débitos</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="valor" fill="#1e3a8a" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <AlertCircle size={32} className="text-slate-300 mb-2" />
                <p className="font-bold text-sm">Sem valores em aberto registrados por exercício</p>
                <p className="text-xs text-slate-400 mt-1">Os débitos por ano serão exibidos conforme cadastrados.</p>
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
