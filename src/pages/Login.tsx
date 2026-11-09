import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { ShieldCheck, LogIn, User, Key, ArrowRight, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login, resetPassword, userData, currentUser } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Modal "Esqueci minha senha"
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser && userData?.status === 'ATIVO') {
      navigate('/');
    }
  }, [currentUser, userData, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Por favor, informe seu usuário ou e-mail e sua senha.');
      return;
    }
    try {
      setError(null);
      setIsAuthenticating(true);
      await login(identifier, password);
    } catch (err: any) {
      setError(err.message || 'Usuário/e-mail ou senha incorretos.');
      setIsAuthenticating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier) {
      setResetError('Por favor, informe seu usuário ou e-mail cadastrado.');
      return;
    }
    try {
      setResetLoading(true);
      setResetError(null);
      const res = await resetPassword(resetIdentifier);
      if (res.isInternal) {
        setResetError('Nenhum e-mail cadastrado. Procure o administrador para redefinir sua senha.');
      } else if (res.sent) {
        setResetSuccess(true);
      }
    } catch (err: any) {
      setResetError(err.message || 'Erro ao processar solicitação de recuperação.');
    } finally {
      setResetLoading(false);
    }
  };

  if (currentUser && userData?.status === 'INATIVO') {
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
            Sua conta (<span className="text-crb-navy font-bold">{currentUser.username || currentUser.email}</span>) está inativa ou pendente de homologação. Contate a administração do CRB-4.
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
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-6 md:p-12 font-sans relative">
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
                <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse shrink-0"></div>
                <span>{error}</span>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                Usuário ou E-mail
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 text-crb-navy font-medium py-3.5 pl-12 pr-6 rounded-2xl focus:border-crb-blue outline-none transition-all placeholder:text-slate-400 text-sm"
                  placeholder="usuario ou nome@crb4.org.br"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Senha</label>
                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(identifier);
                    setResetSuccess(false);
                    setResetError(null);
                    setIsResetOpen(true);
                  }}
                  className="text-xs font-bold text-crb-blue hover:text-crb-navy transition-colors focus:outline-none cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 text-crb-navy font-medium py-3.5 pl-12 pr-6 rounded-2xl focus:border-crb-blue outline-none transition-all text-sm"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full flex items-center justify-center gap-4 bg-crb-navy text-white font-bold py-4 px-6 rounded-2xl hover:bg-crb-navy-dark transition-all shadow-lg shadow-crb-navy/20 active:scale-[0.98] disabled:opacity-50 mt-8 group cursor-pointer"
            >
              {isAuthenticating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <LogIn size={20} className="text-white group-hover:translate-x-1 transition-transform" />
              )}
              {isAuthenticating ? 'Autenticando...' : 'Acessar Sistema'}
            </button>
          </form>

          <div className="mt-14 pt-8 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-2">
              Conselho Regional de Biblioteconomia - 4ª Região
            </p>
            <p className="text-[10px] text-slate-400 font-medium">
              Acesso restrito. Digite seu nome de usuário ou e-mail institucional para acessar.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Modal Esqueci minha Senha */}
      <AnimatePresence>
        {isResetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 relative"
            >
              <button 
                onClick={() => setIsResetOpen(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>

              <div className="w-12 h-12 bg-blue-50 text-crb-blue rounded-2xl flex items-center justify-center mb-6 border border-blue-100">
                <Key size={24} />
              </div>

              <h3 className="text-2xl font-serif font-bold text-crb-navy mb-2">Recuperar Senha</h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">
                Informe o seu nome de usuário ou e-mail institucional. Se você possui e-mail cadastrado, enviaremos um link seguro de recuperação.
              </p>

              {resetSuccess ? (
                <div className="space-y-6">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-emerald-800 flex items-start gap-3">
                    <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-bold mb-1">Link de redefinição enviado!</p>
                      <p className="text-emerald-700 leading-relaxed">
                        Verifique a caixa de entrada (e a pasta de spam) do seu e-mail cadastrado e siga o link para definir sua nova senha.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsResetOpen(false)}
                    className="w-full bg-crb-navy text-white font-bold py-3.5 px-6 rounded-2xl hover:bg-crb-navy-dark transition-all cursor-pointer"
                  >
                    Voltar ao Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {resetError && (
                    <div className="bg-amber-50 text-amber-900 p-4 rounded-xl text-xs border border-amber-200 font-bold flex items-start gap-2.5">
                      <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{resetError}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Usuário ou E-mail
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        required
                        type="text"
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 text-crb-navy font-medium py-3 pl-12 pr-4 rounded-2xl focus:border-crb-blue outline-none transition-all placeholder:text-slate-400 text-sm"
                        placeholder="seu.usuario ou seu@email.com"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsResetOpen(false)}
                      className="w-1/3 bg-slate-100 text-slate-600 font-bold py-3.5 rounded-2xl hover:bg-slate-200 transition-colors text-sm cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-2/3 bg-crb-navy text-white font-bold py-3.5 rounded-2xl hover:bg-crb-navy-dark transition-all flex items-center justify-center gap-2 text-sm shadow-md shadow-crb-navy/20 disabled:opacity-50 cursor-pointer"
                    >
                      {resetLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <span>Continuar</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
