import React, { useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import SummaryView from '../components/dashboards/SummaryView';
import DebitosView from '../components/dashboards/DebitosView';
import NotificacoesView from '../components/dashboards/NotificacoesView';
import NegociacoesView from '../components/dashboards/NegociacoesView';
import OficiosView from '../components/dashboards/OficiosView';
import ProcessosView from '../components/dashboards/ProcessosView';
import { 
  BarChart3, CreditCard, Mail, Handshake, FileText, FolderOpen, Settings2 
} from 'lucide-react';
import { cn } from '../lib/utils';

type DashboardTab = 'geral' | 'debitos' | 'notificacoes' | 'negociacoes' | 'oficios' | 'processos';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('geral');

  const goToTab = (tab: DashboardTab) => setActiveTab(tab);

  const tabs = [
    { id: 'geral', label: 'Geral', icon: BarChart3, color: 'text-crb-navy' },
    { id: 'debitos', label: 'Débitos', icon: CreditCard, color: 'text-emerald-600' },
    { id: 'notificacoes', label: 'Notificações', icon: Mail, color: 'text-crb-blue' },
    { id: 'negociacoes', label: 'Negociações', icon: Handshake, color: 'text-crb-purple' },
    { id: 'oficios', label: 'Ofícios Expedidos', icon: FileText, color: 'text-slate-600' },
    { id: 'processos', label: 'Processos', icon: FolderOpen, color: 'text-crb-blue' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'geral': return <SummaryView onTabChange={goToTab} />;
      case 'debitos': return <DebitosView />;
      case 'notificacoes': return <NotificacoesView />;
      case 'negociacoes': return <NegociacoesView />;
      case 'oficios': return <OficiosView />;
      case 'processos': return <ProcessosView />;
      default: return <SummaryView onTabChange={goToTab} />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-8 pb-20 space-y-8 overflow-x-hidden">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b-2 border-slate-200/60 pb-8 mt-4">
        <div className="flex items-center gap-6">
          <img src="https://i.postimg.cc/CLwGjkqN/logo.png" alt="CRB-4 Logo" className="h-16 hidden md:block drop-shadow-sm" />
          <div className="flex flex-col gap-2 border-l-4 border-crb-blue pl-6">
            <h2 className="text-2xl md:text-3xl font-serif font-black text-crb-navy tracking-tight">Painel de Controle</h2>
            <p className="text-sm md:text-base text-slate-500 font-bold font-sans italic opacity-80">Métricas em tempo real do CRB-4.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto overflow-hidden">
          <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-2xl gap-1 w-full shadow-inner justify-center md:justify-start">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as DashboardTab)}
                className={cn(
                  "flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-[10px] md:text-sm font-bold transition-all whitespace-nowrap",
                  isActive 
                    ? "bg-white text-crb-navy shadow-sm ring-1 ring-slate-200" 
                    : "text-slate-500 hover:text-crb-navy hover:bg-white/50"
                )}
              >
                <Icon size={14} className={isActive ? tab.color : 'text-slate-400'} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>

    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {renderContent()}
      </div>
    </div>
  );
}
