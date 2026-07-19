import React, { useState } from 'react';
import { MainLayout } from '../components/MainLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Users, Plus, Mail, Trash2, Copy, Check, RefreshCw, Crown, Edit, Eye, ShieldCheck, Building2, UserPlus
} from 'lucide-react';

type OrgRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

interface OrgMember {
  id: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: string;
}

interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: OrgMember[];
  invitations: Invitation[];
}

const ROLE_CONFIG: Record<OrgRole, { icon: React.ReactNode; color: string; label: string }> = {
  ADMIN: { icon: <Crown className="w-3 h-3" />, color: 'text-purple-400 bg-purple-400/10 border-purple-400/20', label: 'Admin' },
  EDITOR: { icon: <Edit className="w-3 h-3" />, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', label: 'Editor' },
  VIEWER: { icon: <Eye className="w-3 h-3" />, color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', label: 'Viewer' },
};

function RoleBadge({ role }: { role: OrgRole }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function getInitials(first?: string, last?: string) {
  return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase() || '??';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-white/10 text-brand-textMuted hover:text-white hover:bg-white/5 transition-all"
    >
      {copied ? <Check className="w-3 h-3 text-brand-success" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}

export const Team: React.FC = () => {
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('VIEWER');
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const { data: org, isLoading } = useQuery<Organization | null>({
    queryKey: ['organization'],
    queryFn: async () => {
      const res = await api.get('/v1/organizations/me');
      return res.data.data;
    },
  });

  const createOrgMutation = useMutation({
    mutationFn: (name: string) => api.post('/v1/organizations', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization'] }),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post('/v1/organizations/invite', { email: inviteEmail, role: inviteRole }),
    onSuccess: (res) => {
      setLastInviteUrl(res.data.data.inviteUrl);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/v1/organizations/members/${userId}`),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Team</h1>
            <p className="text-xs text-brand-textMuted">Manage your organization and collaborators</p>
          </div>
        </div>

        {!org ? (
          /* Create Org Card */
          <div className="max-w-md mx-auto mt-8">
            <div className="glass-panel rounded-2xl p-8 border border-white/5 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-violet-500/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white mb-1">Create Your Organization</h2>
                <p className="text-xs text-brand-textMuted">Set up a team workspace to collaborate with others</p>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Organization name..."
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  className="glass-input w-full"
                />
                <button
                  onClick={() => createOrgMutation.mutate(orgName)}
                  disabled={!orgName.trim() || createOrgMutation.isPending}
                  className="glass-button-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {createOrgMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Organization
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Org Header */}
            <div className="glass-panel rounded-2xl p-5 border border-white/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-500/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-violet-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">{org.name}</h2>
                <p className="text-[11px] text-brand-textMuted">
                  Created {new Date(org.createdAt).toLocaleDateString()} · {org.members.length} member{org.members.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-success" />
                <span className="text-xs text-brand-success font-semibold">Active</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Members List */}
              <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5">
                  <h3 className="text-sm font-bold text-white">Members ({org.members.length})</h3>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {org.members.map(member => (
                    <div key={member.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-all">
                      <div className="w-9 h-9 rounded-full bg-brand-primary/20 border border-brand-primary/20 flex items-center justify-center text-brand-primary text-xs font-bold shrink-0">
                        {getInitials(member.user.firstName, member.user.lastName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {member.user.firstName} {member.user.lastName}
                        </div>
                        <div className="text-[10px] text-brand-textMuted truncate">{member.user.email}</div>
                      </div>
                      <RoleBadge role={member.role} />
                      {member.role !== 'ADMIN' && (
                        <button
                          onClick={() => setRemoveTarget(member.userId)}
                          className="w-7 h-7 rounded-lg bg-brand-error/5 border border-brand-error/10 flex items-center justify-center hover:bg-brand-error/20 hover:border-brand-error/30 transition-all text-brand-error opacity-50 hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Invite Section */}
              <div className="space-y-4">
                <div className="glass-panel rounded-2xl p-5 border border-white/5 space-y-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-brand-primary" />
                    <h3 className="text-sm font-bold text-white">Invite Member</h3>
                  </div>
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="glass-input w-full text-xs"
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as OrgRole)}
                    className="glass-input w-full text-xs"
                  >
                    <option value="VIEWER">Viewer — read-only</option>
                    <option value="EDITOR">Editor — can edit</option>
                    <option value="ADMIN">Admin — full access</option>
                  </select>
                  <button
                    onClick={() => inviteMutation.mutate()}
                    disabled={!inviteEmail.trim() || inviteMutation.isPending}
                    className="glass-button-primary w-full flex items-center justify-center gap-2 text-xs disabled:opacity-40"
                  >
                    {inviteMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send Invite
                  </button>
                  {lastInviteUrl && (
                    <div className="bg-brand-success/5 border border-brand-success/20 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] text-brand-success font-bold block">✅ Invite created!</span>
                      <p className="text-[10px] text-brand-textMuted break-all leading-relaxed">{lastInviteUrl}</p>
                      <CopyButton text={lastInviteUrl} />
                    </div>
                  )}
                </div>

                {/* Pending Invitations */}
                {org.invitations.length > 0 && (
                  <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5">
                      <h3 className="text-xs font-bold text-white">Pending ({org.invitations.length})</h3>
                    </div>
                    <div className="divide-y divide-white/[0.03]">
                      {org.invitations.map(inv => (
                        <div key={inv.id} className="px-4 py-3 space-y-1.5">
                          <div className="flex justify-between items-start">
                            <span className="text-[11px] text-white truncate">{inv.email}</span>
                            <RoleBadge role={inv.role} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-brand-textMuted">
                              Expires {new Date(inv.expiresAt).toLocaleDateString()}
                            </span>
                            <CopyButton text={`${window.location.origin}/invite/${inv.token}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Remove Confirmation Dialog */}
        {removeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setRemoveTarget(null)}>
            <div className="absolute inset-0 bg-brand-dark/70 backdrop-blur-sm" />
            <div className="relative glass-panel rounded-2xl p-6 max-w-sm w-full border border-white/10 space-y-4 text-center animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 mx-auto bg-brand-error/10 border border-brand-error/20 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-brand-error" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Remove Member?</h3>
                <p className="text-xs text-brand-textMuted mt-1">This member will lose access to the organization immediately.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRemoveTarget(null)} className="flex-1 py-2 text-xs border border-white/10 rounded-lg text-brand-textMuted hover:text-white transition-all">Cancel</button>
                <button
                  onClick={() => removeMutation.mutate(removeTarget)}
                  disabled={removeMutation.isPending}
                  className="flex-1 py-2 text-xs bg-brand-error/80 hover:bg-brand-error rounded-lg text-white font-semibold transition-all"
                >
                  {removeMutation.isPending ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Team;
