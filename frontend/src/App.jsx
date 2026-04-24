import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';

import Landing        from './pages/Landing';
import Login          from './pages/Login';
import Onboarding     from './pages/Onboarding';
import EsqueciSenha   from './pages/EsqueciSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import Dashboard      from './pages/Dashboard';
import ConsultaAtiva  from './pages/ConsultaAtiva';
import Prontuario     from './pages/Prontuario';
import Pacientes      from './pages/Pacientes';
import PacienteDetalhe from './pages/PacienteDetalhe';
import Relatorios     from './pages/Relatorios';
import Configuracoes  from './pages/Configuracoes';
import AppLayout      from './components/layout/AppLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 }
  }
});

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.accessToken);
  return token ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const token = useAuthStore(s => s.accessToken);
  return token ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Públicas */}
          <Route path="/"         element={<Landing />} />
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/cadastro"        element={<PublicRoute><Onboarding /></PublicRoute>} />
          <Route path="/convite/:token"  element={<Onboarding invite />} />
          <Route path="/esqueci-senha"   element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

          {/* Privadas — com layout do app */}
          <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
            <Route path="/dashboard"              element={<Dashboard />} />
            <Route path="/consulta/:id"           element={<ConsultaAtiva />} />
            <Route path="/prontuario/:id"         element={<Prontuario />} />
            <Route path="/pacientes"              element={<Pacientes />} />
            <Route path="/pacientes/:id"          element={<PacienteDetalhe />} />
            <Route path="/relatorios"             element={<Relatorios />} />
            <Route path="/configuracoes/*"        element={<Configuracoes />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
