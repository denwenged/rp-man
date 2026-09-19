import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CharactersPage } from './pages/CharactersPage';
import { CharacterEditorPage } from './pages/CharacterEditorPage';
import { ChatPlaygroundPage } from './pages/ChatPlaygroundPage';
import { GroupChatPage } from './pages/GroupChatPage';
import { DiscordBotPage } from './pages/DiscordBotPage';
import { OllamaManagerPage } from './pages/OllamaManagerPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { LorebooksPage } from './pages/LorebooksPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { ServerSettingsPage } from './pages/ServerSettingsPage';
import { LogsPage } from './pages/LogsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean }> = ({
  children,
  requireAdmin = false,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-zinc-400">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="characters" element={<CharactersPage />} />
              <Route path="characters/:id" element={<CharacterEditorPage />} />
              <Route path="playground" element={<ChatPlaygroundPage />} />
              <Route path="groups" element={<GroupChatPage />} />
              <Route path="discord" element={<DiscordBotPage />} />
              <Route path="ollama" element={<OllamaManagerPage />} />
              <Route path="providers" element={<ProvidersPage />} />
              <Route path="lorebooks" element={<LorebooksPage />} />
              <Route
                path="users"
                element={
                  <ProtectedRoute requireAdmin>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<ServerSettingsPage />} />
              <Route path="logs" element={<LogsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};
export default App;
