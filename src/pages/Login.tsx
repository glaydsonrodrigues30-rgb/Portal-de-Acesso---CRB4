import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { ShieldCheck, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login, userData, currentUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    if (currentUser && userData?.status === 'ATIVO') {
      navigate('/');
    }
  }, [currentUser, userData, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }
    try {
      setError(null);
      setIsAuthenticating(true);
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Usuário ou senha incorretos.');
      console.error(err);
      setIsAuthenticating(false);
    }
  };

  if (currentUser && userData?.status === 'INATIVO') {
    // ... (rest of the blocked screen remains same)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-200 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-crb-purple"></div>
          <div className="w-20 h-20 bg-blue-50 text-crb-blue rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner border border-blue-100 rotate-3">
            <ShieldCheck size={40} />
          </div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy mb-4">Acesso Restrito</h2>
          <p className="text-slate-500 mb-8 leading-relaxed font-medium">
            Sua conta (<span className="text-crb-navy font-bold">{currentUser.username || currentUser.email}</span>) está pendente de homologação. Contate o suporte administrativo para ativação imediata.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-crb-navy text-white font-bold py-4 rounded-2xl hover:bg-crb-navy-dark transition-all shadow-lg shadow-crb-navy/20 active:scale-95"
          >
            Verificar Novamente
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-6 md:p-12 font-sans">
      <div className="max-w-2xl w-full flex flex-col items-center">
        {/* Logo Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center mb-10 text-center"
        >
          <img 
            src="https://i.postimg.cc/CLwGjkqN/logo.png" 
            alt="Logo CRB-4" 
            className="w-40 md:w-56 h-auto mb-6 object-contain drop-shadow-sm" 
          />
          <h1 className="text-4xl md:text-5xl font-serif font-black text-crb-navy tracking-tighter leading-tight">
            CRB-4<br />
            <span className="text-2xl md:text-3xl block mt-1 font-bold text-slate-400">Portal de Acesso</span>
          </h1>
          <p className="text-sm md:text-base text-slate-500 font-bold mt-4 uppercase tracking-[0.2em] opacity-70">
            Conselho Regional de Biblioteconomia - 4ª Região
          </p>
        </motion.div>

        {/* Login Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-md bg-white p-10 md:p-12 rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100"
        >
          <p className="text-slate-400 mb-10 font-bold text-center text-sm uppercase tracking-widest">
            Autenticação Segura
          </p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 text-sm border border-red-100 font-bold flex items-center gap-3 shadow-sm"
              >
                <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse"></div>
                {error}
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Usuário</label>
              <input 
                required
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 text-crb-navy font-medium py-3.5 px-6 rounded-2xl focus:border-crb-blue outline-none transition-all"
                placeholder="Seu usuário"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Senha</label>
              <input 
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 text-crb-navy font-medium py-3.5 px-6 rounded-2xl focus:border-crb-blue outline-none transition-all"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full flex items-center justify-center gap-4 bg-crb-navy text-white font-bold py-4 px-6 rounded-2xl hover:bg-crb-navy-dark transition-all shadow-lg shadow-crb-navy/20 active:scale-[0.98] disabled:opacity-50 mt-8 group"
            >
              {isAuthenticating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <LogIn size={20} className="text-white group-hover:translate-x-1 transition-transform" />
              )}
              {isAuthenticating ? 'Autenticando...' : 'Acessar Sistema'}
            </button>
          </form>

          <div className="mt-16 pt-10 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-4">
              Conselho Regional de Biblioteconomia - 4ª Região
            </p>
            <p className="text-[10px] text-slate-300 font-medium">
              Acesso monitorado. O uso não autorizado está sujeito a penalidades administrativas e legais.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
