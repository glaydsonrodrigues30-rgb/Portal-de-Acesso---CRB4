import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getAnoDe } from '../../lib/numeracao';
import ProcessosSummaryPanel from '../ProcessosSummaryPanel';
import { Processo } from '../../types';
import { Loader2, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

export default function ProcessosView() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYearStr = new Date().getFullYear().toString();
  const [selectedAno, setSelectedAno] = useState<string>(currentYearStr);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'processos');
        const snapshot = await getDocs(query(col, limit(2000)));
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Processo));
        setProcessos(data);
      } catch (err) {
        console.error('Erro ao carregar dados de processos para o dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Anos disponíveis
  const availableYears = useMemo(() => {
    const setAnos = new Set<number>();
    const currentYear = new Date().getFullYear();
    setAnos.add(currentYear);

    processos.forEach(p => {
      if (p.ano && !isNaN(Number(p.ano))) {
        setAnos.add(Number(p.ano));
      } else {
        const anoCalc = getAnoDe(p.dataSolicitacao || p.dataAbertura || p.createdAt);
        setAnos.add(anoCalc);
      }
    });

    return Array.from(setAnos).filter(y => y >= 1990 && y <= 2050).sort((a, b) => b - a);
  }, [processos]);

  // Filtragem por ano
  const filteredProcessos = useMemo(() => {
    if (!selectedAno) return processos;
    const anoInt = Number(selectedAno);
    return processos.filter(p => {
      if (p.ano && Number(p.ano) === anoInt) return true;
      const anoCalc = getAnoDe(p.dataSolicitacao || p.dataAbertura || p.createdAt);
      return anoCalc === anoInt;
    });
  }, [processos, selectedAno]);

  // Alertas calculados sobre os processos filtrados
  const alertas = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let processosMais90Dias = 0;
    let aguardandoPlenaria = 0;
    let concluidos = 0;

    filteredProcessos.forEach(p => {
      const st = String(p.status || '').toLowerCase();
      if (st.includes('plenaria') || st.includes('plenária')) {
        aguardandoPlenaria++;
      }
      if (st.includes('deferido') || st.includes('conclu') || st.includes('indeferido')) {
        concluidos++;
      }

      const dtStr = p.dataSolicitacao || p.dataAbertura || p.createdAt;
      if (dtStr) {
        const dt = new Date(dtStr);
        if (!isNaN(dt.getTime())) {
          const diffDays = Math.floor((today.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 90 && !st.includes('deferido') && !st.includes('indeferido') && !st.includes('conclu')) {
            processosMais90Dias++;
          }
        }
      }
    });

    return {
      processosMais90Dias,
      aguardandoPlenaria,
      concluidos
    };
  }, [filteredProcessos]);

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 text-crb-navy">
        <Loader2 className="animate-spin text-crb-purple" size={32} />
        <span className="font-sans font-bold text-xs uppercase tracking-widest text-slate-500">
          Carregando indicadores de processos...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Painel Analítico Completo de Processos */}
      <ProcessosSummaryPanel 
        processos={filteredProcessos}
        anoSelecionado={selectedAno}
        onAnoChange={setSelectedAno}
        availableYears={availableYears}
        mostrarSeletorAno={true}
      />

      {/* Alertas Estratégicos Institucionais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-red-900 uppercase tracking-widest">
                Tramitação Prolongada
              </p>
              <p className="text-xs text-red-700 font-medium">Mais de 90 dias sem conclusão</p>
            </div>
          </div>
          <span className="text-3xl font-serif font-bold text-red-900">{alertas.processosMais90Dias}</span>
        </div>

        <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-900 uppercase tracking-widest">
                Pauta de Plenária
              </p>
              <p className="text-xs text-blue-700 font-medium">Aguardando deliberação colegiada</p>
            </div>
          </div>
          <span className="text-3xl font-serif font-bold text-blue-900">{alertas.aguardandoPlenaria}</span>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-emerald-900 uppercase tracking-widest">
                Processos Concluídos
              </p>
              <p className="text-xs text-emerald-700 font-medium">Julgados e encerrados no período</p>
            </div>
          </div>
          <span className="text-3xl font-serif font-bold text-emerald-900">{alertas.concluidos}</span>
        </div>
      </div>
    </div>
  );
}

