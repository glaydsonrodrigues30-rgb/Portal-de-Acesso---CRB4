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
        // We use a specific ID for the seeded admin to make it easy to check
        const adminId = 'admin_glaydson';
        const adminDoc = await getDoc(doc(db, 'users', adminId));
        
        if (!adminDoc.exists()) {
          console.log("Seeding initial admin Glaydson...");
          await setDoc(doc(db, 'users', adminId), {
            nome: "Administrador",
            username: "Glaydson",
            email: "glaydson.rodrigues30@gmail.com",
            password: "12345678",
            perfil: "ADMIN",
            status: "ATIVO",
            createdAt: new Date().toISOString()
          });
          console.log("Admin seeded successfully.");
        }
      } catch (e) {
        // This might fail if rules are already tightened or if connection is slow
        console.warn("Seed check/execution skipped or failed:", e);
      }
    };
    checkAndSeed();

    return () => {
      if (unsubscribeUserData) unsubscribeUserData();
    };
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setLoading(true);
      
      const usersRef = collection(db, 'users');
      // Case-sensitive check first
      let q = query(usersRef, where('username', '==', username), limit(1));
      let snap = await getDocs(q);

      // Simple case-insensitive fallback for small number of users
      if (snap.empty) {
        const allUsers = await getDocs(usersRef);
        const match = allUsers.docs.find(d => d.data().username?.toLowerCase() === username.toLowerCase());
        if (match) {
          snap = { empty: false, docs: [match] } as any;
        }
      }

      if (snap.empty) {
        throw new Error('Usuário não encontrado. Verifique se o nome de usuário está correto.');
      }

      const userDoc = snap.docs[0];
      const data = userDoc.data() as User;

      if (data.password !== password) {
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
