// ── PÁGINA: Configurações ─────────────────────────────────────
import { useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plug, CreditCard, Shield, FileText, Loader2, Plus, Trash2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

const SUB_NAV = [
  { to: '',           label: 'Usuários',       icon: Users },
  { to: 'integracao', label: 'Integração HIS',  icon: Plug },
  { to: 'plano',      label: 'Plano',           icon: CreditCard },
  { to: 'auditoria',  label: 'Auditoria',       icon: Shield },
  { to: 'templates',  label: 'Templates IA',    icon: FileText },
];

export default function Configuracoes() {
  return (
    <div className="flex h-full">
      {/* Sub-nav */}
      <aside className="w-44 border-r border-gray-100 bg-white px-3 py-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-3">Configurações</p>
        {SUB_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`
            }>
            <Icon size={14} />{label}
          </NavLink>
        ))}
      </aside>

      <div className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route index        element={<UsuariosConfig />} />
          <Route path="integracao" element={<IntegracaoConfig />} />
          <Route path="plano"      element={<PlanoConfig />} />
          <Route path="auditoria"  element={<AuditoriaConfig />} />
          <Route path="templates"  element={<TemplatesConfig />} />
        </Routes>
      </div>
    </div>
  );
}

// ── USUÁRIOS ──────────────────────────────────────────────────
function UsuariosConfig() {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('medico');
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/clinics/users').then(r => r.data),
  });

  const invite = useMutation({
    mutationFn: () => api.post('/auth/invite', { email: inviteEmail, role: inviteRole }),
    onSuccess: () => { toast.success('Convite enviado!'); setInviteEmail(''); qc.invalidateQueries(['users']); },
    onError:   () => toast.error('Erro ao enviar convite'),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Usuários</h2>

      {/* Convidar */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 text-sm">Convidar membro</h3>
        <div className="flex gap-3">
          <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@clinica.com"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="medico">Médico</option>
            <option value="recepcionista">Recepcionista</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={() => invite.mutate()} disabled={!inviteEmail || invite.isPending}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {invite.isPending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
            Convidar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {(data?.data || []).map((u, i) => (
          <div key={u.id} className={`flex items-center px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mr-3">
              {u.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900 text-sm">{u.name}</div>
              <div className="text-xs text-gray-400">{u.email}</div>
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">{u.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── INTEGRAÇÃO HIS ────────────────────────────────────────────
function IntegracaoConfig() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ his_type: 'generic_rest', base_url: '', api_key: '', fhir_server: '', webhook_url: '' });

  const { data } = useQuery({
    queryKey: ['integration'],
    queryFn: () => api.get('/integrations/config').then(r => r.data),
    onSuccess: (d) => { if (d) setForm(f => ({ ...f, ...d, api_key: '' })); }
  });

  const save = useMutation({
    mutationFn: () => api.put('/integrations/config', form),
    onSuccess: () => { toast.success('Integração salva!'); qc.invalidateQueries(['integration']); },
    onError: () => toast.error('Erro ao salvar'),
  });

  const test = useMutation({
    mutationFn: () => api.post('/integrations/test'),
    onSuccess: () => toast.success('Conexão estabelecida com sucesso!'),
    onError: () => toast.error('Falha na conexão. Verifique as configurações.'),
  });

  const HIS_OPTIONS = [
    { value: 'generic_rest',  label: 'REST Genérico' },
    { value: 'generic_fhir',  label: 'HL7 FHIR R4' },
    { value: 'tasy',          label: 'Tasy (Philips)' },
    { value: 'mv',            label: 'MV (Soul MV)' },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Integração com HIS</h2>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sistema HIS</label>
          <select value={form.his_type} onChange={e => setForm(f => ({ ...f, his_type: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
            {HIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {['base_url', 'fhir_server', 'webhook_url'].map(field => (
          <div key={field}>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 capitalize">{field.replace(/_/g,' ')}</label>
            <input type="url" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              placeholder="https://"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        ))}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">API Key / Token</label>
          <input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder="Deixe em branco para manter a atual"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <p className="text-xs text-gray-400 mt-1">Armazenada com criptografia AES-256</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {save.isPending ? <Loader2 size={14} className="animate-spin"/> : null}
            Salvar
          </button>
          <button onClick={() => test.mutate()} disabled={test.isPending}
            className="flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {test.isPending ? <Loader2 size={14} className="animate-spin"/> : <Plug size={14}/>}
            Testar conexão
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PLANO / BILLING ───────────────────────────────────────────
function PlanoConfig() {
  const user = useAuthStore(s => s.user);

  const openCheckout = async (plan) => {
    const res = await api.post('/billing/checkout', { plan });
    window.location.href = res.data.checkoutUrl;
  };

  const openPortal = async () => {
    const res = await api.post('/billing/portal');
    window.location.href = res.data.portalUrl;
  };

  const PLANS = [
    { key:'starter',    name:'Starter',    price:'R$ 297/mês',  features:['1 médico','50 consultas/mês','3 templates','CID-10 IA'] },
    { key:'pro',        name:'Pro',         price:'R$ 897/mês',  features:['Até 10 médicos','Ilimitadas','Templates personalizados','Integração HIS','Assinatura digital'], popular:true },
    { key:'enterprise', name:'Enterprise',  price:'Sob consulta',features:['Médicos ilimitados','HL7 FHIR R4','Treinamento IA','SLA dedicado 4h','Tasy / MV'] },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Plano atual: <span className="text-blue-600 capitalize">{user?.plan}</span></h2>
        <button onClick={openPortal} className="text-sm text-blue-600 hover:underline">Gerenciar assinatura →</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {PLANS.map(p => (
          <div key={p.key} className={`bg-white rounded-xl border p-5 ${p.popular ? 'border-blue-500 shadow-md' : 'border-gray-100'}`}>
            {p.popular && <div className="text-xs font-bold text-blue-600 mb-2">Mais popular</div>}
            <div className="font-bold text-gray-900 mb-1">{p.name}</div>
            <div className="text-lg font-bold text-blue-600 mb-3">{p.price}</div>
            <ul className="space-y-1.5 mb-4">
              {p.features.map(f => <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-green-500 mt-0.5">✓</span>{f}</li>)}
            </ul>
            {p.key !== 'enterprise' ? (
              <button onClick={() => openCheckout(p.key)}
                className={`w-full py-2 rounded-lg text-sm font-semibold ${p.popular ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-700'}`}>
                {user?.plan === p.key ? 'Plano atual' : 'Assinar'}
              </button>
            ) : (
              <a href="mailto:vendas@meddoc.ai" className="block w-full py-2 rounded-lg text-sm font-semibold border border-gray-200 text-center text-gray-700">
                Falar com vendas
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AUDITORIA ─────────────────────────────────────────────────
function AuditoriaConfig() {
  const { data } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get('/clinics/audit-logs?limit=50').then(r => r.data),
  });

  return (
    <div className="max-w-4xl space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Log de Auditoria</h2>
      <p className="text-sm text-gray-500">Registros de todos os acessos e ações conforme exigência LGPD.</p>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Data/Hora','Usuário','Ação','Recurso','IP'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-4 py-2.5 text-gray-600 font-mono">
                  {new Date(row.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-2.5 text-gray-800 font-medium">{row.user_name || '—'}</td>
                <td className="px-4 py-2.5"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">{row.action}</span></td>
                <td className="px-4 py-2.5 text-gray-600">{row.resource}{row.resource_id ? `/${row.resource_id.slice(0,8)}…` : ''}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono">{row.ip_address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TEMPLATES ─────────────────────────────────────────────────
const TEMPLATE_TYPES = [
  { value: 'SOAP',      label: 'SOAP' },
  { value: 'anamnese',  label: 'Anamnese' },
  { value: 'retorno',   label: 'Retorno' },
  { value: 'urgencia',  label: 'Urgência' },
  { value: 'livre',     label: 'Livre' },
];

function TemplatesConfig() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ name: '', type: 'SOAP', specialty: '', fields: [''] });

  const { data } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/clinics/templates').then(r => r.data),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', type: 'SOAP', specialty: '', fields: [''] });
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name,
      type: t.type,
      specialty: t.specialty || '',
      fields: t.structure?.map(f => f.label) || [''],
    });
    setModalOpen(true);
  };

  const create = useMutation({
    mutationFn: (payload) => api.post('/clinics/templates', payload),
    onSuccess: () => { toast.success('Template criado!'); qc.invalidateQueries(['templates']); setModalOpen(false); },
    onError: () => toast.error('Erro ao criar template'),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/clinics/templates/${id}`, payload),
    onSuccess: () => { toast.success('Template atualizado!'); qc.invalidateQueries(['templates']); setModalOpen(false); },
    onError: () => toast.error('Erro ao atualizar template'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/clinics/templates/${id}`),
    onSuccess: () => { toast.success('Template removido!'); qc.invalidateQueries(['templates']); },
    onError: () => toast.error('Erro ao remover template'),
  });

  const toKey = (label) => {
    const slug = label.normalize('NFD')
      .split('').filter(c => c.charCodeAt(0) < 768 || c.charCodeAt(0) > 879).join('')
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return slug || `campo`;
  };

  const handleSave = () => {
    const structure = form.fields.filter(f => f.trim()).map(label => ({
      key:       toKey(label),
      label,
      required:  false,
      ai_prompt: `Preencha a seção "${label}" com base na transcrição da consulta médica.`,
    }));
    const payload = { name: form.name, type: form.type, specialty: form.specialty || null, structure };
    editing ? update.mutate({ id: editing.id, payload }) : create.mutate(payload);
  };

  const addField    = () => setForm(f => ({ ...f, fields: [...f.fields, ''] }));
  const removeField = (i) => setForm(f => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) }));
  const updateField = (i, val) => setForm(f => ({ ...f, fields: f.fields.map((v, idx) => idx === i ? val : v) }));

  const isSaving = create.isPending || update.isPending;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Templates de Prontuário</h2>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold">
          <Plus size={14}/> Novo template
        </button>
      </div>

      <div className="space-y-3">
        {(data?.data || []).map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900 text-sm">{t.name}</span>
                <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t.type}</span>
                {t.is_default && <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Padrão</span>}
              </div>
              {!t.is_default && (
                <div className="flex gap-2">
                  <button onClick={() => openEdit(t)} className="text-xs text-blue-600 hover:underline">Editar</button>
                  <button onClick={() => remove.mutate(t.id)} className="text-xs text-red-500 hover:underline">Remover</button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{t.structure?.length} campos</p>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editing ? 'Editar template' : 'Novo template'}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Consulta Cardiológica"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Especialidade <span className="font-normal text-gray-400">(opcional)</span></label>
                <input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                  placeholder="Ex: Hemodinâmica"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Campos do prontuário</label>
                <div className="space-y-2">
                  {form.fields.map((field, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={field} onChange={e => updateField(i, e.target.value)}
                        placeholder={`Campo ${i + 1}`}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      {form.fields.length > 1 && (
                        <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 px-1">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addField} className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus size={12} /> Adicionar campo
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={!form.name || isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50">
                {isSaving && <Loader2 size={14} className="animate-spin" />}
                {editing ? 'Salvar alterações' : 'Criar template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
