import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  verifyBeforeUpdateEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { collection, query, getDocs, getDoc, doc, where, limit, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { User } from '@/src/types';

export function normalizeUsername(val: string): string {
  return (val || '').trim().toLowerCase().replace(/\s+/g, '');
}

interface AuthContextType {
  currentUser: { username?: string; email: string; uid: string } | null;
  userData: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (identifierOrEmail: string) => Promise<{ sent: boolean; isInternal?: boolean }>;
  updateUserPassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  updateRealEmail: (newEmail: string) => Promise<void>;
  reloadUserData: () => Promise<void>;
  isAdmin: boolean;
  isOperacional: boolean;
  isVisualizador: boolean;
  isReady: boolean;
  precisaTrocarSenha: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<{ username?: string; email: string; uid: string } | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  // Recarregar dados do usuário (por exemplo, após troca de email ou senha)
  const reloadUserData = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    try {
      await fbUser.reload();
      const userDocRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data() as User;
        setUserData({ ...data, id: userSnap.id });
        setCurrentUser({ 
          username: data.username || data.nome, 
          email: fbUser.email || data.email, 
          uid: fbUser.uid 
        });

        // Se o email do Auth mudou (ex: após confirmação do link verifyBeforeUpdateEmail)
        if (fbUser.email && data.email !== fbUser.email) {
          await updateDoc(userDocRef, { email: fbUser.email });
          if (data.username) {
            const cleanUser = normalizeUsername(data.username);
            await setDoc(doc(db, 'usernames', cleanUser), {
              email: fbUser.email,
              uid: fbUser.uid
            });
          }
        }
      }
    } catch (e) {
      console.error("Erro ao recarregar dados do usuário:", e);
    }
  };

  useEffect(() => {
    let unsubscribeUserData: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = undefined;
      }

      if (fbUser && fbUser.email) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          let userSnap = await getDoc(userDocRef);

          // If document keyed by UID does not exist yet, lookup by registered email
          if (!userSnap.exists()) {
            const snapByEmail = await getDocs(
              query(collection(db, 'users'), where('email', '==', fbUser.email.toLowerCase()), limit(1))
            );

            if (!snapByEmail.empty) {
              const existingData = snapByEmail.docs[0].data() as User;
              const cleanUser = normalizeUsername(existingData.username || fbUser.email.split('@')[0]);
              const syncedUser: User = {
                ...existingData,
                id: fbUser.uid,
                email: fbUser.email.toLowerCase(),
                status: existingData.status || 'ATIVO',
                perfil: existingData.perfil || 'VISUALIZADOR',
                nome: existingData.nome || fbUser.displayName || 'Usuário',
                username: cleanUser,
                createdAt: existingData.createdAt || new Date().toISOString(),
                precisaTrocarSenha: existingData.precisaTrocarSenha || false
              };
              delete (syncedUser as any).password;

              await setDoc(userDocRef, syncedUser, { merge: true });
              userSnap = await getDoc(userDocRef);

              // Garante mapeamento usernames/{usuario}
              await setDoc(doc(db, 'usernames', cleanUser), {
                email: fbUser.email.toLowerCase(),
                uid: fbUser.uid
              });
            }
          }

          if (userSnap.exists()) {
            const data = userSnap.data() as User;
            if (data.status === 'ATIVO') {
              setUserData({ ...data, id: userSnap.id });
              setCurrentUser({ 
                username: data.username || data.nome, 
                email: fbUser.email || data.email, 
                uid: fbUser.uid 
              });

              // Sincronizar email caso auth.currentUser.email tenha sido alterado e confirmado
              if (fbUser.email && data.email !== fbUser.email) {
                await updateDoc(userDocRef, { email: fbUser.email });
                if (data.username) {
                  const cleanUser = normalizeUsername(data.username);
                  await setDoc(doc(db, 'usernames', cleanUser), {
                    email: fbUser.email,
                    uid: fbUser.uid
                  });
                }
              }

              // Realtime listener for profile updates
              unsubscribeUserData = onSnapshot(userDocRef, (snap) => {
                if (snap.exists()) {
                  const updatedData = snap.data() as User;
                  setUserData({ ...updatedData, id: snap.id });
                  if (updatedData.status === 'INATIVO') {
                    signOut(auth);
                  }
                }
              });
            } else {
              setUserData({ ...data, id: userSnap.id });
              setCurrentUser({ 
                username: data.username || data.nome, 
                email: fbUser.email || data.email, 
                uid: fbUser.uid 
              });
              await signOut(auth);
            }
          } else {
            setCurrentUser(null);
            setUserData(null);
            await signOut(auth);
          }
        } catch (error) {
          console.error("Erro ao sincronizar perfil do usuário:", error);
          setCurrentUser(null);
          setUserData(null);
        } finally {
          setLoading(false);
          setIsReady(true);
        }
      } else {
        setCurrentUser(null);
        setUserData(null);
        setLoading(false);
        setIsReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserData) unsubscribeUserData();
    };
  }, []);

  /**
   * (1) LOGIN POR USUÁRIO OU E-MAIL:
   * Se contiver @, usa diretamente como e-mail.
   * Se não contiver @, busca o e-mail em usernames/{usuario}.
   * Usuários sem e-mail real usam usuario@crb4.local.
   */
  const login = async (identifierInput: string, passwordInput: string) => {
    try {
      setLoading(true);
      const identifier = identifierInput.trim();
      const password = passwordInput.trim();

      if (!identifier || !password) {
        throw new Error('Por favor, informe seu usuário/e-mail e sua senha.');
      }

      let emailToAuth = '';
      let searchedUsername: string | null = null;

      if (identifier.includes('@')) {
        emailToAuth = identifier.toLowerCase();
      } else {
        searchedUsername = normalizeUsername(identifier);
        if (!searchedUsername) {
          throw new Error('Nome de usuário inválido.');
        }

        const usernameDocRef = doc(db, 'usernames', searchedUsername);
        const usernameSnap = await getDoc(usernameDocRef);

        if (!usernameSnap.exists()) {
          throw new Error('Nome de usuário não cadastrado. Verifique a digitação ou contate o administrador.');
        }

        const usernameData = usernameSnap.data();
        emailToAuth = usernameData?.email;
        if (!emailToAuth) {
          throw new Error('E-mail institucional não vinculado a este usuário.');
        }
      }

      const credential = await signInWithEmailAndPassword(auth, emailToAuth, password);
      const fbUser = credential.user;

      // Check Firestore profile
      const userDocRef = doc(db, 'users', fbUser.uid);
      let userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        const snapByEmail = await getDocs(
          query(collection(db, 'users'), where('email', '==', emailToAuth.toLowerCase()), limit(1))
        );
        if (!snapByEmail.empty) {
          const existingData = snapByEmail.docs[0].data() as User;
          const cleanUser = normalizeUsername(existingData.username || emailToAuth.split('@')[0]);
          const syncedUser: User = {
            ...existingData,
            id: fbUser.uid,
            email: fbUser.email?.toLowerCase() || emailToAuth.toLowerCase(),
            status: existingData.status || 'ATIVO',
            perfil: existingData.perfil || 'VISUALIZADOR',
            nome: existingData.nome || fbUser.displayName || 'Usuário',
            username: cleanUser,
            createdAt: existingData.createdAt || new Date().toISOString(),
            precisaTrocarSenha: existingData.precisaTrocarSenha || false
          };
          delete (syncedUser as any).password;
          await setDoc(userDocRef, syncedUser, { merge: true });
          userSnap = await getDoc(userDocRef);

          await setDoc(doc(db, 'usernames', cleanUser), {
            email: fbUser.email?.toLowerCase() || emailToAuth.toLowerCase(),
            uid: fbUser.uid
          });
        }
      }

      if (userSnap.exists()) {
        const data = userSnap.data() as User;
        if (data.status === 'INATIVO') {
          await signOut(auth);
          throw new Error('Sua conta está inativa. Contate o administrador.');
        }

        // Ao detectar no login que auth.currentUser.email difere de usernames/{usuario}.email, atualizar o documento usernames
        if (data.username && fbUser.email) {
          const cleanUser = normalizeUsername(data.username);
          try {
            const currentUsernameDoc = await getDoc(doc(db, 'usernames', cleanUser));
            if (currentUsernameDoc.exists() && currentUsernameDoc.data().email !== fbUser.email) {
              await setDoc(doc(db, 'usernames', cleanUser), {
                email: fbUser.email,
                uid: fbUser.uid
              });
            }
          } catch (e) {
            console.warn("Aviso ao sincronizar usernames no login:", e);
          }
        }

        setUserData({ ...data, id: userSnap.id });
        setCurrentUser({ 
          username: data.username || data.nome, 
          email: fbUser.email || data.email, 
          uid: fbUser.uid 
        });
      } else {
        await signOut(auth);
        throw new Error('Usuário autenticado, mas não possui cadastro ativo no sistema. Contate o administrador.');
      }
    } catch (error: any) {
      console.error("Falha na autenticação:", error);
      if (
        error.code === 'auth/invalid-credential' || 
        error.code === 'auth/wrong-password' || 
        error.code === 'auth/user-not-found'
      ) {
        throw new Error('Usuário/e-mail ou senha incorretos.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Muitas tentativas sem sucesso. Tente novamente mais tarde ou use "Esqueci minha senha".');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('Sua conta foi desativada pelo administrador.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Formato de e-mail inválido.');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * (5) ESQUECI MINHA SENHA:
   * Na tela de login, o usuário digita o nome de usuário (ou e-mail).
   * O sistema busca usernames/{usuario}.
   * Se o e-mail não for @crb4.local, chama sendPasswordResetEmail.
   * Se for @crb4.local, informa: "Nenhum e-mail cadastrado. Procure o administrador para redefinir sua senha."
   * Não revela mais informação do que isso.
   */
  const resetPassword = async (identifierInput: string): Promise<{ sent: boolean; isInternal?: boolean }> => {
    const raw = identifierInput.trim();
    if (!raw) {
      throw new Error('Por favor, informe seu usuário ou e-mail.');
    }

    let emailToSend = '';

    if (raw.includes('@')) {
      emailToSend = raw.toLowerCase();
      if (emailToSend.endsWith('@crb4.local')) {
        return { sent: false, isInternal: true };
      }
    } else {
      const clean = normalizeUsername(raw);
      const usernameSnap = await getDoc(doc(db, 'usernames', clean));
      if (!usernameSnap.exists()) {
        throw new Error('Usuário não encontrado.');
      }
      const data = usernameSnap.data();
      const userEmail = data?.email;
      if (!userEmail || userEmail.endsWith('@crb4.local')) {
        return { sent: false, isInternal: true };
      }
      emailToSend = userEmail;
    }

    try {
      await sendPasswordResetEmail(auth, emailToSend);
      return { sent: true };
    } catch (error: any) {
      console.error("Erro no envio do e-mail de redefinição:", error);
      if (error.code === 'auth/user-not-found') {
        throw new Error('Usuário não encontrado.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Muitas solicitações recentes. Por favor, aguarde alguns minutos e tente novamente.');
      }
      throw new Error('Não foi possível enviar o link de redefinição de senha. Verifique os dados informados.');
    }
  };

  /**
   * (3) PRIMEIRO ACESSO / TROCA DE SENHA:
   * Atualiza a senha no Firebase Auth e desmarca precisaTrocarSenha no Firestore
   */
  const updateUserPassword = async (newPassword: string, currentPassword?: string) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Nenhum usuário autenticado.');

    try {
      try {
        await updatePassword(user, newPassword);
      } catch (err: any) {
        if (err.code === 'auth/requires-recent-login' && currentPassword && user.email) {
          const cred = EmailAuthProvider.credential(user.email, currentPassword);
          await reauthenticateWithCredential(user, cred);
          await updatePassword(user, newPassword);
        } else {
          throw err;
        }
      }

      // Marcar precisaTrocarSenha = false no Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { precisaTrocarSenha: false });
      setUserData(prev => prev ? { ...prev, precisaTrocarSenha: false } : prev);
    } catch (err: any) {
      console.error("Erro ao atualizar senha:", err);
      if (err.code === 'auth/weak-password') {
        throw new Error('A senha deve ter no mínimo 6 caracteres.');
      } else if (err.code === 'auth/requires-recent-login') {
        throw new Error('Por segurança, informe sua senha atual para confirmar a alteração.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error('Senha atual incorreta.');
      }
      throw new Error(err.message || 'Erro ao atualizar a senha.');
    }
  };

  /**
   * (4) ABA MEU CADASTRO - ATUALIZAR E-MAIL REAL:
   * Usa verifyBeforeUpdateEmail para enviar link de confirmação
   */
  const updateRealEmail = async (newEmail: string) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Nenhum usuário autenticado.');

    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.endsWith('@crb4.local')) {
      throw new Error('Por favor, informe um endereço de e-mail válido.');
    }

    try {
      await verifyBeforeUpdateEmail(user, cleanEmail);
    } catch (err: any) {
      console.error("Erro ao enviar confirmação de e-mail:", err);
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('Este endereço de e-mail já está sendo utilizado por outra conta.');
      } else if (err.code === 'auth/invalid-email') {
        throw new Error('Formato de e-mail inválido.');
      } else if (err.code === 'auth/requires-recent-login') {
        throw new Error('Sessão expirada para esta alteração. Por favor, encerre a sessão e faça login novamente.');
      }
      throw new Error(err.message || 'Não foi possível enviar o link de verificação para o novo e-mail.');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Erro ao sair:", e);
    } finally {
      setCurrentUser(null);
      setUserData(null);
    }
  };

  const value = {
    currentUser,
    userData,
    loading,
    login,
    logout,
    resetPassword,
    updateUserPassword,
    updateRealEmail,
    reloadUserData,
    isAdmin: userData?.perfil === 'ADMIN',
    isOperacional: userData?.perfil === 'OPERACIONAL',
    isVisualizador: userData?.perfil === 'VISUALIZADOR',
    isReady,
    precisaTrocarSenha: Boolean(userData?.precisaTrocarSenha)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
