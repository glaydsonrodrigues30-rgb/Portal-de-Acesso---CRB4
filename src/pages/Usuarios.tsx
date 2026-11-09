import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, UserProfile, UserStatus } from '@/src/types';
import { 
  UserPlus, 
  Mail, 
  Shield, 
  UserCheck, 
  UserX, 
  Search,
  Key,
  X,
  Save,
  Lock,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth, normalizeUsername } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import firebaseConfig from '@/firebase-applet-config.json';

export default function Usuarios() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Novo / Editar Usuário
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [senhaProvisoria, setSenhaProvisoria] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Modal Redefinir Senha (para usuários sem e-mail ou com e-mail interno)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [novaSenhaProvisoria, setNovaSenhaProvisoria] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  if (!isAdmin) return <div className="p-8 text-center text-slate-500 font-bold">Acesso restrito a administradores.</div>;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as User[]);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  /**
   * (2) CADASTRO DE USUÁRIO:
   * Pede nome completo, nome de usuário, perfil e senha provisória, SEM exigir e-mail.
   * Cria conta com e-mail interno usuario@crb4.local usando segunda instância do Firebase App.
   * Grava users/{uid} e usernames/{usuario} com precisaTrocarSenha=true.
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser?.nome || !editingUser?.username) return;

    const cleanUsername = normalizeUsername(editingUser.username);
    if (!cleanUsername) {
      alert('Nome de usuário inválido.');
      return;
    }

    setSavingUser(true);
    try {
      // 1. Edição de usuário existente (apenas altera dados no Firestore)
      if (editingUser.id) {
        await updateDoc(doc(db, 'users', editingUser.id), {
          nome: editingUser.nome.trim(),
          perfil: editingUser.perfil || 'VISUALIZADOR',
          status: editingUser.status || 'ATIVO'
        });
        await fetchUsers();
        setIsModalOpen(false);
        setEditingUser(null);
        return;
      }

      // 2. Criação de NOVO usuário
      if (!senhaProvisoria || senhaProvisoria.length < 6) {
        alert('A senha provisória deve possuir no mínimo 6 caracteres.');
        setSavingUser(false);
        return;
      }

      // Verifica se username já existe na coleção usernames
      const uSnap = await getDoc(doc(db, 'usernames', cleanUsername));
      if (uSnap.exists()) {
        alert(`O nome de usuário "${cleanUsername}" já está em uso.`);
        setSavingUser(false);
        return;
      }

      // Define e-mail: se informado usa o real, se não usa o interno usuario@crb4.local
      const internalEmail = editingUser.email?.trim() 
        ? editingUser.email.trim().toLowerCase() 
        : `${cleanUsername}@crb4.local`;

      // Cria a conta no Firebase Auth usando uma SEGUNDA instância para não deslogar o admin
      const secAppName = `SecAdminCreate_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const secondaryApp = initializeApp(firebaseConfig, secAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      let createdUid = '';
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, internalEmail, senhaProvisoria);
        createdUid = cred.user.uid;
        await secondarySignOut(secondaryAuth);
      } catch (authErr: any) {
        console.error("Erro ao criar usuário no Firebase Auth:", authErr);
        if (authErr.code === 'auth/email-already-in-use') {
          // Se o email já estiver em uso, tenta criar com sufixo único
          const altEmail = `${cleanUsername}_${Date.now()}@crb4.local`;
          const cred = await createUserWithEmailAndPassword(secondaryAuth, altEmail, senhaProvisoria);
          createdUid = cred.user.uid;
          await secondarySignOut(secondaryAuth);
        } else {
          throw authErr;
        }
      } finally {
        await deleteApp(secondaryApp);
      }

      // Grava users/{uid}
      const newUserDoc: User = {
        id: createdUid,
        nome: editingUser.nome.trim(),
        username: cleanUsername,
        email: internalEmail,
        perfil: editingUser.perfil || 'VISUALIZADOR',
        status: editingUser.status || 'ATIVO',
        precisaTrocarSenha: true,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', createdUid), newUserDoc);

      // Grava usernames/{usuario}
      await setDoc(doc(db, 'usernames', cleanUsername), {
        username: cleanUsername,
        email: internalEmail,
        uid: createdUid,
        updatedAt: new Date().toISOString()
      });

      await fetchUsers();
      setIsModalOpen(false);
      setEditingUser(null);
      setSenhaProvisoria('');
      alert(`Usuário "${cleanUsername}" cadastrado com sucesso! Acesso liberado com a senha provisória.`);
    } catch (err: any) {
      console.error("Erro ao cadastrar usuário:", err);
      alert('Erro ao salvar usuário: ' + (err.message || 'Erro desconhecido.'));
    } finally {
      setSavingUser(false);
    }
  };

  /**
   * (2) REDEFINIÇÃO DE SENHA PARA USUÁRIOS SEM E-MAIL REAL:
   * Recria a credencial de acesso com nova senha provisória mantendo perfil e dados
   */
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToReset) return;
    setResetFeedback(null);

    if (novaSenhaProvisoria.length < 6) {
      setResetFeedback({ type: 'error', msg: 'A nova senha provisória deve ter no mínimo 6 caracteres.' });
      return;
    }

    if (novaSenhaProvisoria !== confirmarNovaSenha) {
      setResetFeedback({ type: 'error', msg: 'A confirmação de senha não confere.' });
      return;
    }

    setResettingPassword(true);
    try {
      const cleanUsername = normalizeUsername(userToReset.username);
      const newAuthEmail = `${cleanUsername}_rst${Date.now()}@crb4.local`;

      // Cria a nova credencial com a nova senha provisória na segunda instância
      const secAppName = `SecAdminReset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const secondaryApp = initializeApp(firebaseConfig, secAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      let newUid = '';
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, newAuthEmail, novaSenhaProvisoria);
        newUid = cred.user.uid;
        await secondarySignOut(secondaryAuth);
      } finally {
        await deleteApp(secondaryApp);
      }

      // Atualiza o mapeamento usernames/{usuario} para apontar para a nova conta
      await setDoc(doc(db, 'usernames', cleanUsername), {
        username: cleanUsername,
        email: newAuthEmail,
        uid: newUid,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Atualiza / cria users/{newUid} com os dados existentes e precisaTrocarSenha=true
      const updatedUserDoc: User = {
        ...userToReset,
        id: newUid,
        email: newAuthEmail,
        precisaTrocarSenha: true,
        createdAt: userToReset.createdAt || new Date().toISOString()
      };
      await setDoc(doc(db, 'users', newUid), updatedUserDoc);

      setResetFeedback({
        type: 'success',
        msg: `Nova senha provisória definida com sucesso para @${cleanUsername}! O usuário continuará fazendo login com seu nome de usuário e será solicitado a cadastrar sua senha pessoal no próximo acesso.`
      });

      await fetchUsers();
      setNovaSenhaProvisoria('');
      setConfirmarNovaSenha('');
      setTimeout(() => {
        setIsResetModalOpen(false);
        setUserToReset(null);
        setResetFeedback(null);
      }, 4000);
    } catch (err: any) {
      console.error("Erro ao redefinir senha do usuário:", err);
      setResetFeedback({ type: 'error', msg: err.message || 'Erro ao redefinir senha provisória.' });
    } finally {
      setResettingPassword(false);
    }
  };

  const toggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    try {
      await updateDoc(doc(db, 'users', user.id), { status: newStatus });
      setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const changeProfile = async (id: string, perfil: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', id), { perfil });
      setUsers(users.map(u => u.id === id ? { ...u, perfil } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  };

  const filteredUsers = users.filter(u => 
    u.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Controle de Usuários</h2>
          <p className="text-slate-500 font-medium">Controle de privilégios, cadastro por nome de usuário e gestão de senhas provisórias.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 pl-12 pr-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all font-medium text-sm"
            />
          </div>
          <button 
            onClick={() => { 
              setEditingUser({}); 
              setSenhaProvisoria(''); 
              setIsModalOpen(true); 
            }}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm cursor-pointer"
          >
            <UserPlus size={20} className="text-white" />
            Novo Usuário
          </button>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-crb-navy-dark px-8">
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Identificação</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Nível de Acesso</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Situação da Conta</th>
                <th className="px-8 py-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] text-right">Ações Administrativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">
                    Consultando diretório de usuários...
                  </td>
                </tr>
              ) : filteredUsers.map(user => {
                const isInternal = user.email?.endsWith('@crb4.local');
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-crb-navy/5 flex items-center justify-center text-crb-navy font-bold text-lg border border-crb-navy/10 group-hover:bg-crb-purple group-hover:text-white transition-colors">
                          {user.nome?.charAt(0) || 'U'}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-crb-navy uppercase tracking-tight">{user.nome}</span>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <span className="text-[10px] text-slate-600 font-mono font-bold flex items-center gap-1.5 uppercase tracking-wider">
                              <Key size={10} className="text-crb-purple" /> @{user.username}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                              <Mail size={10} className="text-slate-300" />
                              {isInternal ? (
                                <span className="text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-mono text-[9px] font-bold">
                                  interno (sem e-mail real)
                                </span>
                              ) : (
                                user.email
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-slate-300" />
                        <select 
                          value={user.perfil}
                          onChange={(e) => changeProfile(user.id, e.target.value as UserProfile)}
                          className="bg-slate-50 border-none text-xs font-bold text-crb-navy focus:ring-0 cursor-pointer hover:bg-crb-purple/10 px-3 py-1.5 rounded-xl transition-colors uppercase tracking-wider"
                        >
                          <option value="ADMIN">Administrador Geral</option>
                          <option value="OPERACIONAL">Agente Operacional</option>
                          <option value="VISUALIZADOR">Visualizador</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <button 
                        onClick={() => toggleStatus(user)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border shadow-sm cursor-pointer",
                          user.status === 'ATIVO' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-600 hover:text-white" 
                            : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-200 hover:text-slate-600"
                        )}
                      >
                        {user.status === 'ATIVO' ? (
                          <>
                            <UserCheck size={14} /> Conta Ativa
                          </>
                        ) : (
                          <>
                            <UserX size={14} /> Conta Inativa
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => {
                            setUserToReset(user);
                            setNovaSenhaProvisoria('');
                            setConfirmarNovaSenha('');
                            setResetFeedback(null);
                            setIsResetModalOpen(true);
                          }}
                          className="p-2.5 text-amber-600 hover:text-white hover:bg-amber-600 rounded-xl transition-all border border-amber-200 bg-amber-50 shadow-xs cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                          title="Redefinir Senha Provisória"
                        >
                          <Key size={14} />
                          <span className="hidden sm:inline">Redefinir Senha</span>
                        </button>
                        <button 
                          onClick={() => { 
                            setEditingUser(user); 
                            setSenhaProvisoria(''); 
                            setIsModalOpen(true); 
                          }}
                          className="p-2.5 text-slate-500 hover:text-white hover:bg-crb-navy rounded-xl transition-all border border-slate-200 bg-slate-50 shadow-xs cursor-pointer"
                          title="Editar Dados do Usuário"
                        >
                          <Shield size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro / Edição */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="bg-crb-navy p-6 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-crb-purple rounded-xl">
                    <UserPlus size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-serif font-bold">
                      {editingUser?.id ? 'Editar Cadastro de Usuário' : 'Novo Usuário do Sistema'}
                    </h3>
                    <p className="text-[11px] text-white/60">
                      {editingUser?.id ? 'Atualize as informações cadastrais' : 'Cadastro simplificado por nome de usuário'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={22} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 md:p-8 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                    Nome Completo *
                  </label>
                  <input 
                    required
                    type="text"
                    value={editingUser?.nome || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, nome: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 py-2.5 px-3.5 rounded-xl focus:border-crb-purple outline-none transition-all font-medium text-sm"
                    placeholder="Ex: Maria Oliveira Silva"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                      Nome de Usuário (Login) *
                    </label>
                    <input 
                      required
                      disabled={Boolean(editingUser?.id)}
                      type="text"
                      value={editingUser?.username || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-2.5 px-3.5 rounded-xl focus:border-crb-purple outline-none transition-all font-mono font-bold text-sm disabled:opacity-50"
                      placeholder="ex: maria.silva"
                    />
                    <span className="text-[10px] text-slate-400 font-medium">Será normalizado em minúsculas sem espaços</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                      E-mail (Opcional)
                    </label>
                    <input 
                      disabled={Boolean(editingUser?.id)}
                      type="email"
                      value={editingUser?.email || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-2.5 px-3.5 rounded-xl focus:border-crb-purple outline-none transition-all font-medium text-sm disabled:opacity-50"
                      placeholder="padrao: usuario@crb4.local"
                    />
                    <span className="text-[10px] text-slate-400 font-medium">Se vazio, gera e-mail interno automático</span>
                  </div>
                </div>

                {!editingUser?.id && (
                  <div className="space-y-1.5 bg-purple-50/60 border border-purple-100 p-4 rounded-2xl">
                    <label className="text-[11px] font-bold text-crb-purple uppercase tracking-widest block">
                      Senha Provisória * (Mínimo 6 caracteres)
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400" size={16} />
                      <input 
                        required
                        type="text"
                        value={senhaProvisoria}
                        onChange={(e) => setSenhaProvisoria(e.target.value)}
                        className="w-full bg-white border border-purple-200 py-2.5 pl-10 pr-3.5 rounded-xl focus:border-crb-purple outline-none transition-all font-medium text-sm"
                        placeholder="Ex: Crb4@2026"
                      />
                    </div>
                    <p className="text-[10px] text-purple-900 font-medium mt-1">
                      O usuário será obrigado a alterar esta senha para sua senha pessoal no primeiro acesso.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Perfil</label>
                    <select 
                      value={editingUser?.perfil || 'VISUALIZADOR'}
                      onChange={(e) => setEditingUser({ ...editingUser, perfil: e.target.value as UserProfile })}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-2.5 px-3.5 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-xs uppercase"
                    >
                      <option value="ADMIN">Administrador</option>
                      <option value="OPERACIONAL">Operacional</option>
                      <option value="VISUALIZADOR">Visualizador</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Status</label>
                    <select 
                      value={editingUser?.status || 'ATIVO'}
                      onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as UserStatus })}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-2.5 px-3.5 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-xs uppercase"
                    >
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-3 border-2 border-slate-100 text-slate-400 font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={savingUser}
                    className="flex-1 flex items-center justify-center gap-2 bg-crb-navy text-white px-4 py-3 rounded-xl hover:bg-crb-navy-dark transition-all shadow-md shadow-crb-navy/20 font-bold uppercase tracking-widest text-xs cursor-pointer disabled:opacity-50"
                  >
                    <Save size={16} />
                    <span>{savingUser ? 'Gravando...' : 'Salvar Usuário'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Redefinir Senha do Usuário */}
      <AnimatePresence>
        {isResetModalOpen && userToReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="bg-amber-600 p-6 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-700/60 rounded-xl">
                    <Key size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-serif font-bold">Redefinir Senha Provisória</h3>
                    <p className="text-[11px] text-amber-100 font-medium">Usuário: @{userToReset.username}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsResetModalOpen(false)} 
                  className="text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={22} />
                </button>
              </div>

              <form onSubmit={handleResetPasswordSubmit} className="p-6 md:p-8 space-y-5">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 text-xs font-medium space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
                    <HelpCircle size={18} className="text-amber-700 shrink-0" />
                    Como funciona esta redefinição
                  </div>
                  <p className="leading-relaxed">
                    No plano gratuito do Firebase (Spark), não há envio de e-mails para domínios internos (como @crb4.local). 
                    O administrador define uma nova senha provisória aqui. O acesso é recriado mantendo o perfil, nome e permissões. 
                    No próximo login, o usuário será <strong>forçado a trocar para sua nova senha pessoal</strong>.
                  </p>
                </div>

                {resetFeedback && (
                  <div className={cn(
                    "p-3.5 rounded-xl text-xs font-bold leading-relaxed",
                    resetFeedback.type === 'success' 
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-100"
                  )}>
                    {resetFeedback.msg}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                    Nova Senha Provisória (Mínimo 6 caracteres)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required
                      type="text"
                      value={novaSenhaProvisoria}
                      onChange={(e) => setNovaSenhaProvisoria(e.target.value)}
                      placeholder="Ex: Provisoria@2026"
                      className="w-full bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-3.5 rounded-xl focus:border-amber-500 outline-none transition-all font-medium text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                    Confirmar Nova Senha Provisória
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required
                      type="text"
                      value={confirmarNovaSenha}
                      onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                      placeholder="Repita a senha provisória"
                      className="w-full bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-3.5 rounded-xl focus:border-amber-500 outline-none transition-all font-medium text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button 
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="flex-1 px-4 py-3 border-2 border-slate-100 text-slate-400 font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={resettingPassword}
                    className="flex-1 flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-3 rounded-xl hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20 font-bold uppercase tracking-widest text-xs cursor-pointer disabled:opacity-50"
                  >
                    {resettingPassword ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Key size={16} />
                    )}
                    <span>{resettingPassword ? 'Atualizando...' : 'Definir Senha'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
