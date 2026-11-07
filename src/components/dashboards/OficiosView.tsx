import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getAnoDe, getAnoRegistro } from '../../lib/numeracao';
import OficiosSummaryPanel from '../OficiosSummaryPanel';
import { Oficio } from '../../types';
import { Loader2, Users } from 'lucide-react';

export default function OficiosView() {
  const [oficios, setOficios] = useState<Oficio[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYearStr = new Date().getFullYear().toString();
  const [selectedAno, setSelectedAno] = useState<string>(currentYearStr);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const col = collection(db, 'oficios');
        const snapshot = await getDocs(query(col, limit(2000)));
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Oficio));
        setOficios(data);
      } catch (err) {
        console.error('Erro ao carregar dados de ofícios para o dashboard:', err);
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

    oficios.forEach(o => {
      setAnos.add(getAnoRegistro(o));
    });

    return Array.from(setAnos).filter(y => y >= 1990 && y <= 2050).sort((a, b) => b - a);
  }, [oficios]);

  // Filtragem por ano
  const filteredOficios = useMemo(() => {
    if (!selectedAno) return oficios;
    const anoInt = Number(selectedAno);
    return oficios.filter(o => {
      return getAnoRegistro(o) === anoInt;
    });
  }, [oficios, selectedAno]);

  // Principais órgãos / destinatários para o período selecionado
  const topDestinatarios = useMemo(() => {
    const mapDest: Record<string, number> = {};
    filteredOficios.forEach(o => {
      const dest = (o.destinatario || o.orgaoDestino || '').trim();
      if (dest) {
        mapDest[dest] = (mapDest[dest] || 0) + 1;
      }
    });

    return Object.entries(mapDest)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredOficios]);

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 text-crb-navy">
        <Loader2 className="animate-spin text-crb-purple" size={32} />
        <span className="font-sans font-bold text-xs uppercase tracking-widest text-slate-500">
          Carregando indicadores de ofícios expedidos...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Painel Analítico Completo de Ofícios */}
      <OficiosSummaryPanel 
        oficios={filteredOficios}
        anoSelecionado={selectedAno}
        onAnoChange={setSelectedAno}
        availableYears={availableYears}
        mostrarSeletorAno={true}
      />

      {/* Seção Complementar: Concentração por Destinatários do Período */}
      {topDestinatarios.length > 0 && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-md">
          <div className="flex items-center gap-3 mb-6 border-l-4 border-crb-navy pl-4">
            <Users size={20} className="text-crb-navy" />
            <div>
              <h4 className="text-lg font-serif font-bold text-crb-navy">
                Principais Destinatários e Órgãos no Período
              </h4>
              <p className="text-xs text-slate-500">
                Instituições com maior volume de correspondências recebidas {selectedAno ? `em ${selectedAno}` : '(Geral)'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topDestinatarios.map((d, i) => (
              <div 
                key={i} 
                className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-white hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-serif font-bold text-xs text-crb-navy shrink-0 shadow-sm">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-crb-navy truncate uppercase tracking-tight">
                      {d.name}
                    </p>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Destinatário
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <span className="text-base font-serif font-bold text-crb-navy">{d.count}</span>
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">ofícios</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

