import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

// Placeholder Pages (will implement next)
import Dashboard from './pages/Dashboard';
import Debitos from './pages/Debitos';
import Notificacoes from './pages/Notificacoes';
import Negociacoes from './pages/Negociacoes';
import Oficios from './pages/Oficios';
import Processos from './pages/Processos';
import Relatorios from './pages/Relatorios';
import Usuarios from './pages/Usuarios';
import Importacao from './pages/Importacao';
import Auditoria from './pages/Auditoria';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, userData, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  if (!currentUser) return <Navigate to="/login" />;
  if (userData?.status === 'INATIVO') return <Navigate to="/login" />;

  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/debitos" element={<ProtectedRoute><Debitos /></ProtectedRoute>} />
          <Route path="/notificacoes" element={<ProtectedRoute><Notificacoes /></ProtectedRoute>} />
          <Route path="/negociacoes" element={<ProtectedRoute><Negociacoes /></ProtectedRoute>} />
          <Route path="/oficios" element={<ProtectedRoute><Oficios /></ProtectedRoute>} />
          <Route path="/processos" element={<ProtectedRoute><Processos /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
          
          {/* Admin Routes */}
          <Route path="/usuarios" element={
            <ProtectedRoute>
              <AdminRoute><Usuarios /></AdminRoute>
            </ProtectedRoute>
          } />
          <Route path="/importar" element={
            <ProtectedRoute>
              <AdminRoute><Importacao /></AdminRoute>
            </ProtectedRoute>
          } />
          <Route path="/auditoria" element={
            <ProtectedRoute>
              <AdminRoute><Auditoria /></AdminRoute>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
