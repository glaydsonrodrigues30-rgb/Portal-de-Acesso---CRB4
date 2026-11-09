import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { 
  UserCheck, 
  Mail, 
  Key, 
  Shield, 
  Lock, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  Send,
  HelpCircle
} from 'lucide-react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';

export default function MeuCadastro() {
  const { userData, currentUser, updateRealEmail, updateUserPassword, reloadUserData } = useAuth();
  
  // Nome
  const [nome, setNome] = useState(userData?.nome || '');
  const [savingNome, setSavingNome] = useState(false);
  const [nomeSuccess, setNomeSuccess] = useState(false);

  // E-mail real
  const [novoEmail, setNovoEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);

  // Troca de Senha
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);
  const [senhaSuccessMsg, setSenhaSuccessMsg] = useState<string | null>(null);
  const [senhaErrorMsg, setSenhaErrorMsg] = useState<string | null>(null);

  const isEmailProvisorio = userData?.email?.endsWith('@crb4.local');

  const handleSaveNome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !userData?.id) return;

    setSavingNome(true);
    setNomeSuccess(false);
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        nome: nome.trim()
      });
      setNomeSuccess(true);
      await reloadUserData();
      setTimeout(() => setNomeSuccess(false), 3000);
    } catch (err: any) {
      alert('Erro ao atualizar nome: ' + (err.message || 'Erro inesperado'));
    } finally {
      setSavingNome(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailErrorMsg(null);
    setEmailSuccessMsg(null);

    if (!novoEmail.trim()) {
      setEmailErrorMsg('Por favor, informe seu endereço de e-mail institucional ou pessoal.');
      return;
    }

    setSavingEmail(true);
    try {
      await updateRealEmail(novoEmail.trim());
      setEmailSuccessMsg(
        `Link de confirmação enviado com sucesso para ${novoEmail.trim()}! Acesse sua caixa de entrada e confirme o link. Assim que confirmado, sua conta estará vinculada ao seu e-mail e você poderá recuperar a senha.`
      );
      setNovoEmail('');
    } catch (err: any) {
      setEmailErrorMsg(err.message || 'Erro ao enviar confirmação de e-mail.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSenhaErrorMsg(null);
    setSenhaSuccessMsg(null);

    if (novaSenha.length < 6) {
      setSenhaErrorMsg('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmaSenha) {
      setSenhaErrorMsg('A confirmação não coincide com a nova senha digitada.');
      return;
    }

    setSavingSenha(true);
    try {
      await updateUserPassword(novaSenha, senhaAtual);
      setSenhaSuccessMsg('Sua senha foi alterada com sucesso!');
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmaSenha('');
      setTimeout(() => setSenhaSuccessMsg(null), 4000);
    } catch (err: any) {
      setSenhaErrorMsg(err.message || 'Erro ao alterar a senha.');
    } finally {
      setSavingSenha(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Meu Cadastro</h2>
          <p className="text-slate-500 font-medium">
            Gerencie seus dados de identificação, e-mail institucional e credenciais de segurança.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna 1 & 2: Identificação e E-mail */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card Identificação */}
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-crb-navy/5 text-crb-navy flex items-center justify-center font-bold">
                <UserCheck size={20} />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-crb-navy">Dados de Acesso</h3>
                <p className="text-xs text-slate-400">Informações da sua conta no sistema CRB-4</p>
              </div>
            </div>

            <form onSubmit={handleSaveNome} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Nome Completo
                  </label>
                  <input 
                    required
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 px-3.5 rounded-xl focus:border-crb-purple outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Nome de Usuário (Login)
                  </label>
                  <div className="relative">
                    <input 
                      disabled
                      type="text"
                      value={userData?.username || ''}
                      className="w-full bg-slate-100 border border-slate-200 text-slate-500 text-sm font-mono font-bold py-2.5 px-3.5 rounded-xl cursor-not-allowed"
                    />
                    <Lock size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Perfil:</span>
                  <span className="px-3 py-1 bg-crb-navy text-white text-[11px] font-bold rounded-lg uppercase tracking-wider">
                    {userData?.perfil === 'ADMIN' ? 'Administrador Geral' : userData?.perfil === 'OPERACIONAL' ? 'Agente Operacional' : 'Visualizador'}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={savingNome || nome === userData?.nome}
                  className="flex items-center gap-2 bg-crb-navy text-white font-bold py-2 px-5 rounded-xl text-xs hover:bg-crb-navy-dark transition-all disabled:opacity-40 cursor-pointer"
                >
                  <Save size={14} />
                  <span>{savingNome ? 'Salvando...' : 'Salvar Nome'}</span>
                </button>
              </div>

              {nomeSuccess && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center gap-2 font-bold">
                  <CheckCircle2 size={16} />
                  Nome atualizado com sucesso!
                </div>
              )}
            </form>
          </div>

          {/* Card E-mail Real e Recuperação */}
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-crb-blue flex items-center justify-center font-bold border border-blue-100">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-crb-navy">E-mail para Recuperação de Senha</h3>
                <p className="text-xs text-slate-400">Vinculação de endereço de e-mail verificado</p>
              </div>
            </div>

            {/* Status atual do e-mail */}
            {isEmailProvisorio ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 text-xs font-medium space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
                  <AlertCircle size={18} className="text-amber-700 shrink-0" />
                  E-mail Provisório ({userData?.email})
                </div>
                <p className="leading-relaxed">
                  Sua conta atualmente usa um e-mail interno provisório. Para que você possa utilizar a funcionalidade de <strong>"Esqueci minha senha"</strong> na tela de login, informe seu e-mail real abaixo.
                </p>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 text-xs font-medium space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                  <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
                  E-mail Vinculado: {userData?.email}
                </div>
                <p className="leading-relaxed text-emerald-700">
                  Seu e-mail está habilitado para redefinição segura de senha. Caso deseje alterá-lo, informe o novo endereço abaixo.
                </p>
              </div>
            )}

            <form onSubmit={handleUpdateEmail} className="space-y-4">
              {emailErrorMsg && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs border border-red-100 font-bold">
                  {emailErrorMsg}
                </div>
              )}

              {emailSuccessMsg && (
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs border border-emerald-200 font-medium leading-relaxed flex items-start gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>{emailSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isEmailProvisorio ? 'Cadastrar E-mail Real' : 'Atualizar Endereço de E-mail'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type="email"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    placeholder="ex: seu.nome@crb4.org.br ou seu@email.com"
                    className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3.5 rounded-xl focus:border-crb-purple outline-none transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  Enviaremos um link de confirmação do Firebase. Ao clicar no link, seu e-mail será ativado automaticamente.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingEmail || !novoEmail.trim()}
                  className="flex items-center gap-2 bg-crb-purple text-white font-bold py-2.5 px-6 rounded-xl text-xs hover:bg-crb-purple-light transition-all shadow-md shadow-crb-purple/20 disabled:opacity-40 cursor-pointer"
                >
                  <Send size={14} />
                  <span>{savingEmail ? 'Enviando...' : 'Salvar e Enviar Link de Confirmação'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Coluna 3: Alteração de Senha */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-crb-purple flex items-center justify-center font-bold border border-purple-100">
                <Key size={20} />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-crb-navy">Alterar Senha</h3>
                <p className="text-xs text-slate-400">Defina uma nova senha forte</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {senhaErrorMsg && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs border border-red-100 font-bold">
                  {senhaErrorMsg}
                </div>
              )}

              {senhaSuccessMsg && (
                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-xs border border-emerald-200 font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  {senhaSuccessMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Senha Atual
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type="password"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    placeholder="Sua senha atual"
                    className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3.5 rounded-xl focus:border-crb-purple outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Nova Senha (mín. 6 caracteres)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Nova senha pessoal"
                    className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3.5 rounded-xl focus:border-crb-purple outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    required
                    type="password"
                    value={confirmaSenha}
                    onChange={(e) => setConfirmaSenha(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full bg-slate-50 border border-slate-200 text-crb-navy text-sm font-medium py-2.5 pl-10 pr-3.5 rounded-xl focus:border-crb-purple outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSenha}
                className="w-full flex items-center justify-center gap-2 bg-crb-navy text-white font-bold py-3 px-4 rounded-xl text-xs hover:bg-crb-navy-dark transition-all shadow-md shadow-crb-navy/20 disabled:opacity-40 cursor-pointer mt-2"
              >
                <Key size={14} />
                <span>{savingSenha ? 'Atualizando...' : 'Atualizar Minha Senha'}</span>
              </button>
            </form>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-xs text-slate-500 space-y-3 font-medium">
            <div className="flex items-center gap-2 font-bold text-crb-navy text-sm">
              <HelpCircle size={16} className="text-crb-purple" />
              Segurança e Recuperação
            </div>
            <p className="leading-relaxed">
              O sistema CRB-4 opera sob a infraestrutura do Firebase Authentication. Mantenha seu e-mail sempre atualizado para garantir o recebimento de links de redefinição de acesso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
