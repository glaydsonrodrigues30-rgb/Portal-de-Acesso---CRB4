import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, where, limit } from 'firebase/firestore';
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
  Save
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Usuarios() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [password, setPassword] = useState('');

  if (!isAdmin) return <div className="p-8 text-center text-slate-500">Acesso negado.</div>;

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser?.email || !editingUser?.username || !editingUser?.nome || (!editingUser?.id && !password)) return;

    const username = editingUser.username.trim();
    
    // Check for duplicate username (if new user)
    if (!editingUser.id) {
      const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        alert('Este nome de usuário já está em uso.');
        return;
      }
    }

    const userId = editingUser.id || `user_${Date.now()}`;
    const newUser: User = {
      id: userId,
      nome: editingUser.nome!,
      username: username,
      email: editingUser.email.toLowerCase().trim(),
      perfil: editingUser.perfil || 'VISUALIZADOR',
      status: editingUser.status || 'ATIVO',
      createdAt: editingUser.createdAt || new Date().toISOString(),
    };

    if (password) {
      newUser.password = password;
    }

    try {
      await setDoc(doc(db, 'users', userId), newUser, { merge: true });
      await fetchUsers();
      setIsModalOpen(false);
      setEditingUser(null);
      setPassword('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
    }
  };

  const toggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    try {
      await setDoc(doc(db, 'users', user.id), { status: newStatus }, { merge: true });
      setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const changeProfile = async (id: string, perfil: UserProfile) => {
    try {
      await setDoc(doc(db, 'users', id), { perfil }, { merge: true });
      setUsers(users.map(u => u.id === id ? { ...u, perfil } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  };

  const filteredUsers = users.filter(u => 
    u.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-crb-purple pl-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-crb-navy">Controle de Usuários</h2>
          <p className="text-slate-500 font-medium">Controle de privilégios, perfis de acesso e auditoria de usuários do sistema.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-crb-navy transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 pl-12 pr-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-crb-purple focus:border-crb-navy outline-none transition-all font-medium"
            />
          </div>
          <button 
            onClick={() => { setEditingUser({}); setPassword(''); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-crb-purple text-white px-6 py-3 rounded-2xl hover:bg-crb-purple-light transition-all shadow-lg shadow-crb-purple/20 font-bold text-sm"
          >
            <UserPlus size={20} className="text-white" />
            Novo Usuário
          </button>
        </div>
      </div>

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
                <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Consultando diretório de usuários...</td></tr>
              ) : filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-crb-navy/5 flex items-center justify-center text-crb-navy font-bold text-lg border border-crb-navy/10 group-hover:bg-crb-purple group-hover:text-white transition-colors">
                        {user.nome.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-crb-navy uppercase tracking-tight">{user.nome}</span>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                            <Key size={10} className="text-crb-purple" /> {user.username}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                            <Mail size={10} className="text-slate-300" /> {user.email}
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
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border shadow-sm",
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
                        onClick={() => { setEditingUser(user); setPassword(''); setIsModalOpen(true); }}
                        className="p-3 text-slate-300 hover:text-white hover:bg-crb-navy rounded-2xl transition-all border border-transparent shadow-sm"
                        title="Editar Usuário"
                      >
                        <Shield size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Usuário */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-crb-navy/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="bg-crb-navy p-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-crb-purple rounded-xl">
                    <UserPlus size={24} className="text-white" />
                  </div>
                  <h3 className="text-xl font-serif font-bold text-white">
                    {editingUser?.id ? 'Editar Usuário' : 'Novo Usuário Interno'}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                    <input 
                      required
                      type="text"
                      value={editingUser?.nome || ''}
                      onChange={(e) => setEditingUser({...editingUser, nome: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-medium"
                      placeholder="Ex: João Silva"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Usuário (Login)</label>
                      <input 
                        required
                        type="text"
                        value={editingUser?.username || ''}
                        onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-medium"
                        placeholder="Ex: glaydson"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail Institucional</label>
                      <input 
                        required
                        type="email"
                        value={editingUser?.email || ''}
                        onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-medium"
                        placeholder="email@crb4.org.br"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                      {editingUser?.id ? 'Nova Senha (deixe em branco para manter)' : 'Senha de Acesso'}
                    </label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        required={!editingUser?.id}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 pl-12 pr-4 rounded-xl focus:border-crb-purple outline-none transition-all font-medium"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Perfil</label>
                      <select 
                        value={editingUser?.perfil || 'VISUALIZADOR'}
                        onChange={(e) => setEditingUser({...editingUser, perfil: e.target.value as UserProfile})}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-xs uppercase"
                      >
                        <option value="ADMIN">Administrador</option>
                        <option value="OPERACIONAL">Operacional</option>
                        <option value="VISUALIZADOR">Visualizador</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Status</label>
                      <select 
                        value={editingUser?.status || 'ATIVO'}
                        onChange={(e) => setEditingUser({...editingUser, status: e.target.value as UserStatus})}
                        className="w-full bg-slate-50 border-2 border-slate-100 py-3 px-4 rounded-xl focus:border-crb-purple outline-none transition-all font-bold text-xs uppercase"
                      >
                        <option value="ATIVO">Ativo</option>
                        <option value="INATIVO">Inativo</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-slate-100 text-slate-400 font-bold rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-2 bg-crb-navy text-white px-6 py-4 rounded-2xl hover:bg-crb-navy-dark transition-all shadow-lg shadow-crb-navy/20 font-bold uppercase tracking-widest text-xs"
                  >
                    <Save size={18} className="text-white" />
                    Salvar Usuário
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="bg-crb-navy p-8 rounded-3xl border border-crb-navy shadow-lg relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
           <Shield size={120} className="text-white" />
        </div>
        <div className="flex items-start gap-6 relative z-10">
          <div className="w-14 h-14 bg-crb-purple text-white rounded-2xl flex items-center justify-center shrink-0 shadow-xl border border-white/10">
             <Shield size={28} />
          </div>
          <div>
            <h4 className="text-xl font-serif font-bold text-white mb-2">Protocolo de Gestão de Identidade</h4>
            <p className="text-white/60 text-sm font-medium leading-relaxed max-w-2xl">
              Este sistema utiliza autenticação interna restrita. O acesso é permitido apenas para usuários previamente cadastrados com credenciais institucionais.
              Administradores podem revogar acessos ou alterar perfis operacionais instantaneamente através deste painel de controle.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
