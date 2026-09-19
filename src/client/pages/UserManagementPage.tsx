import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  Trash2,
  Edit2,
  ShieldAlert,
  Sparkles,
  User,
  Key,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { api } from '../api';
import { User as UserType, UserRole } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const { user: currentUser } = useAuth();
  const { success, error, info } = useToast();

  const loadUsers = async () => {
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (e: any) {
      error(`Failed to load users: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setUsername('');
    setPassword('');
    setRole('user');
    setAvatarUrl('');
    setShowModal(true);
  };

  const openEditModal = (u: UserType) => {
    setEditingUser(u);
    setUsername(u.username);
    setPassword('');
    setRole(u.role);
    setAvatarUrl(u.avatar_url || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingUser && (!username.trim() || !password.trim())) {
      error('Username and password are required');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          role,
          password: password.trim() ? password.trim() : undefined,
          avatar_url: avatarUrl
        });
        success(`User "${editingUser.username}" updated!`);
      } else {
        await api.createUser({
          username: username.trim(),
          password: password.trim(),
          role,
          avatar_url: avatarUrl
        });
        success(`User "${username}" created!`);
      }

      setShowModal(false);
      loadUsers();
    } catch (err: any) {
      error(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: UserType) => {
    if (u.id === currentUser?.id) {
      error('Cannot delete your own account');
      return;
    }

    if (!window.confirm(`Delete user "${u.username}"?`)) return;

    try {
      await api.deleteUser(u.id);
      success(`User "${u.username}" deleted`);
      loadUsers();
    } catch (err: any) {
      error(err.message);
    }
  };

  const renderRoleBadge = (userRole: UserRole) => {
    switch (userRole) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-400 bg-amber-950/50 border border-amber-800/50 px-2.5 py-0.5 rounded-lg">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Administrator</span>
          </span>
        );
      case 'editor':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-300 bg-brand-950/50 border border-brand-500/50 px-2.5 py-0.5 rounded-lg">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>Character Editor</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-lg">
            <User className="w-3.5 h-3.5" />
            <span>Standard User</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <UserCheck className="w-6 h-6 text-brand-400" />
            <span>User Management & Role Permissions</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage user accounts, assign Character Editor or Admin roles, and control access to server configuration.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add New User</span>
        </button>
      </div>

      {/* Role Descriptions Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-1.5 text-amber-400 font-bold text-xs">
            <ShieldAlert className="w-4 h-4" />
            <span>Administrator</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Full system control. Can change server settings, pull/unload Ollama models, configure API provider endpoints, manage Discord bot, and manage users.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-1.5 text-brand-300 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span>Character Editor</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Can create, edit, clone, and delete RP characters, emotional avatars, user relationships, and lorebooks. Cannot touch server or model configurations.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-1.5 text-zinc-300 font-bold text-xs">
            <User className="w-4 h-4 text-zinc-400" />
            <span>Standard User</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Roleplay chat access only. Can converse with characters in solo chat and multi-character group lounge. Cannot edit characters or server settings.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte">
        <h2 className="text-base font-bold text-white mb-4">Registered Control Panel Accounts</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/70 text-zinc-400 font-semibold uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Role & Permissions</th>
                <th className="p-3">Created At</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-zinc-900/30">
                  <td className="p-3 flex items-center gap-3">
                    <img
                      src={u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                      alt={u.username}
                      className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 object-cover"
                    />
                    <div>
                      <p className="font-bold text-zinc-100">{u.username}</p>
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] text-brand-400 font-medium">(You)</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {renderRoleBadge(u.role)}
                  </td>
                  <td className="p-3 font-mono text-zinc-500 text-[11px]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-brand-400" />
              <span>{editingUser ? `Edit User: ${editingUser.username}` : 'Create New User'}</span>
            </h3>

            <div className="space-y-3.5">
              {!editingUser && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="e.g. joshua"
                    className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  {editingUser ? 'New Password (Leave blank to keep unchanged)' : 'Password *'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  User Role & Permissions
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 font-medium focus:outline-none focus:border-brand-500"
                >
                  <option value="user">Standard User (Roleplay chat & public character viewer)</option>
                  <option value="editor">Character Editor (Create & edit RP characters & lorebooks)</option>
                  <option value="admin">Administrator (Full control, server tuning, models & endpoints)</option>
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {role === 'admin' && 'Can configure server RAM/CPU, pull Ollama models, add LLM API keys, and manage Discord bots.'}
                  {role === 'editor' && 'Can manage characters, emotions, relationships, and lore. Cannot change server settings or models.'}
                  {role === 'user' && 'Can only participate in solo and group roleplay chats.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Avatar URL (Optional)
                </label>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={e => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
