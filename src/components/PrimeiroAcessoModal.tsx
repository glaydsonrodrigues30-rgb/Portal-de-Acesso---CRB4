import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { KeyRound, ShieldAlert, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function PrimeiroAcessoModal() {
  const { userData, updateUserPassword, logout } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (novaSenha.length < 6) {
      setError('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmaSenha) {
      setError('A confirmação não coincide com a nova senha digitada.');
      return;
    }

    setLoading(true);
    try {
      await updateUserPassword(novaSenha, senhaAtual);
    } catch (err: any) {
      setError(err.message || 'Erro ao definir nova senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-crb-navy/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden"
      >
        <div className="bg-crb-navy p-6 text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg leading-tight">Primeiro Acesso</h3>
              <p className="text-[11px] text-white/60 font-medium">Troca obrigatória de senha</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => logout()}
            className="text-xs text-white/60 hover:text-white hover:underline font-bold"
          >
            Sair
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-900 text-xs font-medium flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Olá, <strong>{userData?.nome}</strong>. Sua conta foi cadastrada com uma senha provisória. Por segurança, você deve definir sua senha pessoal antes de acessar o sistema.
            </span>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3.5 rounded-xl text-xs border border-red-100 font-bold">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Senha Provisória Atual
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                required
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Informe a senha fornecida pelo administrador"
                className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3 rounded-xl focus:border-crb-blue outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Nova Senha (Mínimo 6 caracteres)
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                required
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite sua nova senha pessoal"
                className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3 rounded-xl focus:border-crb-blue outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                required
                type="password"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                placeholder="Repita a nova senha pessoal"
                className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3 rounded-xl focus:border-crb-blue outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-crb-navy text-white font-bold py-3.5 px-4 rounded-xl hover:bg-crb-navy-dark transition-all shadow-md shadow-crb-navy/20 disabled:opacity-50 text-sm mt-4 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Cadastrar Nova Senha e Acessar</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
