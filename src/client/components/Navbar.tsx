import React from 'react';
import { Menu, Plus, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResourceHUD } from './ResourceHUD';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 h-16 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-colors border border-zinc-800"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Center / Right: Live Resource Monitor HUD */}
      <div className="flex items-center gap-3">
        <ResourceHUD />

        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => navigate('/characters/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Character</span>
          </button>
        </div>
      </div>
    </header>
  );
};
