import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  FolderOpen, CheckCircle2, XCircle, Clock, AlertCircle, FileCheck2, 
  TrendingUp, Calendar, Layers, Table
} from 'lucide-react';
import { Processo } from '../types';
import { 
  normalizarTipoSolicitacao, 
  normalizarStatusProcesso, 
  getAnoDe 
} from '../lib/numeracao';
import { cn } from '../lib/utils';

interface ProcessosSummaryPanelProps {
  processos: Processo[];
  anoSelecionado?: string;
  onAnoChange?: (ano: string) => void;
  availableYears?: number[];
  mostrarSeletorAno?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'Deferido': '#10b981',           // Emerald
  'Indeferido': '#ef4444',         // Red
  'Aguardando Plenária': '#2563eb',// Blue
  'Em Análise': '#7c3aed',         // Purple
  'Pendente': '#f59e0b',           // Amber
  'Ad Referendum': '#8b5cf6',      // Violet
  'Sobrestado': '#64748b',         // Slate
  'Outros': '#94a3b8'              // Gray
};

const COLUNAS_STATUS = [
  'Deferido',
  'Indeferido',
  'Aguardando Plenária',
  'Em Análise',
  'Pendente',
  'Ad Referendum',
  'Outros'
];

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function ProcessosSummaryPanel({
  processos,
  anoSelecionado,
  onAnoChange,
  availableYears = [],
  mostrarSeletorAno = false
}: ProcessosSummaryPanelProps) {

  // Cálculos consolidados e métricas
  const {
    total,
    statusCounts,
    tiposData,
    statusPieData,
    evolucaoMensal,
    tabelaCruzada,
    totaisColunasCruzada
  } = useMemo(() => {
    const list = processos || [];
    const countStatus: Record<string, number> = {
      'Deferido': 0,
      'Indeferido': 0,
      'Aguardando Plenária': 0,
      'Em Análise': 0,
      'Pendente': 0,
      'Ad Referendum': 0,
      'Sobrestado': 0,
      'Outros': 0
    };

    const mapTipos: Record<string, number> = {};
    const mapMeses: Record<number, number> = {};

    // Matriz cruzada: [tipo][status] = count
    const matriz: Record<string, Record<string, number>> = {};

    list.forEach(p => {
      const stNorm = normalizarStatusProcesso(p.status);
      const tpNorm = normalizarTipoSolicitacao(p.solicitacao || p.descricao);

      // Status count
      if (countStatus[stNorm] !== undefined) {
        countStatus[stNorm]++;
      } else {
        countStatus['Outros'] = (countStatus['Outros'] || 0) + 1;
      }

      // Tipos count
      mapTipos[tpNorm] = (mapTipos[tpNorm] || 0) + 1;

      // Matriz cruzada
      if (!matriz[tpNorm]) {
        matriz[tpNorm] = {};
        COLUNAS_STATUS.forEach(c => { matriz[tpNorm][c] = 0; });
      }
      const stColuna = COLUNAS_STATUS.includes(stNorm) ? stNorm : 'Outros';
      matriz[tpNorm][stColuna] = (matriz[tpNorm][stColuna] || 0) + 1;

      // Mês da solicitação
      const dtStr = p.dataSolicitacao || p.dataAbertura || p.createdAt;
      if (dtStr) {
        let m: number | null = null;
        if (typeof dtStr === 'string' && dtStr.includes('/')) {
          const parts = dtStr.split('/');
          if (parts.length >= 2) {
            const mesNum = parseInt(parts[1], 10);
            if (mesNum >= 1 && mesNum <= 12) m = mesNum - 1;
          }
        }
        if (m === null) {
          const d = new Date(dtStr);
          if (!isNaN(d.getTime())) {
            m = d.getMonth();
          }
        }
        if (m !== null) {
          mapMeses[m] = (mapMeses[m] || 0) + 1;
        }
      }
    });

    // Gráfico de Barras por Tipo
    const tiposArr = Object.entries(mapTipos)
      .map(([tipo, qtd]) => ({ tipo, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    // Gráfico de Rosca por Status
    const pieArr = Object.entries(countStatus)
      .filter(([_, qtd]) => qtd > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: STATUS_COLORS[name] || '#94a3b8'
      }));

    // Evolução Mensal (12 meses)
    const mensalArr = MESES_ABREV.map((mes, idx) => ({
      mes,
      qtd: mapMeses[idx] || 0
    }));

    // Tabela Cruzada
    const cruzadaLinhas = Object.entries(matriz).map(([tipo, statuses]) => {
      const totalLinha = Object.values(statuses).reduce((acc, v) => acc + v, 0);
      return {
        tipo,
        statuses,
        totalLinha
      };
    }).sort((a, b) => b.totalLinha - a.totalLinha);

    const totaisColunas: Record<string, number> = {};
    COLUNAS_STATUS.forEach(st => {
      totaisColunas[st] = cruzadaLinhas.reduce((acc, row) => acc + (row.statuses[st] || 0), 0);
    });

    return {
      total: list.length,
      statusCounts: countStatus,
      tiposData: tiposArr,
      statusPieData: pieArr,
      evolucaoMensal: mensalArr,
      tabelaCruzada: cruzadaLinhas,
      totaisColunasCruzada: totaisColunas
    };
  }, [processos]);

  const tituloAno = anoSelecionado ? `Processos ${anoSelecionado}` : 'Processos (Todos os Anos)';

  return (
    <div className="space-y-8 font-sans">
      {/* Cabeçalho do Painel com Seletor de Ano se solicitado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-200">
        <div>
          <span className="text-[10px] font-bold text-crb-blue uppercase tracking-widest block">
            Painel Analítico Consolidado
          </span>
          <h3 className="text-xl md:text-2xl font-serif font-bold text-crb-navy mt-1">
            Resumo Geral de {tituloAno}
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Métricas por tipo de solicitação, status, evolução temporal e tabela cruzada.
          </p>
        </div>

        {mostrarSeletorAno && onAnoChange && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ano:</span>
            <select
              value={anoSelecionado || ''}
              onChange={(e) => onAnoChange(e.target.value)}
              className="bg-white border-2 border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-crb-navy outline-none focus:border-crb-purple shadow-sm transition-all"
            >
              <option value="">Todos os anos</option>
              {availableYears.map(y => (
                <option key={y} value={y.toString()}>{y}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Cartões de Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
            <FolderOpen size={18} className="text-crb-navy" />
          </div>
          <p className="text-3xl font-serif font-bold text-crb-navy mt-3">{total}</p>
          <span className="text-[10px] text-slate-400 mt-1 font-medium">Processos no período</span>
        </div>

        <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Deferidos</span>
            <CheckCircle2 size={18} className="text-emerald-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-emerald-900 mt-3">{statusCounts['Deferido'] || 0}</p>
          <span className="text-[10px] text-emerald-700 mt-1 font-medium">Aprovados em plenária</span>
        </div>

        <div className="bg-red-50/70 p-5 rounded-2xl border border-red-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-red-800 uppercase tracking-widest">Indeferidos</span>
            <XCircle size={18} className="text-red-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-red-900 mt-3">{statusCounts['Indeferido'] || 0}</p>
          <span className="text-[10px] text-red-700 mt-1 font-medium">Negados ou cancelados</span>
        </div>

        <div className="bg-blue-50/70 p-5 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Pauta Plenária</span>
            <Clock size={18} className="text-blue-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-blue-900 mt-3">{statusCounts['Aguardando Plenária'] || 0}</p>
          <span className="text-[10px] text-blue-700 mt-1 font-medium">Aguardando sessão</span>
        </div>

        <div className="bg-purple-50/70 p-5 rounded-2xl border border-purple-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-widest">Em Análise</span>
            <AlertCircle size={18} className="text-purple-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-purple-900 mt-3">
            {(statusCounts['Em Análise'] || 0) + (statusCounts['Pendente'] || 0)}
          </p>
          <span className="text-[10px] text-purple-700 mt-1 font-medium">Com relator / pendente</span>
        </div>

        <div className="bg-violet-50/70 p-5 rounded-2xl border border-violet-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-violet-800 uppercase tracking-widest">Ad Referendum</span>
            <FileCheck2 size={18} className="text-violet-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-violet-900 mt-3">{statusCounts['Ad Referendum'] || 0}</p>
          <span className="text-[10px] text-violet-700 mt-1 font-medium">Decisões presidenciais</span>
        </div>
      </div>

      {/* Gráficos: Barras por Tipo e Rosca por Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gráfico de Barras por Tipo */}
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
          <div className="flex items-center gap-3 mb-6 border-l-4 border-crb-purple pl-4">
            <div>
              <h4 className="text-lg font-serif font-bold text-crb-navy">Tipos de Solicitação</h4>
              <p className="text-xs text-slate-500">Distribuição quantitativa normalizada por tipo de pedido</p>
            </div>
          </div>
          <div className="w-full h-[320px]">
            {tiposData.length > 0 ? (
              <ResponsiveContainer width="99%" height="100%">
                <BarChart data={tiposData.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis 
                    type="category" 
                    dataKey="tipo" 
                    width={150} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    formatter={(val: any) => [`${val} processos`, 'Quantidade']}
                  />
                  <Bar dataKey="qtd" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 font-medium italic">
                Nenhum dado encontrado para este período.
              </div>
            )}
          </div>
        </div>

        {/* Gráfico de Rosca por Status */}
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
          <div className="flex items-center gap-3 mb-6 border-l-4 border-emerald-500 pl-4">
            <div>
              <h4 className="text-lg font-serif font-bold text-crb-navy">Distribuição por Status</h4>
              <p className="text-xs text-slate-500">Percentual das deliberações e estágios processuais</p>
            </div>
          </div>
          <div className="w-full h-[320px]">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="99%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    formatter={(val: any, name: any) => [
                      `${val} processos (${total > 0 ? ((val / total) * 100).toFixed(1) : 0}%)`,
                      name
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 font-medium italic">
                Nenhum dado de status para o período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico de Linha: Evolução Mensal */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
        <div className="flex items-center gap-3 mb-6 border-l-4 border-crb-blue pl-4">
          <div>
            <h4 className="text-lg font-serif font-bold text-crb-navy">Evolução Mensal de Solicitações</h4>
            <p className="text-xs text-slate-500">Fluxo de abertura e entrada de novos processos ao longo dos meses</p>
          </div>
        </div>
        <div className="w-full h-[260px]">
          <ResponsiveContainer width="99%" height="100%">
            <LineChart data={evolucaoMensal} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                formatter={(val: any) => [`${val} processos`, 'Entradas']}
              />
              <Line 
                type="monotone" 
                dataKey="qtd" 
                stroke="#1e3a8a" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#1e3a8a', strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 6, fill: '#7c3aed' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela Cruzada: Tipo de Solicitação x Status */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Table size={20} className="text-crb-navy" />
            <div>
              <h4 className="text-base font-serif font-bold text-crb-navy">
                Tabela Cruzada: Tipo de Solicitação x Status
              </h4>
              <p className="text-xs text-slate-500">
                Detalhamento bidirecional com totais por linha e por coluna.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase font-mono">
            {tabelaCruzada.length} categorias
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="px-5 py-3.5 sticky left-0 bg-slate-100 z-10">Tipo de Solicitação</th>
                {COLUNAS_STATUS.map(st => (
                  <th key={st} className="px-4 py-3.5 text-center whitespace-nowrap">{st}</th>
                ))}
                <th className="px-5 py-3.5 text-right font-black bg-slate-200/70 text-crb-navy">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tabelaCruzada.length === 0 ? (
                <tr>
                  <td colSpan={COLUNAS_STATUS.length + 2} className="px-6 py-12 text-center text-slate-400 italic">
                    Nenhum registro para exibir na tabela cruzada.
                  </td>
                </tr>
              ) : (
                tabelaCruzada.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 whitespace-nowrap">
                      {row.tipo}
                    </td>
                    {COLUNAS_STATUS.map(st => {
                      const val = row.statuses[st] || 0;
                      return (
                        <td key={st} className="px-4 py-3 text-center font-mono">
                          {val > 0 ? (
                            <span className={cn(
                              "inline-block px-2 py-0.5 rounded font-bold text-[11px]",
                              st === 'Deferido' ? "bg-emerald-50 text-emerald-800" :
                              st === 'Indeferido' ? "bg-red-50 text-red-800" :
                              st === 'Aguardando Plenária' ? "bg-blue-50 text-blue-800" :
                              "bg-slate-100 text-slate-700"
                            )}>
                              {val}
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-5 py-3 text-right font-mono font-bold text-crb-navy bg-slate-50/50">
                      {row.totalLinha}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-crb-navy border-t-2 border-slate-300">
                <td className="px-5 py-4 uppercase text-[10px] tracking-wider sticky left-0 bg-slate-100">
                  Total Geral
                </td>
                {COLUNAS_STATUS.map(st => (
                  <td key={st} className="px-4 py-4 text-center font-mono text-sm">
                    {totaisColunasCruzada[st] || 0}
                  </td>
                ))}
                <td className="px-5 py-4 text-right font-mono text-sm font-black bg-slate-200 text-crb-navy">
                  {total}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
