import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { collection, query, getDocs, getDoc, doc, where, limit, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { User } from '@/src/types';

interface AuthContextType {
  currentUser: { username?: string; email: string; uid: string } | null;
  userData: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  isAdmin: boolean;
  isOperacional: boolean;
  isVisualizador: boolean;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<{ username?: string; email: string; uid: string } | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let unsubscribeUserData: (() => void) | undefined;

    // Listen to genuine Firebase Authentication state
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
              const syncedUser: User = {
                ...existingData,
                id: fbUser.uid,
                email: fbUser.email.toLowerCase(),
                status: existingData.status || 'ATIVO',
                perfil: existingData.perfil || 'VISUALIZADOR',
                nome: existingData.nome || fbUser.displayName || 'Usuário',
                username: existingData.username || fbUser.email.split('@')[0],
                createdAt: existingData.createdAt || new Date().toISOString()
              };
              // Ensure no plain-text password is saved
              delete (syncedUser as any).password;

              await setDoc(userDocRef, syncedUser, { merge: true });
              userSnap = await getDoc(userDocRef);
            }
          }

          if (userSnap.exists()) {
            const data = userSnap.data() as User;
            if (data.status === 'ATIVO') {
              setUserData({ ...data, id: userSnap.id });
              setCurrentUser({ 
                username: data.username || data.nome, 
                email: data.email || fbUser.email, 
                uid: fbUser.uid 
              });

              // Realtime listener for profile updates (e.g. status or role changes by admin)
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
                email: data.email || fbUser.email, 
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

  const login = async (emailInput: string, passwordInput: string) => {
    try {
      setLoading(true);
      const email = emailInput.trim();
      const password = passwordInput.trim();

      if (!email || !password) {
        throw new Error('Por favor, informe seu e-mail e senha.');
      }

      // Authenticate strictly with Firebase Authentication
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = credential.user;

      // Check Firestore profile
      const userDocRef = doc(db, 'users', fbUser.uid);
      let userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        const snapByEmail = await getDocs(
          query(collection(db, 'users'), where('email', '==', email.toLowerCase()), limit(1))
        );
        if (!snapByEmail.empty) {
          const existingData = snapByEmail.docs[0].data() as User;
          const syncedUser: User = {
            ...existingData,
            id: fbUser.uid,
            email: email.toLowerCase(),
            status: existingData.status || 'ATIVO',
            perfil: existingData.perfil || 'VISUALIZADOR',
            nome: existingData.nome || fbUser.displayName || 'Usuário',
            username: existingData.username || email.split('@')[0],
            createdAt: existingData.createdAt || new Date().toISOString()
          };
          delete (syncedUser as any).password;
          await setDoc(userDocRef, syncedUser, { merge: true });
          userSnap = await getDoc(userDocRef);
        }
      }

      if (userSnap.exists()) {
        const data = userSnap.data() as User;
        if (data.status === 'INATIVO') {
          await signOut(auth);
          throw new Error('Sua conta está inativa. Contate o administrador.');
        }
        setUserData({ ...data, id: userSnap.id });
        setCurrentUser({ username: data.username || data.nome, email: data.email || email, uid: fbUser.uid });
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
        throw new Error('E-mail ou senha incorretos.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Muitas tentativas sem sucesso. Tente novamente mais tarde ou use "Esqueci minha senha".');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('Sua conta foi desativada pelo administrador.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Formato de e-mail inválido. Utilize o formato nome@crb4.org.br.');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (emailInput: string) => {
    const email = emailInput.trim();
    if (!email) {
      throw new Error('Por favor, informe seu e-mail institucional.');
    }
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error("Erro no envio do e-mail de redefinição:", error);
      if (error.code === 'auth/user-not-found') {
        throw new Error('Nenhum usuário cadastrado com este e-mail.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Formato de e-mail inválido.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Muitas solicitações recentes. Por favor, aguarde alguns minutos e tente novamente.');
      }
      throw new Error('Não foi possível enviar o link de redefinição de senha. Verifique o e-mail informado.');
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
    isAdmin: userData?.perfil === 'ADMIN',
    isOperacional: userData?.perfil === 'OPERACIONAL',
    isVisualizador: userData?.perfil === 'VISUALIZADOR',
    isReady
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
