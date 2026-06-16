/**
 * Finance — expenses, BOM-style projects, recurring payments, categories.
 *
 * Money is stored in centavos (bigint). Recurring payments are NOT stored as
 * expense rows: each month's Expenses view computes their occurrences on the fly
 * from the definitions (credited once the date has passed, upcoming before),
 * so there's no cron and no chance of duplicates. Stored expenses are either
 * `single` (one-off, with a category) or `project` (tagged to a project and
 * optionally a BOM line item) — the latter is what makes a project's "actual".
 *
 * All reads/writes go through the service-role client (RLS bypassed, server
 * only). Names are joined in JS from small lookup maps — robust and trivial at
 * this data scale.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type Cadence = 'monthly' | 'weekly';
export type ExpenseSource = 'single' | 'project' | 'recurring';

/** People who can front an expense — the Accounts Payable is owed to one of these. */
export const PAYERS = ['Kyle', 'Mikey'] as const;

export type Category = { id: string; name: string };

export type Project = {
  id: string;
  name: string;
  note: string;
  createdAt: string;
  budgetCentavos: number;
  actualCentavos: number;
};

export type ProjectItem = {
  id: string;
  projectId: string;
  name: string;
  budgetCentavos: number;
  actualCentavos: number;
  position: number;
};

export type Recurring = {
  id: string;
  name: string;
  amountCentavos: number;
  categoryId: string | null;
  categoryName: string;
  cadence: Cadence;
  creditDay: number;
  active: boolean;
  monthlyEquivalentCentavos: number;
  isAbono: boolean;
  paidBy: string | null;
};

export type Expense = {
  id: string;
  description: string;
  amountCentavos: number;
  categoryId: string | null;
  categoryName: string;
  spentOn: string; // YYYY-MM-DD
  projectId: string | null;
  projectName: string;
  projectItemId: string | null;
  projectItemName: string;
  source: ExpenseSource;
  isAbono: boolean;
  paidBy: string | null;
  abonoSettled: boolean;
};

/** One open/settled Accounts-Payable line — a stored abono expense OR a
 *  recurring abono occurrence (which is virtual, keyed by recurring + date). */
export type PayableItem = {
  key: string;
  kind: 'expense' | 'recurring';
  expenseId: string | null; // set when kind === 'expense'
  recurringId: string | null; // set when kind === 'recurring'
  date: string; // YYYY-MM-DD (spent-on / occurrence date)
  description: string;
  amountCentavos: number;
  paidBy: string; // 'Kyle' / 'Mikey' / 'Unspecified'
  projectName: string;
  settled: boolean;
};

export type AccountsPayable = {
  byPayer: { payer: string; centavos: number; count: number }[];
  totalCentavos: number;
  open: PayableItem[];
  settled: PayableItem[];
};

/** One line in the consolidated monthly Expenses view. */
export type MonthRow = {
  key: string;
  date: string; // YYYY-MM-DD
  description: string;
  tag: string; // category, "Project · line item", or "Recurring"
  source: ExpenseSource;
  amountCentavos: number;
  credited: boolean; // false = upcoming (future-dated recurring)
  expenseId: string | null; // stored rows: edit/delete by id
  recurringId: string | null; // recurring rows: override/skip by (id, date)
  overridden: boolean; // recurring occurrence whose amount was corrected this month
  isAbono: boolean; // fronted (reimbursable) expense
  paidBy: string | null; // who fronted it
  abonoSettled: boolean; // reimbursed already
};

export type MonthlyConsolidation = {
  year: number;
  month: number; // 1-12
  rows: MonthRow[];
  projectedFullCentavos: number; // everything expected this month
  actualToDateCentavos: number; // dated on/before today
  byCategory: { name: string; centavos: number }[];
  bySource: { single: number; project: number; recurring: number };
};

const WEEK_MS_PER_MONTH = 52 / 12; // ~4.333 weeks/month

// ─── Manila-time helpers (the business runs on PHT, UTC+8) ──────────────────

/** Today's date in Asia/Manila as YYYY-MM-DD. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Current {year, month(1-12)} in Asia/Manila. */
export function manilaYearMonth(): { year: number; month: number } {
  const d = manilaToday();
  return { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Money parse: "₱1,234.50" / "1234.5" → 123450 centavos. */
export function parsePesoToCentavos(input: string | number | null | undefined): number {
  if (input == null) return 0;
  const n =
    typeof input === 'number'
      ? input
      : parseFloat(String(input).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// ─── Lookup maps ────────────────────────────────────────────────────────────

async function categoryMap(): Promise<Map<string, string>> {
  const cats = await listCategories();
  return new Map(cats.map((c) => [c.id, c.name]));
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('finance_categories')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw new Error(`listCategories: ${error.message}`);
  return (data as Category[]) ?? [];
}

export async function addCategory(name: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const clean = name.trim();
  if (!clean) return;
  const { error } = await getSupabase()
    .from('finance_categories')
    .insert({ name: clean });
  if (error && !/duplicate/i.test(error.message)) throw new Error(`addCategory: ${error.message}`);
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('finance_categories').delete().eq('id', id);
  if (error) throw new Error(`deleteCategory: ${error.message}`);
}

// ─── Projects + BOM line items ──────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const [{ data: projects }, { data: items }, { data: expenses }] = await Promise.all([
    sb.from('finance_projects').select('*').order('created_at', { ascending: false }),
    sb.from('finance_project_items').select('project_id, budget_centavos'),
    sb.from('finance_expenses').select('project_id, amount_centavos').not('project_id', 'is', null),
  ]);
  const budgetByProject = new Map<string, number>();
  for (const it of (items as { project_id: string; budget_centavos: number }[]) ?? []) {
    budgetByProject.set(it.project_id, (budgetByProject.get(it.project_id) ?? 0) + (it.budget_centavos || 0));
  }
  const actualByProject = new Map<string, number>();
  for (const e of (expenses as { project_id: string; amount_centavos: number }[]) ?? []) {
    actualByProject.set(e.project_id, (actualByProject.get(e.project_id) ?? 0) + (e.amount_centavos || 0));
  }
  return ((projects as ProjectRow[]) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    note: p.note ?? '',
    createdAt: p.created_at,
    budgetCentavos: budgetByProject.get(p.id) ?? 0,
    actualCentavos: actualByProject.get(p.id) ?? 0,
  }));
}

export async function getProject(
  id: string,
): Promise<{ project: Project; items: ProjectItem[]; expenses: Expense[] } | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data: p } = await sb.from('finance_projects').select('*').eq('id', id).maybeSingle();
  if (!p) return null;
  const { data: itemRows } = await sb
    .from('finance_project_items')
    .select('*')
    .eq('project_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  const expenses = await listExpenses({ projectId: id });

  const actualByItem = new Map<string, number>();
  let actualTotal = 0;
  for (const e of expenses) {
    actualTotal += e.amountCentavos;
    if (e.projectItemId) actualByItem.set(e.projectItemId, (actualByItem.get(e.projectItemId) ?? 0) + e.amountCentavos);
  }
  const items: ProjectItem[] = ((itemRows as ProjectItemRow[]) ?? []).map((it) => ({
    id: it.id,
    projectId: it.project_id,
    name: it.name,
    budgetCentavos: it.budget_centavos || 0,
    actualCentavos: actualByItem.get(it.id) ?? 0,
    position: it.position ?? 0,
  }));
  const budgetTotal = items.reduce((s, it) => s + it.budgetCentavos, 0);
  const project: Project = {
    id: (p as ProjectRow).id,
    name: (p as ProjectRow).name,
    note: (p as ProjectRow).note ?? '',
    createdAt: (p as ProjectRow).created_at,
    budgetCentavos: budgetTotal,
    actualCentavos: actualTotal,
  };
  return { project, items, expenses };
}

export async function addProject(name: string, note = ''): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const clean = name.trim();
  if (!clean) return null;
  const { data, error } = await getSupabase()
    .from('finance_projects')
    .insert({ name: clean, note: note.trim() })
    .select('id')
    .single();
  if (error) throw new Error(`addProject: ${error.message}`);
  return (data as { id: string }).id;
}

export async function deleteProject(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('finance_projects').delete().eq('id', id);
  if (error) throw new Error(`deleteProject: ${error.message}`);
}

export async function addProjectItem(
  projectId: string,
  name: string,
  budgetCentavos: number,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const clean = name.trim();
  if (!clean) return;
  const { error } = await getSupabase().from('finance_project_items').insert({
    project_id: projectId,
    name: clean,
    budget_centavos: Math.max(0, Math.round(budgetCentavos)),
  });
  if (error) throw new Error(`addProjectItem: ${error.message}`);
}

export async function updateProjectItem(
  id: string,
  patch: { name?: string; budgetCentavos?: number },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.budgetCentavos !== undefined) row.budget_centavos = Math.max(0, Math.round(patch.budgetCentavos));
  if (Object.keys(row).length === 0) return;
  const { error } = await getSupabase().from('finance_project_items').update(row).eq('id', id);
  if (error) throw new Error(`updateProjectItem: ${error.message}`);
}

export async function deleteProjectItem(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('finance_project_items').delete().eq('id', id);
  if (error) throw new Error(`deleteProjectItem: ${error.message}`);
}

// ─── Recurring ──────────────────────────────────────────────────────────────

function monthlyEquivalent(amountCentavos: number, cadence: Cadence): number {
  return cadence === 'weekly' ? Math.round(amountCentavos * WEEK_MS_PER_MONTH) : amountCentavos;
}

export async function listRecurring(): Promise<Recurring[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('finance_recurring')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listRecurring: ${error.message}`);
  const cats = await categoryMap();
  return ((data as RecurringRow[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    amountCentavos: r.amount_centavos || 0,
    categoryId: r.category_id,
    categoryName: r.category_id ? cats.get(r.category_id) ?? 'Uncategorized' : 'Uncategorized',
    cadence: (r.cadence === 'weekly' ? 'weekly' : 'monthly') as Cadence,
    creditDay: r.credit_day ?? 1,
    active: r.active,
    monthlyEquivalentCentavos: monthlyEquivalent(r.amount_centavos || 0, (r.cadence === 'weekly' ? 'weekly' : 'monthly')),
    isAbono: Boolean(r.is_abono),
    paidBy: r.paid_by ?? null,
  }));
}

export async function addRecurring(input: {
  name: string;
  amountCentavos: number;
  categoryId: string | null;
  cadence: Cadence;
  creditDay: number;
  isAbono?: boolean;
  paidBy?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const clean = input.name.trim();
  if (!clean) return;
  const day = input.cadence === 'weekly'
    ? Math.min(6, Math.max(0, Math.round(input.creditDay)))
    : Math.min(31, Math.max(1, Math.round(input.creditDay)));
  const { error } = await getSupabase().from('finance_recurring').insert({
    name: clean,
    amount_centavos: Math.max(0, Math.round(input.amountCentavos)),
    category_id: input.categoryId,
    cadence: input.cadence,
    credit_day: day,
    is_abono: Boolean(input.isAbono),
    paid_by: input.paidBy ?? null,
  });
  if (error) throw new Error(`addRecurring: ${error.message}`);
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('finance_recurring').update({ active }).eq('id', id);
  if (error) throw new Error(`setRecurringActive: ${error.message}`);
}

export async function deleteRecurring(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('finance_recurring').delete().eq('id', id);
  if (error) throw new Error(`deleteRecurring: ${error.message}`);
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export async function listExpenses(filters?: {
  year?: number;
  month?: number;
  projectId?: string;
}): Promise<Expense[]> {
  if (!isSupabaseConfigured()) return [];
  let q = getSupabase().from('finance_expenses').select('*').order('spent_on', { ascending: false });
  if (filters?.projectId) q = q.eq('project_id', filters.projectId);
  if (filters?.year && filters?.month) {
    const start = `${filters.year}-${pad2(filters.month)}-01`;
    const end = `${filters.year}-${pad2(filters.month)}-${pad2(daysInMonth(filters.year, filters.month))}`;
    q = q.gte('spent_on', start).lte('spent_on', end);
  }
  const { data, error } = await q;
  if (error) throw new Error(`listExpenses: ${error.message}`);
  const rows = (data as ExpenseRow[]) ?? [];

  const cats = await categoryMap();
  // Project + item names for tagging.
  const projIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
  const itemIds = [...new Set(rows.map((r) => r.project_item_id).filter(Boolean))] as string[];
  const projNames = new Map<string, string>();
  const itemNames = new Map<string, string>();
  if (projIds.length) {
    const { data: ps } = await getSupabase().from('finance_projects').select('id, name').in('id', projIds);
    for (const p of (ps as { id: string; name: string }[]) ?? []) projNames.set(p.id, p.name);
  }
  if (itemIds.length) {
    const { data: its } = await getSupabase().from('finance_project_items').select('id, name').in('id', itemIds);
    for (const it of (its as { id: string; name: string }[]) ?? []) itemNames.set(it.id, it.name);
  }

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amountCentavos: r.amount_centavos || 0,
    categoryId: r.category_id,
    categoryName: r.category_id ? cats.get(r.category_id) ?? 'Uncategorized' : 'Uncategorized',
    spentOn: r.spent_on,
    projectId: r.project_id,
    projectName: r.project_id ? projNames.get(r.project_id) ?? 'Project' : '',
    projectItemId: r.project_item_id,
    projectItemName: r.project_item_id ? itemNames.get(r.project_item_id) ?? '' : '',
    source: (r.source as ExpenseSource) ?? 'single',
    isAbono: Boolean(r.is_abono),
    paidBy: r.paid_by ?? null,
    abonoSettled: Boolean(r.abono_settled),
  }));
}

export async function addExpense(input: {
  description: string;
  amountCentavos: number;
  categoryId: string | null;
  spentOn: string;
  projectId?: string | null;
  projectItemId?: string | null;
  isAbono?: boolean;
  paidBy?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const clean = input.description.trim();
  if (!clean) return;
  const { error } = await getSupabase().from('finance_expenses').insert({
    description: clean,
    amount_centavos: Math.max(0, Math.round(input.amountCentavos)),
    category_id: input.categoryId,
    spent_on: input.spentOn || manilaToday(),
    project_id: input.projectId ?? null,
    project_item_id: input.projectItemId ?? null,
    source: input.projectId ? 'project' : 'single',
    is_abono: Boolean(input.isAbono),
    paid_by: input.paidBy ?? null,
  });
  if (error) throw new Error(`addExpense: ${error.message}`);
}

export async function deleteExpense(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase().from('finance_expenses').delete().eq('id', id);
  if (error) throw new Error(`deleteExpense: ${error.message}`);
}

/** Correct the amount on a stored expense row (inline edit). */
export async function updateExpenseAmount(id: string, centavos: number): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('finance_expenses')
    .update({ amount_centavos: Math.max(0, Math.round(centavos)) })
    .eq('id', id);
  if (error) throw new Error(`updateExpenseAmount: ${error.message}`);
}

// ─── Accounts Payable (abono / reimbursable advances) ───────────────────────

/**
 * Everything the business owes for fronted (abono) expenses, grouped by who
 * paid. Open = not yet reimbursed (the live payable); settled = already paid
 * back (kept for backtracking / undo). The expense cost itself is untouched.
 */
export async function listAccountsPayable(): Promise<AccountsPayable> {
  const empty: AccountsPayable = { byPayer: [], totalCentavos: 0, open: [], settled: [] };
  if (!isSupabaseConfigured()) return empty;
  const sb = getSupabase();
  const today = manilaToday();
  const open: PayableItem[] = [];
  const settled: PayableItem[] = [];

  // 1) Stored abono expenses.
  const { data: expData } = await sb
    .from('finance_expenses')
    .select('id, description, amount_centavos, spent_on, paid_by, project_id, abono_settled')
    .eq('is_abono', true)
    .order('spent_on', { ascending: false });
  const expRows = (expData as ExpenseRow[]) ?? [];
  const projIds = [...new Set(expRows.map((r) => r.project_id).filter(Boolean))] as string[];
  const projNames = new Map<string, string>();
  if (projIds.length) {
    const { data: ps } = await sb.from('finance_projects').select('id, name').in('id', projIds);
    for (const p of (ps as { id: string; name: string }[]) ?? []) projNames.set(p.id, p.name);
  }
  for (const r of expRows) {
    const item: PayableItem = {
      key: `e_${r.id}`,
      kind: 'expense',
      expenseId: r.id,
      recurringId: null,
      date: r.spent_on,
      description: r.description,
      amountCentavos: r.amount_centavos || 0,
      paidBy: r.paid_by || 'Unspecified',
      projectName: r.project_id ? projNames.get(r.project_id) ?? '' : '',
      settled: Boolean(r.abono_settled),
    };
    (item.settled ? settled : open).push(item);
  }

  // 2) Recurring abono occurrences — accrue once due (date <= today), from the
  //    recurring's creation date forward. Per-occurrence settlement lives in the
  //    overrides table (also carries amount overrides / skips).
  const { data: recData } = await sb.from('finance_recurring').select('*').eq('is_abono', true);
  const recRows = (recData as RecurringRow[]) ?? [];
  if (recRows.length) {
    const { data: ovData } = await sb
      .from('finance_recurring_overrides')
      .select('recurring_id, occurrence_date, amount_centavos, skipped, abono_settled')
      .in('recurring_id', recRows.map((r) => r.id));
    const ovMap = new Map<string, OverrideRow>();
    for (const o of (ovData as OverrideRow[]) ?? []) ovMap.set(`${o.recurring_id}_${o.occurrence_date}`, o);

    const [curY, curM] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    for (const r of recRows) {
      const cadence: Cadence = r.cadence === 'weekly' ? 'weekly' : 'monthly';
      const creditDay = r.credit_day ?? 1;
      const createdDate = new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const startIdx = Number(createdDate.slice(0, 4)) * 12 + (Number(createdDate.slice(5, 7)) - 1);
      const endIdx = curY * 12 + (curM - 1);
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        for (const date of recurringOccurrences({ cadence, creditDay }, y, m)) {
          // Skip only future occurrences. We start iterating at the creation
          // MONTH, so a recurring set up mid-month still owes that month's
          // occurrence even if its credit day already passed (e.g. created the
          // 16th, bills on the 1st → this month counts).
          if (date > today) continue;
          const ov = ovMap.get(`${r.id}_${date}`);
          if (ov?.skipped) continue; // occurrence removed for that month
          const amount = ov && ov.amount_centavos != null ? ov.amount_centavos : r.amount_centavos || 0;
          const item: PayableItem = {
            key: `r_${r.id}_${date}`,
            kind: 'recurring',
            expenseId: null,
            recurringId: r.id,
            date,
            description: r.name,
            amountCentavos: amount,
            paidBy: r.paid_by || 'Unspecified',
            projectName: '',
            settled: Boolean(ov?.abono_settled),
          };
          (item.settled ? settled : open).push(item);
        }
      }
    }
  }

  open.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  settled.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const totals = new Map<string, { centavos: number; count: number }>();
  for (const it of open) {
    const cur = totals.get(it.paidBy) ?? { centavos: 0, count: 0 };
    cur.centavos += it.amountCentavos;
    cur.count += 1;
    totals.set(it.paidBy, cur);
  }
  const order = [
    ...PAYERS,
    ...[...totals.keys()].filter((p) => !(PAYERS as readonly string[]).includes(p)),
  ];
  const byPayer = order
    .filter((p) => totals.has(p))
    .map((p) => ({ payer: p, centavos: totals.get(p)!.centavos, count: totals.get(p)!.count }));
  const totalCentavos = open.reduce((s, it) => s + it.amountCentavos, 0);

  return { byPayer, totalCentavos, open, settled };
}

/** Reimburse a stored abono expense — drops it from Accounts Payable. */
export async function settleAbono(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('finance_expenses')
    .update({ abono_settled: true, abono_settled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`settleAbono: ${error.message}`);
}

/** Undo a stored abono reimbursement — puts it back into Accounts Payable. */
export async function unsettleAbono(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('finance_expenses')
    .update({ abono_settled: false, abono_settled_at: null })
    .eq('id', id);
  if (error) throw new Error(`unsettleAbono: ${error.message}`);
}

/** Reimburse (or un-reimburse) a single recurring abono occurrence. */
export async function setRecurringAbonoSettled(
  recurringId: string,
  date: string,
  settled: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('finance_recurring_overrides')
    .upsert(
      {
        recurring_id: recurringId,
        occurrence_date: date,
        abono_settled: settled,
        abono_settled_at: settled ? new Date().toISOString() : null,
      },
      { onConflict: 'recurring_id,occurrence_date' },
    );
  if (error) throw new Error(`setRecurringAbonoSettled: ${error.message}`);
}

// ─── Recurring per-occurrence overrides ─────────────────────────────────────

/**
 * Layer an exception on a single recurring occurrence (identified by its date):
 * pass amountCentavos to correct that month's amount, or skipped:true to remove
 * it from Expenses. Upserts so repeated edits replace cleanly.
 */
export async function setRecurringOverride(
  recurringId: string,
  date: string,
  patch: { amountCentavos?: number; skipped?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = { recurring_id: recurringId, occurrence_date: date };
  if (patch.amountCentavos !== undefined) {
    row.amount_centavos = Math.max(0, Math.round(patch.amountCentavos));
    row.skipped = false; // correcting an amount un-skips the occurrence
  }
  if (patch.skipped !== undefined) row.skipped = patch.skipped;
  const { error } = await getSupabase()
    .from('finance_recurring_overrides')
    .upsert(row, { onConflict: 'recurring_id,occurrence_date' });
  if (error) throw new Error(`setRecurringOverride: ${error.message}`);
}

/** Remove an override — the occurrence reverts to the recurring's default. */
export async function clearRecurringOverride(recurringId: string, date: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from('finance_recurring_overrides')
    .delete()
    .eq('recurring_id', recurringId)
    .eq('occurrence_date', date);
  if (error) throw new Error(`clearRecurringOverride: ${error.message}`);
}

/** Overrides whose occurrence falls in the given month, keyed `${id}_${date}`. */
async function listRecurringOverrides(
  year: number,
  month: number,
): Promise<Map<string, { amountCentavos: number | null; skipped: boolean; abonoSettled: boolean }>> {
  const map = new Map<string, { amountCentavos: number | null; skipped: boolean; abonoSettled: boolean }>();
  if (!isSupabaseConfigured()) return map;
  const start = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const { data, error } = await getSupabase()
    .from('finance_recurring_overrides')
    .select('recurring_id, occurrence_date, amount_centavos, skipped, abono_settled')
    .gte('occurrence_date', start)
    .lte('occurrence_date', end);
  if (error) return map;
  for (const o of (data as OverrideRow[]) ?? []) {
    map.set(`${o.recurring_id}_${o.occurrence_date}`, {
      amountCentavos: o.amount_centavos,
      skipped: o.skipped,
      abonoSettled: Boolean(o.abono_settled),
    });
  }
  return map;
}

// ─── Consolidated monthly view (stored expenses + computed recurring) ────────

/** Compute the occurrence dates (YYYY-MM-DD) of a recurring item within a month. */
function recurringOccurrences(
  r: { cadence: Cadence; creditDay: number },
  year: number,
  month: number,
): string[] {
  const dim = daysInMonth(year, month);
  if (r.cadence === 'monthly') {
    const day = Math.min(r.creditDay, dim);
    return [`${year}-${pad2(month)}-${pad2(day)}`];
  }
  // weekly — every date in the month landing on creditDay (0=Sun..6=Sat)
  const out: string[] = [];
  for (let d = 1; d <= dim; d++) {
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === r.creditDay) {
      out.push(`${year}-${pad2(month)}-${pad2(d)}`);
    }
  }
  return out;
}

export async function getMonthlyConsolidation(
  year: number,
  month: number,
): Promise<MonthlyConsolidation> {
  const [expenses, recurring, overrides] = await Promise.all([
    listExpenses({ year, month }),
    listRecurring(),
    listRecurringOverrides(year, month),
  ]);
  const today = manilaToday();
  const rows: MonthRow[] = [];

  for (const e of expenses) {
    const tag =
      e.source === 'project' && e.projectName
        ? `${e.projectName}${e.projectItemName ? ` · ${e.projectItemName}` : ''}`
        : e.categoryName;
    rows.push({
      key: `e_${e.id}`,
      date: e.spentOn,
      description: e.description,
      tag,
      source: e.source,
      amountCentavos: e.amountCentavos,
      credited: e.spentOn <= today,
      expenseId: e.id,
      recurringId: null,
      overridden: false,
      isAbono: e.isAbono,
      paidBy: e.paidBy,
      abonoSettled: e.abonoSettled,
    });
  }

  for (const r of recurring) {
    if (!r.active) continue;
    for (const date of recurringOccurrences(r, year, month)) {
      const ov = overrides.get(`${r.id}_${date}`);
      if (ov?.skipped) continue; // occurrence deleted for this month
      const amount = ov && ov.amountCentavos != null ? ov.amountCentavos : r.amountCentavos;
      rows.push({
        key: `r_${r.id}_${date}`,
        date,
        description: r.name,
        tag: `Recurring · ${r.categoryName}`,
        source: 'recurring',
        amountCentavos: amount,
        credited: date <= today,
        expenseId: null,
        recurringId: r.id,
        overridden: Boolean(ov && ov.amountCentavos != null),
        isAbono: r.isAbono,
        paidBy: r.paidBy,
        abonoSettled: Boolean(ov?.abonoSettled),
      });
    }
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first

  let projectedFull = 0;
  let actualToDate = 0;
  const bySource = { single: 0, project: 0, recurring: 0 };
  const catTotals = new Map<string, number>();
  for (const row of rows) {
    projectedFull += row.amountCentavos;
    if (row.credited) actualToDate += row.amountCentavos;
    bySource[row.source] += row.amountCentavos;
    // category bucket: recurring/single by their category tag; project rows grouped as "Projects"
    const bucket =
      row.source === 'project'
        ? 'Projects'
        : row.source === 'recurring'
          ? row.tag.replace('Recurring · ', '')
          : row.tag;
    catTotals.set(bucket, (catTotals.get(bucket) ?? 0) + row.amountCentavos);
  }
  const byCategory = [...catTotals.entries()]
    .map(([name, centavos]) => ({ name, centavos }))
    .sort((a, b) => b.centavos - a.centavos);

  return { year, month, rows, projectedFullCentavos: projectedFull, actualToDateCentavos: actualToDate, byCategory, bySource };
}

// ─── Row shapes (DB) ────────────────────────────────────────────────────────

type ProjectRow = { id: string; name: string; note: string | null; created_at: string };
type ProjectItemRow = {
  id: string;
  project_id: string;
  name: string;
  budget_centavos: number;
  position: number | null;
  created_at: string;
};
type RecurringRow = {
  id: string;
  name: string;
  amount_centavos: number;
  category_id: string | null;
  cadence: string;
  credit_day: number;
  active: boolean;
  created_at: string;
  is_abono?: boolean;
  paid_by?: string | null;
};
type ExpenseRow = {
  id: string;
  description: string;
  amount_centavos: number;
  category_id: string | null;
  spent_on: string;
  project_id: string | null;
  project_item_id: string | null;
  source: string;
  created_at: string;
  is_abono?: boolean;
  paid_by?: string | null;
  abono_settled?: boolean;
  abono_settled_at?: string | null;
};
type OverrideRow = {
  recurring_id: string;
  occurrence_date: string;
  amount_centavos: number | null;
  skipped: boolean;
  abono_settled?: boolean;
};
