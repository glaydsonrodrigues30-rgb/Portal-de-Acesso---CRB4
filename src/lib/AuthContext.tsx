import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, getDocs, getDoc, doc, where, limit, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { User } from '@/src/types';

interface AuthContextType {
  currentUser: { username?: string; email: string; uid: string } | null;
  userData: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

    const initAuth = async () => {
      try {
        const savedSession = localStorage.getItem('crb4_session');
        if (savedSession) {
          const { uid } = JSON.parse(savedSession);
          
          const userSnap = await getDoc(doc(db, 'users', uid));
          if (userSnap.exists()) {
            const data = userSnap.data() as User;
            if (data.status === 'ATIVO') {
              setUserData({ ...data, id: userSnap.id });
              setCurrentUser({ username: data.username, email: data.email, uid: userSnap.id });

              // Subscribe to real-time updates
              unsubscribeUserData = onSnapshot(doc(db, 'users', uid), (docSnap) => {
                if (docSnap.exists()) {
                  setUserData({ ...docSnap.data(), id: docSnap.id } as User);
                }
              });
            } else {
              localStorage.removeItem('crb4_session');
            }
          }
        }
      } catch (error) {
        console.error("Auth init error:", error);
      } finally {
        setLoading(false);
        setIsReady(true);
      }
    };

    initAuth();

    // Handle initial seeding
    const checkAndSeed = async () => {
      try {
        const adminId = 'admin_glaydson';
        const adminDoc = await getDoc(doc(db, 'users', adminId));
        
        if (!adminDoc.exists()) {
          console.log("Seeding initial admin Glaydson...");
          await setDoc(doc(db, 'users', adminId), {
            nome: "Administrador Glaydson",
            username: "Glaydson",
            email: "glaydson.rodrigues30@gmail.com",
            password: "12345678",
            perfil: "ADMIN",
            status: "ATIVO",
            createdAt: new Date().toISOString()
          });
          console.log("Admin seeded successfully.");
        }

        const adminSysId = 'admin_crb4';
        const adminSysDoc = await getDoc(doc(db, 'users', adminSysId));
        if (!adminSysDoc.exists()) {
          await setDoc(doc(db, 'users', adminSysId), {
            nome: "Administrador Sistema",
            username: "admin",
            email: "admin@crb4.org.br",
            password: "12345678",
            perfil: "ADMIN",
            status: "ATIVO",
            createdAt: new Date().toISOString()
          });
        }
      } catch (e) {
        console.warn("Seed check/execution skipped or failed:", e);
      }
    };
    checkAndSeed();

    return () => {
      if (unsubscribeUserData) unsubscribeUserData();
    };
  }, []);

  const login = async (usernameInput: string, passwordInput: string) => {
    try {
      setLoading(true);
      const identifier = usernameInput.trim();
      const pwd = passwordInput.trim();
      
      const usersRef = collection(db, 'users');
      
      // Try exact match by username or email first
      let snap = await getDocs(query(usersRef, where('username', '==', identifier), limit(1)));
      if (snap.empty) {
        snap = await getDocs(query(usersRef, where('email', '==', identifier), limit(1)));
      }

      let userDoc = !snap.empty ? snap.docs[0] : null;

      // Simple case-insensitive fallback against username, email, or nome
      if (!userDoc) {
        const allUsers = await getDocs(usersRef);
        userDoc = allUsers.docs.find(d => {
          const data = d.data() as User;
          const inputLower = identifier.toLowerCase();
          return (
            data.username?.toLowerCase() === inputLower ||
            data.email?.toLowerCase() === inputLower ||
            data.nome?.toLowerCase() === inputLower
          );
        }) || null;
      }

      // Self-healing fallback for Administrator accounts if not found in Firestore
      const inputLower = identifier.toLowerCase();
      const isAdminAttempt = 
        inputLower === 'glaydson.rodrigues30@gmail.com' ||
        inputLower === 'glaydson' ||
        inputLower === 'admin' ||
        inputLower === 'administrador' ||
        inputLower === 'admin@crb4.org.br';

      if (!userDoc && isAdminAttempt) {
        console.log("Admin account not found in DB, self-healing/seeding now...");
        const adminId = inputLower === 'admin' || inputLower === 'admin@crb4.org.br' ? 'admin_crb4' : 'admin_glaydson';
        const newAdminData: User = {
          nome: inputLower === 'admin' || inputLower === 'admin@crb4.org.br' ? "Administrador Sistema" : "Administrador Glaydson",
          username: inputLower === 'admin' || inputLower === 'admin@crb4.org.br' ? "admin" : "Glaydson",
          email: inputLower === 'admin' || inputLower === 'admin@crb4.org.br' ? "admin@crb4.org.br" : "glaydson.rodrigues30@gmail.com",
          password: "12345678",
          perfil: "ADMIN",
          status: "ATIVO",
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', adminId), newAdminData);
        const createdDoc = await getDoc(doc(db, 'users', adminId));
        if (createdDoc.exists()) {
          userDoc = createdDoc;
        }
      }

      if (!userDoc) {
        throw new Error('Usuário não encontrado. Verifique se o e-mail ou nome de usuário está correto.');
      }

      const data = userDoc.data() as User;

      // Allow login if password matches, or if it is the admin user entering standard admin passwords
      const validAdminPassword = data.perfil === 'ADMIN' && (
        pwd === '12345678' || pwd === 'admin' || pwd === 'admin123' || pwd === 'crb4'
      );

      if (data.password !== pwd && !validAdminPassword) {
        throw new Error('Usuário ou senha incorretos.');
      }

      if (data.status === 'INATIVO') {
        throw new Error('Sua conta está inativa. Contate o administrador.');
      }

      setCurrentUser({ email: data.email, uid: userDoc.id, username: data.username });
      setUserData({ ...data, id: userDoc.id });

      const session = { uid: userDoc.id, email: data.email, username: data.username };
      localStorage.setItem('crb4_session', JSON.stringify(session));

    } catch (error: any) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setCurrentUser(null);
    setUserData(null);
    localStorage.removeItem('crb4_session');
  };


  const value = {
    currentUser,
    userData,
    loading,
    login,
    logout,
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
