import { getSupabase } from '@/lib/supabase';
import { getCouncilSettings, getLatestVerdicts } from '@/lib/council/db';
import { getExpertWeights } from '@/lib/council/ledger';
import { CouncilControls } from '@/components/admin/council/CouncilControls';
import { LedgerTable, type LedgerRow } from '@/components/admin/council/LedgerTable';
import { ActionComposer } from '@/components/admin/council/ActionComposer';

type SessionRow = {
  id: string;
  date: string;
  trigger_reasons: string[];
  data_mode: string;
  transcript_md: string;
  verdict: {
    action?: string; kill_switch?: { text?: string }; dissent_on_record?: string;
    diagnosis?: { root_cause?: string; lever?: string; evidence?: string };
    action_plan?: Array<{ step?: string; because?: string; lever?: string }>;
    creative_ideas?: Array<{ concept?: string; angle?: string; persona?: string; hook?: string; why?: string }>;
  } | null;
  model: string;
  created_at: string;
};

type ActionRow = {
  date: string;
  action_type: string;
  target_id: string;
  mode: string;
  result: string;
  created_at: string;
};

const TIER_EMOJI: Record<string, string> = { WINNING: '🟢', WATCH: '🟡', LOSER: '🔴', LEARNING: '🔵' };

export async function CouncilView() {
  const sb = getSupabase();
  const [settings, verdicts, weights, sessionsQ, predsQ, actionsQ] = await Promise.all([
    getCouncilSettings('BOSS'),
    getLatestVerdicts('BOSS'),
    getExpertWeights('BOSS'),
    sb.from('council_sessions').select('*').eq('brand', 'BOSS').order('created_at', { ascending: false }).limit(10),
    sb.from('council_predictions').select('*').eq('brand', 'BOSS').order('date', { ascending: false }).limit(50),
    sb.from('council_actions').select('*').eq('brand', 'BOSS').order('created_at', { ascending: false }).limit(20),
  ]);
  const sessions = (sessionsQ.data ?? []) as SessionRow[];
  const actions = (actionsQ.data ?? []) as ActionRow[];
  const ledger: LedgerRow[] = ((predsQ.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    date: String(r.date),
    expert: String(r.expert),
    predictionText: String(r.prediction_text ?? ''),
    metric: String(r.metric ?? ''),
    threshold: r.threshold != null ? Number(r.threshold) : null,
    deadline: String(r.deadline),
    weight: Number(r.weight ?? 1),
    outcome: (r.outcome as LedgerRow['outcome']) ?? null,
    needsManual: Boolean(r.needs_manual),
  }));

  const counts = { WINNING: 0, WATCH: 0, LOSER: 0, LEARNING: 0 } as Record<string, number>;
  for (const v of verdicts) counts[v.verdict] = (counts[v.verdict] ?? 0) + 1;
  const movers = verdicts.filter((v) => v.changed);

  return (
    <div className="space-y-6">
      <CouncilControls mode={settings.mode} targetCppCentavos={settings.targetCppCentavos} />

      {/* Today's roster — the Telegram brief stays the canonical daily surface */}
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Today&rsquo;s roster</h2>
        <p className="mt-2 text-sm text-slate-700">
          🟢 {counts.WINNING} Winning · 🟡 {counts.WATCH} Watch · 🔴 {counts.LOSER} Loser · 🔵 {counts.LEARNING} Learning
        </p>
        <div className="mt-3 space-y-1 text-[13px] text-slate-600">
          {movers.length === 0 && <p className="text-slate-400">No tier changes — roster stable.</p>}
          {movers.map((m) => (
            <p key={m.adId}>
              ↳ {m.adName} → {TIER_EMOJI[m.verdict]} {m.verdict}: {m.headline}
            </p>
          ))}
        </div>
      </section>

      {/* Sessions */}
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Prince’s analyses</h2>
        {sessions.length === 0 && <p className="mt-2 text-[13px] text-slate-400">No sessions yet.</p>}
        <div className="mt-3 space-y-3">
          {sessions.map((s) => (
            <details key={s.id} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="font-semibold text-slate-800">{s.date}</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">Mode {s.data_mode}</span>
                  {s.trigger_reasons.map((t) => (
                    <span key={t} className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10.5px] text-cyan-700">{t}</span>
                  ))}
                </span>
                <span className="mt-1 block text-[13px] font-medium text-slate-800">
                  VERDICT: {s.verdict?.action ?? '—'}
                </span>
                {s.verdict?.diagnosis?.root_cause && (
                  <span className="mt-1.5 block text-[12px] text-slate-600">
                    <b className="text-slate-500">Problem{s.verdict.diagnosis.lever ? ` (${s.verdict.diagnosis.lever})` : ''}:</b>{' '}
                    {s.verdict.diagnosis.root_cause}
                  </span>
                )}
                {s.verdict?.action_plan && s.verdict.action_plan.length > 0 && (
                  <span className="mt-1 block text-[12px] text-slate-700">
                    <b className="text-slate-500">The plan:</b>
                    {s.verdict.action_plan.map((st, i) => (
                      <span key={i} className="mt-0.5 block pl-3">
                        {i + 1}. {st.step}
                        {st.because ? <span className="text-slate-400"> — {st.because}</span> : ''}
                      </span>
                    ))}
                  </span>
                )}
                {s.verdict?.creative_ideas && s.verdict.creative_ideas.length > 0 && (
                  <span className="mt-1 block text-[12px] text-slate-700">
                    <b className="text-slate-500">💡 Creative to test:</b>
                    {s.verdict.creative_ideas.map((idea, i) => (
                      <span key={i} className="mt-0.5 block pl-3">
                        • {idea.concept}
                        {idea.persona ? <span className="text-slate-400"> ({idea.persona.replace(/-/g, ' ')})</span> : ''}
                        {idea.hook ? <span className="block pl-3 text-slate-400 italic">“{idea.hook}”</span> : ''}
                      </span>
                    ))}
                  </span>
                )}
                {s.verdict?.kill_switch?.text && (
                  <span className="mt-0.5 block text-[12px] text-slate-500">Kill switch: {s.verdict.kill_switch.text}</span>
                )}
                {s.verdict?.dissent_on_record && (
                  <span className="mt-0.5 block text-[12px] text-amber-700">Dissent: {s.verdict.dissent_on_record}</span>
                )}
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-[11.5px] leading-relaxed text-slate-700">{s.transcript_md}</pre>
            </details>
          ))}
        </div>
      </section>

      {/* Ledger */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Prediction ledger</h2>
          <span className="text-[11.5px] text-slate-500">
            Weights: {Object.entries(weights).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}
          </span>
        </div>
        <div className="mt-3">
          <LedgerTable rows={ledger} />
        </div>
      </section>

      {/* Execute + log */}
      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Execute an action</h2>
        <p className="mt-1 text-[12px] text-slate-500">
          Chair verdicts are free text — compose the concrete action here. Guardrails enforced server-side in every mode.
        </p>
        <div className="mt-3">
          <ActionComposer
            roster={verdicts.map((v) => ({ adId: v.adId, adName: v.adName, verdict: v.verdict }))}
            mode={settings.mode}
          />
        </div>
        {actions.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-[11px] uppercase tracking-wide text-slate-400">Action log</h3>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-600">
              {actions.map((a, i) => (
                <li key={i}>
                  {a.date} · {a.action_type} · {a.target_id} · {a.mode} → {a.result}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
