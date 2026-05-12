import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  FileText, 
  Filter, 
  Search, 
  Download, 
  FileSpreadsheet, 
  File as FilePdf,
  ChevronDown,
  Calendar,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ModuleType = 'debitos' | 'notificacoes' | 'negociacoes' | 'oficios' | 'processos';

interface ReportFilter {
  module: ModuleType;
  status?: string;
  ano?: string;
  periodoInicio?: string;
  periodoFim?: string;
  tipo?: string;
  vencidosOnly?: boolean;
}

export default function Relatorios() {
  const [filters, setFilters] = useState<ReportFilter>({ module: 'debitos' });
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const modules = [
    { id: 'debitos', label: 'Débitos', icon: FileText, collection: 'debits' },
    { id: 'notificacoes', label: 'Notificações', icon: Filter, collection: 'notifications' },
    { id: 'negociacoes', label: 'Negociações', icon: Search, collection: 'negotiations' },
    { id: 'oficios', label: 'Ofícios Expedidos', icon: Download, collection: 'oficios' },
    { id: 'processos', label: 'Processos', icon: FileSpreadsheet, collection: 'processos' },
  ];

  const handleGenerateReport = async () => {
    setLoading(true);
    setGenerated(false);
    try {
      const selectedModule = modules.find(m => m.id === filters.module);
      if (!selectedModule) return;

      let q = query(collection(db, selectedModule.collection));

      // Apply dynamic filters based on module
      if (filters.module === 'debitos') {
        if (filters.ano) q = query(q, where('ano', '==', Number(filters.ano)));
        if (filters.status) q = query(q, where('statusGeral', '==', filters.status));
      } else if (filters.module === 'notificacoes') {
        if (filters.status) q = query(q, where('status', '==', filters.status));
        if (filters.tipo) q = query(q, where('tipo', '==', filters.tipo));
      } else if (filters.module === 'negociacoes') {
        if (filters.status) q = query(q, where('status', '==', filters.status));
      } else if (filters.module === 'oficios') {
        if (filters.ano) q = query(q, where('ano', '==', Number(filters.ano)));
        if (filters.tipo) q = query(q, where('tipo', '==', filters.tipo));
      } else if (filters.module === 'processos') {
        if (filters.status) q = query(q, where('status', '==', filters.status));
        if (filters.tipo) q = query(q, where('tipo', '==', filters.tipo));
      }

      const snapshot = await getDocs(q);
      let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Apply Year Filter for modules that don't have a direct 'ano' field in Firestore
      if (filters.ano) {
        const yearInt = Number(filters.ano);
        results = results.filter((item: any) => {
          // If the item already has a direct 'ano' field, it was probably filtered server-side, 
          // but we check here for consistency.
          if (item.ano === yearInt || Number(item.ano) === yearInt) return true;
          
          // Otherwise, try to extract year from common date fields used in each module
          const dateStr = item.dataEnvio || item.dataAcordo || item.dataEmissao || item.dataAbertura || item.dataVencimento || item.createdAt;
          if (dateStr) {
            const dateObj = new Date(dateStr);
            if (isNaN(dateObj.getTime())) return false;
            return dateObj.getFullYear() === yearInt;
          }
          return false;
        });
      }

      // Client-side filter for Overdue ("Vencidos") if required
      if (filters.module === 'debitos' && filters.vencidosOnly) {
        const today = new Date();
        results = results.filter((item: any) => {
          const vencimento = item.dataVencimento ? new Date(item.dataVencimento) : null;
          return vencimento && vencimento < today && item.statusGeral !== 'Pago';
        });
      }

      setData(results);
      setGenerated(true);
    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      handleFirestoreError(err, OperationType.LIST, filters.module);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, `Relatorio_${filters.module}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPdf = () => {
    if (data.length === 0) return;
    const doc = new jsPDF();
    const tableColumn = Object.keys(data[0]).filter(k => k !== 'id');
    const tableRows = data.map(item => tableColumn.map(col => item[col]?.toString() || ''));

    doc.text(`Relatório de ${filters.module.toUpperCase()}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn.map(c => c.toUpperCase())],
      body: tableRows,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] }
    });

    doc.save(`Relatorio_${filters.module}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const totals = {
    count: data.length,
    value: data.reduce((acc, curr) => acc + (curr.valorCorrigido || curr.valor || 0), 0)
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-blue pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Relatórios Institucionais</h2>
          <p className="text-slate-500 font-medium font-sans">Geração de relatórios analíticos por módulo do sistema.</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Module Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Módulo do Sistema</label>
            <select 
              className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-blue outline-none transition-all font-bold text-crb-navy"
              value={filters.module}
              onChange={(e) => {
                setFilters({ ...filters, module: e.target.value as ModuleType });
                setGenerated(false);
                setData([]);
              }}
            >
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Global Year Filter */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Exercício (Ano)</label>
            <select 
              className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-blue outline-none transition-all font-bold text-crb-navy"
              value={filters.ano || ''}
              onChange={(e) => setFilters({...filters, ano: e.target.value})}
            >
              <option value="">Todos os anos</option>
              {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y.toString()}>{y}</option>
              ))}
            </select>
          </div>

          {/* Dynamic Filters depending on module */}
          <AnimatePresence mode="wait">
            <motion.div 
              key={filters.module}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="contents"
            >
              {filters.module === 'debitos' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Situação</label>
                    <select 
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-blue outline-none transition-all font-bold text-crb-navy"
                      value={filters.status || ''}
                      onChange={(e) => setFilters({...filters, status: e.target.value})}
                    >
                      <option value="">Todos</option>
                      <option value="Pendente">Pendente</option>
                      <option value="Pago">Pago</option>
                      <option value="Vencido">Vencido</option>
                      <option value="Em Negociação">Em Negociação</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only"
                          checked={filters.vencidosOnly || false}
                          onChange={(e) => setFilters({...filters, vencidosOnly: e.target.checked})}
                        />
                        <div className={cn(
                          "w-10 h-6 rounded-full transition-all duration-300",
                          filters.vencidosOnly ? "bg-red-500" : "bg-slate-200"
                        )}></div>
                        <div className={cn(
                          "absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                          filters.vencidosOnly ? "translate-x-4" : "translate-x-0"
                        )}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Apenas Vencidos</span>
                    </label>
                  </div>
                </>
              )}

              {(filters.module === 'notificacoes' || filters.module === 'processos' || filters.module === 'oficios') && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status / Situação</label>
                    <select 
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-blue outline-none transition-all font-bold text-crb-navy"
                      value={filters.status || ''}
                      onChange={(e) => setFilters({...filters, status: e.target.value})}
                    >
                      <option value="">Todos</option>
                      <option value="PENDENTE">Pendente</option>
                      <option value="CONCLUIDO">Concluído</option>
                      <option value="ENVIADO">Enviado</option>
                      <option value="PROCESSADO">Processado</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Documento</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-blue outline-none transition-all font-bold text-crb-navy"
                      placeholder="Filtrar por tipo..."
                      value={filters.tipo || ''}
                      onChange={(e) => setFilters({...filters, tipo: e.target.value})}
                    />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-col md:flex-row gap-4 pt-4">
          <button 
            onClick={handleGenerateReport}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-crb-navy text-white px-8 py-4 rounded-2xl hover:bg-crb-navy-dark transition-all shadow-lg font-bold uppercase tracking-widest text-xs disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : <FileText size={18} />}
            {loading ? 'Gerando...' : 'Gerar Relatório'}
          </button>
          
          {generated && data.length > 0 && (
            <div className="flex gap-4">
              <button 
                onClick={exportToExcel}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg font-bold uppercase tracking-widest text-xs"
              >
                <FileSpreadsheet size={18} />
                Excel
              </button>
              <button 
                onClick={exportToPdf}
                className="flex items-center gap-2 bg-red-600 text-white px-6 py-4 rounded-2xl hover:bg-red-700 transition-all shadow-lg font-bold uppercase tracking-widest text-xs"
              >
                <FilePdf size={18} />
                PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {generated && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Totals Banner */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
                <div className="p-4 bg-slate-100 rounded-2xl text-crb-navy">
                  <Database size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Registros</p>
                  <p className="text-3xl font-serif font-black text-crb-navy">{totals.count}</p>
                </div>
              </div>
              {filters.module === 'debitos' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Total Consolidado</p>
                    <p className="text-3xl font-serif font-black text-crb-navy">{formatCurrency(totals.value)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
                      {data.length > 0 && Object.keys(data[0]).filter(k => !['id', 'updatedAt'].includes(k)).map(key => (
                        <th key={key} className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em]">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-2">
                             <AlertTriangle size={40} className="text-amber-500 mb-2" />
                             <span className="text-lg font-serif font-bold text-slate-400">Sem dados para os filtros selecionados</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      data.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          {Object.keys(item).filter(k => !['id', 'updatedAt'].includes(k)).map(key => (
                             <td key={key} className="px-8 py-4 text-xs font-bold text-slate-600">
                               {key.toLowerCase().includes('valor') ? formatCurrency(item[key]) : 
                                key.toLowerCase().includes('data') ? formatDate(item[key]) :
                                String(item[key])}
                             </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Database({ size }: { size: number }) {
  return <FileSpreadsheet size={size} />;
}

function TrendingUp({ size }: { size: number }) {
  return <Download size={size} />;
}
