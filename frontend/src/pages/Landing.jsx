// ── PÁGINA: Landing ──────────────────────────────────────────
// Redireciona para o site estático (meddoc-ai.html)
// ou exibe versão inline caso o usuário acesse /

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Mic, FileText, Shield, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Layers size={16} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">Pronova</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Entrar
            </Link>
            <Link to="/cadastro"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Testar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-bold px-4 py-2 rounded-full mb-6 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full"></span>
            IA para documentação médica · Brasil
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 leading-tight mb-6">
            Pare de digitar.<br />
            <span className="text-blue-600 italic" style={{ fontFamily: 'Georgia, serif' }}>
              Comece a cuidar.
            </span>
          </h1>

          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            O Pronova transcreve sua consulta e gera o prontuário completo
            em segundos — automaticamente, no formato que você prefere.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/cadastro"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-xl text-base transition-all shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5">
              <ArrowRight size={18} />
              Testar grátis por 14 dias
            </Link>
            <Link to="/login"
              className="text-blue-600 font-semibold text-base hover:underline">
              Já tenho conta →
            </Link>
          </div>

          <div className="flex items-center justify-center gap-6 mt-8 flex-wrap">
            {['LGPD Compliant', 'CFM Res. 2314/2022', 'HL7 FHIR R4', 'ICP-Brasil'].map(b => (
              <div key={b} className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-lg bg-white">
                <CheckCircle2 size={12} className="text-teal-500" />
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-blue-600 py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 divide-x divide-blue-500">
          {[
            { num: '50%',  label: 'do tempo do médico\nperdido em burocracia' },
            { num: '12 min', label: 'em média digitando\npor consulta' },
            { num: '−70%', label: 'de redução no tempo\nde documentação' },
          ].map(s => (
            <div key={s.num} className="text-center px-8">
              <div className="text-4xl font-bold text-white mb-2">{s.num}</div>
              <div className="text-blue-200 text-sm whitespace-pre-line leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">Como funciona</p>
          <h2 className="text-4xl font-bold text-gray-900 mb-14">Três passos. Zero digitação.</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Mic,      step: '1', title: 'Inicie a consulta',    desc: 'Um clique no botão Iniciar. O Pronova começa a escutar e transcrever em tempo real.' },
              { icon: Mic,      step: '2', title: 'Consulte normalmente', desc: 'Fale com seu paciente como sempre fez. A IA transcreve e organiza as informações clinicamente.' },
              { icon: FileText, step: '3', title: 'Aprove o prontuário',  desc: 'Revise o documento gerado, edite se necessário e aprove. Sincronizado com seu HIS.' },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition-shadow relative">
                <div className="absolute top-6 right-6 text-7xl font-bold text-gray-50 select-none leading-none">{step}</div>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-5">
                  <Icon size={22} className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">Funcionalidades</p>
          <h2 className="text-4xl font-bold text-gray-900 mb-14">Tudo que você precisa.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { title: 'Transcrição em tempo real',     desc: 'Whisper API com latência < 2s. Identificação de falantes.' },
              { title: 'Geração de prontuário com IA',  desc: 'SOAP, Anamnese, Retorno. Taxa de aprovação > 85% sem edição.' },
              { title: 'Sugestão de CID-10',            desc: 'Diagnóstico sugerido automaticamente com base na transcrição.' },
              { title: 'Integração com HIS',            desc: 'HL7 FHIR R4, Tasy, MV Soul MV, API REST genérica.' },
              { title: 'Segurança e LGPD',              desc: 'AES-256, TLS 1.3, isolamento por clínica, log de auditoria.' },
              { title: 'Dashboard gerencial',           desc: 'Produção por médico, uso de IA, exportação CSV/PDF.' },
            ].map(f => (
              <div key={f.title} className="border border-gray-100 rounded-xl p-6 hover:border-blue-200 transition-colors">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-teal-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-gray-900 text-sm mb-1">{f.title}</div>
                    <div className="text-xs text-gray-500 leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3 text-center">Planos</p>
          <h2 className="text-4xl font-bold text-gray-900 mb-4 text-center">Comece hoje.</h2>
          <p className="text-gray-500 text-center mb-12">14 dias grátis em qualquer plano. Sem cartão de crédito.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Starter', price: 'R$ 297', period: '/mês',
                features: ['1 médico', '50 consultas/mês', '3 templates padrão', 'Sugestão de CID-10'],
                cta: 'Começar grátis', primary: false,
              },
              {
                name: 'Pro', price: 'R$ 897', period: '/mês',
                features: ['Até 10 médicos', 'Consultas ilimitadas', 'Templates personalizados', 'Integração HIS', 'Assinatura digital'],
                cta: 'Começar grátis', primary: true, badge: 'Mais popular',
              },
              {
                name: 'Enterprise', price: 'Sob consulta', period: '',
                features: ['Médicos ilimitados', 'HL7 FHIR R4', 'Treinamento IA', 'SLA dedicado 4h', 'Tasy / MV'],
                cta: 'Falar com vendas', primary: false,
              },
            ].map(p => (
              <div key={p.name} className={`bg-white rounded-2xl p-8 relative ${p.primary ? 'border-2 border-blue-500 shadow-xl' : 'border border-gray-100'}`}>
                {p.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    {p.badge}
                  </div>
                )}
                <div className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">{p.name}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-bold text-gray-900">{p.price}</span>
                  <span className="text-gray-400 text-sm pb-1">{p.period}</span>
                </div>
                <ul className="space-y-2.5 my-6">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle2 size={14} className="text-teal-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={p.primary ? '/cadastro' : p.name === 'Enterprise' ? 'mailto:vendas@pronova.ai' : '/cadastro'}
                  className={`block w-full text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    p.primary
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600'
                  }`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-gray-900 py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Comece a usar agora.<br />
            <span className="text-teal-400 italic" style={{ fontFamily: 'Georgia, serif' }}>O tempo é seu.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Sem cartão, sem burocracia. 14 dias para descobrir quanto tempo você vai ganhar de volta.
          </p>
          <Link to="/cadastro"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-4 rounded-xl text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
            <ArrowRight size={20} />
            Testar grátis por 14 dias — sem cartão
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Layers size={14} className="text-white" />
            </div>
            <span className="font-bold text-white">Pronova</span>
          </div>
          <p className="text-gray-500 text-sm">
            © 2026 Pronova · LGPD Compliant · Dados armazenados no Brasil
          </p>
        </div>
      </footer>

    </div>
  )
}
