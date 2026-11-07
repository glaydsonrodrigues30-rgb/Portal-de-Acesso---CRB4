import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  FileText, Send, Clock, AlertCircle, XCircle, TrendingUp, 
  Calendar, Layers, Table, CheckCircle2
} from 'lucide-react';
import { Oficio } from '../types';
import { 
  normalizarTipoOficio, 
  normalizarAssuntoOficio, 
  getAnoDe 
} from '../lib/numeracao';
import { cn } from '../lib/utils';

interface OficiosSummaryPanelProps {
  oficios: Oficio[];
  anoSelecionado?: string;
  onAnoChange?: (ano: string) => void;
  availableYears?: number[];
  mostrarSeletorAno?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'Enviado': '#10b981',           // Emerald
  'Aguardando Envio': '#7c3aed',  // Purple
  'Pendente': '#f59e0b',          // Amber
  'Cancelado': '#ef4444',         // Red
  'Outros': '#94a3b8'
};

const TIPO_COLORS = ['#1e3a8a', '#7c3aed', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#64748b'];

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function OficiosSummaryPanel({
  oficios,
  anoSelecionado,
  onAnoChange,
  availableYears = [],
  mostrarSeletorAno = false
}: OficiosSummaryPanelProps) {

  const {
    total,
    statusCounts,
    assuntoData,
    tipoData,
    statusPieData,
    evolucaoMensal,
    tabelaCruzada,
    colunasStatusUnicas,
    totaisColunas
  } = useMemo(() => {
    const list = oficios || [];

    const mapStatus: Record<string, number> = {
      'Enviado': 0,
      'Aguardando Envio': 0,
      'Pendente': 0,
      'Cancelado': 0,
      'Outros': 0
    };

    const mapAssunto: Record<string, number> = {};
    const mapTipo: Record<string, number> = {};
    const mapMeses: Record<number, number> = {};

    // Matriz Cruzada: [tipo][status] = count
    const matriz: Record<string, Record<string, number>> = {};
    const statusSet = new Set<string>(['Enviado', 'Aguardando Envio', 'Pendente', 'Cancelado']);

    list.forEach(o => {
      // Status
      const rawSt = String(o.status || '').trim();
      let stNorm = 'Enviado';
      if (/aguardando/i.test(rawSt)) stNorm = 'Aguardando Envio';
      else if (/pendente/i.test(rawSt)) stNorm = 'Pendente';
      else if (/cancelado|sem efeito/i.test(rawSt)) stNorm = 'Cancelado';
      else if (/enviado|protocolado/i.test(rawSt)) stNorm = 'Enviado';
      else if (rawSt) stNorm = rawSt;

      mapStatus[stNorm] = (mapStatus[stNorm] || 0) + 1;
      statusSet.add(stNorm);

      // Tipo de Ofício (preservando o valor real importado/cadastrado)
      const rawTipo = o.tipoOficio || o.tipo;
      const tpNorm = normalizarTipoOficio(rawTipo);
      mapTipo[tpNorm] = (mapTipo[tpNorm] || 0) + 1;

      // Assunto
      const assNorm = normalizarAssuntoOficio(o.assunto);
      mapAssunto[assNorm] = (mapAssunto[assNorm] || 0) + 1;

      // Matriz
      if (!matriz[tpNorm]) {
        matriz[tpNorm] = {};
      }
      matriz[tpNorm][stNorm] = (matriz[tpNorm][stNorm] || 0) + 1;

      // Mês
      const dtStr = o.dataEnvio || o.dataEmissao || o.createdAt;
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

    const assuntoArr = Object.entries(mapAssunto)
      .map(([assunto, qtd]) => ({ assunto, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    const tipoArr = Object.entries(mapTipo)
      .map(([tipo, qtd]) => ({ tipo, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    const pieArr = Object.entries(mapStatus)
      .filter(([_, qtd]) => qtd > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: STATUS_COLORS[name] || '#94a3b8'
      }));

    const mensalArr = MESES_ABREV.map((mes, idx) => ({
      mes,
      qtd: mapMeses[idx] || 0
    }));

    const colunas = Array.from(statusSet);
    const cruzadaLinhas = Object.entries(matriz).map(([tipo, stMap]) => {
      const totalLinha = Object.values(stMap).reduce((acc, v) => acc + v, 0);
      return {
        tipo,
        stMap,
        totalLinha
      };
    }).sort((a, b) => b.totalLinha - a.totalLinha);

    const totaisCol: Record<string, number> = {};
    colunas.forEach(c => {
      totaisCol[c] = cruzadaLinhas.reduce((acc, row) => acc + (row.stMap[c] || 0), 0);
    });

    return {
      total: list.length,
      statusCounts: mapStatus,
      assuntoData: assuntoArr,
      tipoData: tipoArr,
      statusPieData: pieArr,
      evolucaoMensal: mensalArr,
      tabelaCruzada: cruzadaLinhas,
      colunasStatusUnicas: colunas,
      totaisColunas: totaisCol
    };
  }, [oficios]);

  const tituloAno = anoSelecionado ? `Ofícios Expedidos ${anoSelecionado}` : 'Ofícios Expedidos (Todos os Anos)';

  return (
    <div className="space-y-8 font-sans">
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-200">
        <div>
          <span className="text-[10px] font-bold text-crb-purple uppercase tracking-widest block">
            Painel Analítico de Comunicação Oficial
          </span>
          <h3 className="text-xl md:text-2xl font-serif font-bold text-crb-navy mt-1">
            Resumo Geral de {tituloAno}
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Métricas por assunto, tipo de correspondência, status e evolução mensal.
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Expedido</span>
            <FileText size={18} className="text-crb-navy" />
          </div>
          <p className="text-3xl font-serif font-bold text-crb-navy mt-3">{total}</p>
          <span className="text-[10px] text-slate-400 mt-1 font-medium">Ofícios no período</span>
        </div>

        <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Enviados</span>
            <Send size={18} className="text-emerald-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-emerald-900 mt-3">{statusCounts['Enviado'] || 0}</p>
          <span className="text-[10px] text-emerald-700 mt-1 font-medium">Protocolados com sucesso</span>
        </div>

        <div className="bg-purple-50/70 p-5 rounded-2xl border border-purple-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-widest">Aguardando Envio</span>
            <Clock size={18} className="text-purple-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-purple-900 mt-3">
            {(statusCounts['Aguardando Envio'] || 0) + (statusCounts['Pendente'] || 0)}
          </p>
          <span className="text-[10px] text-purple-700 mt-1 font-medium">Em preparação / pendentes</span>
        </div>

        <div className="bg-red-50/70 p-5 rounded-2xl border border-red-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-red-800 uppercase tracking-widest">Cancelados</span>
            <XCircle size={18} className="text-red-600" />
          </div>
          <p className="text-3xl font-serif font-bold text-red-900 mt-3">{statusCounts['Cancelado'] || 0}</p>
          <span className="text-[10px] text-red-700 mt-1 font-medium">Sem efeito legal</span>
        </div>
      </div>

      {/* Gráficos: Tipos, Assuntos, Rosca e Evolução */}
      <div id="painel-oficios-graficos" className="space-y-8 bg-white p-4 rounded-3xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gráfico de Tipos de Ofício */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
            <div className="flex items-center gap-3 mb-6 border-l-4 border-crb-navy pl-4">
              <div>
                <h4 className="text-lg font-serif font-bold text-crb-navy">Tipos de Ofício</h4>
                <p className="text-xs text-slate-500">Classificação conforme dados reais (Presidente, Administrativo, Circular, etc.)</p>
              </div>
            </div>
            <div className="w-full h-[300px]">
              {tipoData.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={tipoData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="tipo" axisLine={false} tickLine={false} tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      formatter={(val: any) => [`${val} ofícios`, 'Total']}
                    />
                    <Bar dataKey="qtd" fill="#1e3a8a" radius={[6, 6, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 font-medium italic">
                  Nenhum ofício registrado.
                </div>
              )}
            </div>
          </div>

          {/* Gráfico de Barras por Assunto */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
            <div className="flex items-center gap-3 mb-6 border-l-4 border-emerald-500 pl-4">
              <div>
                <h4 className="text-lg font-serif font-bold text-crb-navy">Assuntos Mais Frequentes</h4>
                <p className="text-xs text-slate-500">Agrupamento dos principais temas tratados nos ofícios</p>
              </div>
            </div>
            <div className="w-full h-[300px]">
              {assuntoData.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={assuntoData.slice(0, 7)} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis 
                      type="category" 
                      dataKey="assunto" 
                      width={130} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      formatter={(val: any) => [`${val} ofícios`, 'Quantidade']}
                    />
                    <Bar dataKey="qtd" fill="#10b981" radius={[0, 6, 6, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 font-medium italic">
                  Sem dados de assunto para exibir.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gráfico de Rosca por Status e Linha de Evolução Mensal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
            <div className="flex items-center gap-3 mb-6 border-l-4 border-crb-purple pl-4">
              <div>
                <h4 className="text-lg font-serif font-bold text-crb-navy">Distribuição por Status</h4>
                <p className="text-xs text-slate-500">Situação atual das correspondências</p>
              </div>
            </div>
            <div className="w-full h-[280px]">
              {statusPieData.length > 0 ? (
                <ResponsiveContainer width="99%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
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
                        `${val} ofícios (${total > 0 ? ((val / total) * 100).toFixed(1) : 0}%)`,
                        name
                      ]}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 font-medium italic">
                  Nenhum dado para exibir.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
            <div className="flex items-center gap-3 mb-6 border-l-4 border-crb-blue pl-4">
              <div>
                <h4 className="text-lg font-serif font-bold text-crb-navy">Evolução Mensal de Expedição</h4>
                <p className="text-xs text-slate-500">Volume de documentos emitidos ao longo do ano</p>
              </div>
            </div>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="99%" height="100%">
                <LineChart data={evolucaoMensal} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    formatter={(val: any) => [`${val} ofícios`, 'Expedidos']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="qtd" 
                    stroke="#7c3aed" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#7c3aed', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 6, fill: '#1e3a8a' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Tipos x Status */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Table size={20} className="text-crb-navy" />
            <div>
              <h4 className="text-base font-serif font-bold text-crb-navy">
                Detalhamento: Tipo de Ofício x Status
              </h4>
              <p className="text-xs text-slate-500">
                Distribuição das correspondências oficiais por modalidade e situação.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase font-mono">
            {tabelaCruzada.length} tipos identificados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="px-5 py-3.5 sticky left-0 bg-slate-100 z-10">Tipo de Ofício</th>
                {colunasStatusUnicas.map(st => (
                  <th key={st} className="px-4 py-3.5 text-center whitespace-nowrap">{st}</th>
                ))}
                <th className="px-5 py-3.5 text-right font-black bg-slate-200/70 text-crb-navy">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tabelaCruzada.length === 0 ? (
                <tr>
                  <td colSpan={colunasStatusUnicas.length + 2} className="px-6 py-10 text-center text-slate-400 italic">
                    Nenhum registro para exibir.
                  </td>
                </tr>
              ) : (
                tabelaCruzada.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 whitespace-nowrap">
                      {row.tipo}
                    </td>
                    {colunasStatusUnicas.map(st => {
                      const val = row.stMap[st] || 0;
                      return (
                        <td key={st} className="px-4 py-3 text-center font-mono">
                          {val > 0 ? (
                            <span className={cn(
                              "inline-block px-2 py-0.5 rounded font-bold text-[11px]",
                              st === 'Enviado' ? "bg-emerald-50 text-emerald-800" :
                              st === 'Cancelado' ? "bg-red-50 text-red-800" :
                              st === 'Aguardando Envio' ? "bg-purple-50 text-purple-800" :
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
                {colunasStatusUnicas.map(st => (
                  <td key={st} className="px-4 py-4 text-center font-mono text-sm">
                    {totaisColunas[st] || 0}
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
