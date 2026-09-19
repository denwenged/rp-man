import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users2,
  MessageSquareCode,
  Users,
  Bot,
  Server,
  Cpu,
  BookOpen,
  UserCheck,
  Settings,
  Terminal,
  LogOut,
  Sparkles,
  ShieldAlert,
  Heart
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/characters', label: 'RP Characters', icon: Users2 },
    { to: '/playground', label: 'Live RP Chat', icon: MessageSquareCode, badge: 'Solo' },
    { to: '/groups', label: 'Group RP Lounge', icon: Users, badge: 'Multi' },
    { to: '/discord', label: 'Discord Bot & Webhooks', icon: Bot, highlight: true },
    { to: '/ollama', label: 'Ollama Model Hub', icon: Server },
    { to: '/providers', label: 'LLM Providers', icon: Cpu },
    { to: '/lorebooks', label: 'World Books & Lore', icon: BookOpen },
    ...(isAdmin ? [{ to: '/users', label: 'User Management', icon: UserCheck }] : []),
    { to: '/settings', label: 'Server & RAM Tuning', icon: Settings },
    { to: '/logs', label: 'Live Logs', icon: Terminal },
  ];

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden transition-opacity duration-300"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-zinc-800/80 bg-zinc-950/90">
          <NavLink to="/" className="flex items-center gap-3 group" onClick={onClose}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-glow-violet group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-zinc-100 font-sans">RP-Man</span>
                <span className="text-[10px] font-mono uppercase bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded font-semibold border border-brand-500/30">
                  ZimaOS
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-medium">AI Character & Discord Hoster</p>
            </div>
          </NavLink>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Management
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-zinc-900 text-white border border-zinc-700/80 shadow-matte'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? 'text-brand-400'
                            : item.highlight
                            ? 'text-indigo-400 group-hover:text-indigo-300'
                            : 'text-zinc-400 group-hover:text-zinc-300'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/80">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`}
                alt={user?.username}
                className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">{user?.username}</p>
                <div className="flex items-center gap-1">
                  {user?.role === 'admin' && <ShieldAlert className="w-3 h-3 text-amber-400" />}
                  <span className="text-[10px] capitalize text-zinc-400">{user?.role || 'user'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
