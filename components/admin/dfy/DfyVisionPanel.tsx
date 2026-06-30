'use client';

import { useEffect, useState } from 'react';
import { CustomerLinkPicker, type LinkedCustomer } from '@/components/admin/CustomerLinkPicker';
import type { DfyProject, DfyVision } from '@/lib/dfy';
import type { Signup } from '@/lib/db';

/** Customer Info & Vision tab. Two halves:
 *   - top: linked customer (pulls email/phone/paid status straight from the
 *     signup row when set), plus a free-text customer name + project name
 *   - bottom: structured vision fields with autosave-on-blur
 *
 *  Saves go straight to PATCH /api/admin/dfy-projects/[id]. Vision writes
 *  the entire `vision` JSONB blob each time. */
export function DfyVisionPanel({
  project,
  signup,
  initialLinked,
}: {
  project: DfyProject;
  signup: Signup | null;
  initialLinked: LinkedCustomer | null;
}) {
  const [customerName, setCustomerName] = useState(project.customerName);
  const [projectName, setProjectName] = useState(project.projectName);
  const [linked, setLinked] = useState<LinkedCustomer | null>(initialLinked);
  const [vision, setVision] = useState<DfyVision>(project.vision || {});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/dfy-projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
    } catch (err) {
      console.error('[dfy/vision] save failed', err);
      window.alert('Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  // Debounced autosave for text edits so we don't PATCH every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const dirty =
        customerName !== project.customerName ||
        projectName !== project.projectName;
      if (dirty) patch({ customerName, projectName });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName, projectName]);

  // Vision changes — same debounce, single JSONB write.
  useEffect(() => {
    const t = setTimeout(() => {
      if (JSON.stringify(vision) === JSON.stringify(project.vision || {})) return;
      patch({ vision });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vision]);

  // Linked customer — immediate save (it's a discrete click event).
  async function onPickCustomer(c: LinkedCustomer | null) {
    setLinked(c);
    await patch({ signupId: c?.signupId ?? null });
  }

  const paidStatus = signup?.status || (linked?.status as string | undefined);
  const paidPHP = signup?.amountCentavos ? signup.amountCentavos / 100 : null;

  return (
    <div className="space-y-6">
      {/* Customer info */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Customer info</h2>
          <SavedPill saving={saving} savedAt={savedAt} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Linked customer (optional)</Label>
            <CustomerLinkPicker linked={linked} onPick={onPickCustomer} />
          </div>
          <div>
            <Label>Customer / company name *</Label>
            <input
              className={input}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div>
            <Label>Project name</Label>
            <input
              className={input}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Anaya Ops v2"
            />
          </div>
        </div>
        {signup && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[12px] text-slate-700">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Linked signup snapshot
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Field label="Email" value={signup.email} />
              <Field label="Phone" value={signup.phone || '—'} />
              <Field label="Status" value={
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  paidStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}>{paidStatus || 'unknown'}</span>
              } />
              <Field label="Paid" value={paidPHP != null ? `₱${Math.round(paidPHP).toLocaleString('en-PH')}` : '—'} />
              <Field label="Source" value={signup.source || '—'} />
              <Field label="Registered" value={signup.createdAt?.slice(0, 10) || '—'} />
            </div>
          </div>
        )}
      </section>

      {/* Vision */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Vision</h2>
          <SavedPill saving={saving} savedAt={savedAt} />
        </div>
        <div className="grid gap-3">
          <div>
            <Label>Goal — what problem does this solve?</Label>
            <textarea
              className={`${input} min-h-[78px] resize-y`}
              value={vision.goal ?? ''}
              onChange={(e) => setVision({ ...vision, goal: e.target.value })}
              placeholder="e.g. Replace their manual fleet inventory tracking with a single dashboard the dispatchers and the office can both use."
            />
          </div>
          <div>
            <Label>Target users</Label>
            <textarea
              className={`${input} min-h-[60px] resize-y`}
              value={vision.targetUsers ?? ''}
              onChange={(e) => setVision({ ...vision, targetUsers: e.target.value })}
              placeholder="e.g. 3 office staff + 8 drivers on phones."
            />
          </div>
          <div>
            <Label>Key features (one per line)</Label>
            <textarea
              className={`${input} min-h-[100px] resize-y font-mono text-[12.5px]`}
              value={vision.keyFeatures ?? ''}
              onChange={(e) => setVision({ ...vision, keyFeatures: e.target.value })}
              placeholder={'Vehicle inventory CRUD\nDriver check-in / check-out\nDispatch board\nFleet utilization report'}
            />
          </div>
          <div>
            <Label>Additional notes</Label>
            <textarea
              className={`${input} min-h-[80px] resize-y`}
              value={vision.additionalNotes ?? ''}
              onChange={(e) => setVision({ ...vision, additionalNotes: e.target.value })}
              placeholder="Any context, constraints, design references…"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function SavedPill({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  if (saving) return <span className="text-[11px] text-slate-400">Saving…</span>;
  if (savedAt) return <span className="text-[11px] text-emerald-600">Saved</span>;
  return null;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
      {children}
    </label>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-[12px] font-medium text-slate-900">{value}</span>
    </div>
  );
}

const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200';
