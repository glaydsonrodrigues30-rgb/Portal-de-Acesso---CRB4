import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CreditCard, 
  Mail, 
  Handshake, 
  FileText, 
  Files, 
  Users, 
  Database, 
  LogOut, 
  History,
  Menu,
  FolderOpen,
  X
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface SidebarItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}

function SidebarItem({ to, icon: Icon, label, onClick }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-4 py-3.5 text-sm font-bold transition-all rounded-xl",
          isActive 
            ? "bg-gradient-to-r from-crb-blue to-crb-purple text-white shadow-lg shadow-crb-blue/20" 
            : "text-white/60 hover:bg-white/5 hover:text-crb-blue"
        )
      }
    >
      <Icon size={20} className="transition-transform group-hover:scale-110" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { userData, logout, isAdmin } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans relative overflow-x-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-crb-navy border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src="https://i.postimg.cc/CLwGjkqN/logo.png" alt="CRB-4 Logo" className="h-10" />
          <span className="font-serif font-bold text-white text-lg tracking-tight">CRB-4</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-white">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay for mobile sidebar */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 bg-crb-navy flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0 border-r border-black/20 shadow-2xl md:shadow-none",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-8 hidden md:flex items-center gap-4 border-b border-white/10 mb-6 bg-crb-navy-dark">
          <img src="https://i.postimg.cc/CLwGjkqN/logo.png" alt="CRB-4 Logo" className="h-16 object-contain" />
          <div className="flex flex-col">
            <span className="font-serif font-bold text-white text-xl tracking-tighter leading-none">CRB-4</span>
            <span className="text-[10px] text-white font-bold uppercase tracking-[0.15em] mt-1.5 leading-tight">
              Sistema de Gestão<br />Institucional
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto pt-4 md:pt-2">
          <SidebarItem to="/" icon={LayoutDashboard} label="Painel de Controle" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarItem to="/debitos" icon={CreditCard} label="Gestão de Débitos" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarItem to="/notificacoes" icon={Mail} label="Notificações" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarItem to="/negociacoes" icon={Handshake} label="Negociações" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarItem to="/oficios" icon={FileText} label="Ofícios Expedidos" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarItem to="/processos" icon={FolderOpen} label="Processos" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarItem to="/relatorios" icon={Files} label="Relatórios" onClick={() => setIsMobileMenuOpen(false)} />
          
          {isAdmin && (
            <div className="pt-6 mt-6 border-t border-white/10 space-y-2">
              <span className="px-4 text-[10px] uppercase font-bold text-white/40 tracking-[0.3em]">Administração</span>
              <SidebarItem to="/usuarios" icon={Users} label="Controle de Usuários" onClick={() => setIsMobileMenuOpen(false)} />
              <SidebarItem to="/importar" icon={Database} label="Carga de Dados" onClick={() => setIsMobileMenuOpen(false)} />
              <SidebarItem to="/auditoria" icon={History} label="Logs de Auditoria" onClick={() => setIsMobileMenuOpen(false)} />
            </div>
          )}
        </nav>

        <div className="p-6 border-t border-white/10 bg-crb-navy-dark mt-auto">
          <div className="flex items-center gap-4 px-2 mb-6">
            <div className="w-10 h-10 rounded-full bg-crb-purple flex items-center justify-center text-white font-bold text-sm shadow-inner">
              {userData?.nome.charAt(0)}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold text-white truncate">{userData?.nome}</span>
              <span className="text-[10px] text-crb-purple-light font-medium uppercase tracking-wider">{userData?.perfil}</span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-white/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all border border-transparent hover:border-red-400/20"
          >
            <LogOut size={18} />
            Encerrar Sessão
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-20 hidden md:flex items-center justify-between px-10 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-md">
          <h1 className="text-2xl font-serif font-bold text-crb-navy tracking-tight drop-shadow-sm">
            {/* dynamic title could go here */}
          </h1>
          <div className="flex items-center gap-6">
            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
              Brasília, {new Date().toLocaleDateString('pt-BR')}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-[#F7F9FC]">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
