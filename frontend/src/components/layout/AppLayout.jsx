// ── APP LAYOUT ────────────────────────────────────────────────
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, BarChart2, Settings, LogOut, Layers, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const NAV = [
  { to: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/pacientes',     label: 'Pacientes',       icon: Users },
  { to: '/relatorios',    label: 'Relatórios',      icon: BarChart2 },
  { to: '/configuracoes', label: 'Configurações',   icon: Settings },
];

export default function AppLayout() {
  const user    = useAuthStore(s => s.user);
  const logout  = useAuthStore(s => s.logout);
  const plan    = user?.plan || 'starter';

  const PLAN_COLORS = { starter: 'bg-gray-100 text-gray-600', pro: 'bg-blue-100 text-blue-700', enterprise: 'bg-purple-100 text-purple-700' };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Layers size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-[15px]">MedDoc AI</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="px-3 py-2.5 mb-2">
            <div className="text-xs font-semibold text-gray-900 truncate">{user?.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-400 capitalize">{user?.role}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize ${PLAN_COLORS[plan]}`}>{plan}</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
