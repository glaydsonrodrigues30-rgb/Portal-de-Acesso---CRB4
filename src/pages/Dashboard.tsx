import React, { useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import SummaryView from '../components/dashboards/SummaryView';
import DebitosView from '../components/dashboards/DebitosView';
import NotificacoesView from '../components/dashboards/NotificacoesView';
import OficiosView from '../components/dashboards/OficiosView';
import ProcessosView from '../components/dashboards/ProcessosView';
import { 
  BarChart3, CreditCard, Mail, FileText, FolderOpen, Settings2 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/utils';

type DashboardTab = 'geral' | 'debitos' | 'oficios' | 'processos';

export default function Dashboard() {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('geral');

  const goToTab = (tab: DashboardTab) => setActiveTab(tab);

  const tabs = [
    { id: 'geral', label: 'Geral', icon: BarChart3, color: 'text-crb-navy' },
    { id: 'debitos', label: 'Débitos', icon: CreditCard, color: 'text-emerald-600' },
    { id: 'oficios', label: 'Ofícios Expedidos', icon: FileText, color: 'text-slate-600' },
    { id: 'processos', label: 'Processos', icon: FolderOpen, color: 'text-crb-blue' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'geral': return <SummaryView onTabChange={goToTab} />;
      case 'debitos': return <DebitosView />;
      case 'oficios': return <OficiosView />;
      case 'processos': return <ProcessosView />;
      default: return <SummaryView onTabChange={goToTab} />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-8 pb-20 space-y-8 overflow-x-hidden">
      {/* Aviso discreto enquanto não tiver e-mail confirmado */}
      {userData?.email?.endsWith('@crb4.local') && (
        <div className="bg-amber-50/90 border border-amber-200/90 text-amber-900 px-4 py-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-medium shadow-xs">
          <div className="flex items-center gap-2.5">
            <Mail size={16} className="text-amber-700 shrink-0" />
            <span>Cadastre seu e-mail para poder recuperar a senha.</span>
          </div>
          <Link 
            to="/meu-cadastro" 
            className="text-amber-800 hover:text-amber-950 font-bold underline shrink-0 transition-colors"
          >
            Cadastrar agora &rarr;
          </Link>
        </div>
      )}

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
