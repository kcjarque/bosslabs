'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import {
  addExpense,
  deleteExpense,
  updateExpenseAmount,
  updateExpenseDescription,
  renameRecurring,
  settleAbono,
  unsettleAbono,
  setRecurringAbonoSettled,
  setRecurringOverride,
  clearRecurringOverride,
  addCategory,
  deleteCategory,
  addPayer,
  deletePayer,
  addProject,
  deleteProject,
  addProjectItem,
  updateProjectItem,
  deleteProjectItem,
  addRecurring,
  setRecurringActive,
  deleteRecurring,
  parsePesoToCentavos,
  manilaToday,
  type Cadence,
} from '@/lib/finance';

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
}
function nullable(fd: FormData, k: string): string | null {
  const v = str(fd, k).trim();
  return v ? v : null;
}

function refresh() {
  revalidatePath('/admin/finance', 'layout');
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export async function addExpenseAction(fd: FormData) {
  requireAdmin();
  // Picking a "Paid by" person means someone fronted it → it's a payable.
  const paidBy = nullable(fd, 'paidBy');
  await addExpense({
    description: str(fd, 'description'),
    amountCentavos: parsePesoToCentavos(str(fd, 'amount')),
    categoryId: nullable(fd, 'categoryId'),
    spentOn: str(fd, 'spentOn') || manilaToday(),
    projectId: nullable(fd, 'projectId'),
    projectItemId: nullable(fd, 'projectItemId'),
    isAbono: Boolean(paidBy),
    paidBy,
    receiptUrl: nullable(fd, 'receiptUrl'),
  });
  refresh();
}

export async function settleAbonoAction(fd: FormData) {
  requireAdmin();
  if (str(fd, 'kind') === 'recurring') {
    const recurringId = nullable(fd, 'recurringId');
    const date = str(fd, 'date');
    if (recurringId && date) await setRecurringAbonoSettled(recurringId, date, true);
  } else {
    const id = str(fd, 'expenseId') || str(fd, 'id');
    if (id) await settleAbono(id);
  }
  refresh();
}

export async function unsettleAbonoAction(fd: FormData) {
  requireAdmin();
  if (str(fd, 'kind') === 'recurring') {
    const recurringId = nullable(fd, 'recurringId');
    const date = str(fd, 'date');
    if (recurringId && date) await setRecurringAbonoSettled(recurringId, date, false);
  } else {
    const id = str(fd, 'expenseId') || str(fd, 'id');
    if (id) await unsettleAbono(id);
  }
  refresh();
}

export async function deleteExpenseAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await deleteExpense(id);
  refresh();
}

/**
 * Edit a row's amount in the consolidated Expenses view. Stored expenses are
 * updated directly; recurring occurrences get a per-month override.
 */
export async function editRowAmountAction(fd: FormData) {
  requireAdmin();
  const centavos = parsePesoToCentavos(str(fd, 'amount'));
  const expenseId = nullable(fd, 'expenseId');
  if (expenseId) {
    await updateExpenseAmount(expenseId, centavos);
  } else {
    const recurringId = nullable(fd, 'recurringId');
    const date = str(fd, 'date');
    if (recurringId && date) await setRecurringOverride(recurringId, date, { amountCentavos: centavos });
  }
  refresh();
}

/**
 * Edit a row's name in the consolidated Expenses view. Stored expenses (single
 * + project) are renamed directly; a recurring row renames the subscription
 * everywhere (the name is shared across months).
 */
export async function editRowDescriptionAction(fd: FormData) {
  requireAdmin();
  const description = str(fd, 'description');
  const expenseId = nullable(fd, 'expenseId');
  if (expenseId) {
    await updateExpenseDescription(expenseId, description);
  } else {
    const recurringId = nullable(fd, 'recurringId');
    if (recurringId) await renameRecurring(recurringId, description);
  }
  refresh();
}

/** Delete a row: stored expense → removed; recurring occurrence → skipped for the month. */
export async function deleteRowAction(fd: FormData) {
  requireAdmin();
  const expenseId = nullable(fd, 'expenseId');
  if (expenseId) {
    await deleteExpense(expenseId);
  } else {
    const recurringId = nullable(fd, 'recurringId');
    const date = str(fd, 'date');
    if (recurringId && date) await setRecurringOverride(recurringId, date, { skipped: true });
  }
  refresh();
}

/** Revert a recurring occurrence to its default amount (clear the override). */
export async function resetRecurringOverrideAction(fd: FormData) {
  requireAdmin();
  const recurringId = nullable(fd, 'recurringId');
  const date = str(fd, 'date');
  if (recurringId && date) await clearRecurringOverride(recurringId, date);
  refresh();
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function addCategoryAction(fd: FormData) {
  requireAdmin();
  await addCategory(str(fd, 'name'));
  refresh();
}

export async function deleteCategoryAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await deleteCategory(id);
  refresh();
}

// ─── Payers ("Paid by" people) ───────────────────────────────────────────────
// addPayerAction is FormData-based so it serves both the settings <form> and the
// inline "+ Add person" in PaidBySelect (which posts a one-field FormData).

export async function addPayerAction(fd: FormData) {
  requireAdmin();
  await addPayer(str(fd, 'name'));
  refresh();
}

export async function deletePayerAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await deletePayer(id);
  refresh();
}

// ─── Projects + line items ──────────────────────────────────────────────────

export async function addProjectAction(fd: FormData) {
  requireAdmin();
  const id = await addProject(str(fd, 'name'), str(fd, 'note'));
  refresh();
  if (id) redirect(`/admin/finance/projects/${id}`);
}

export async function deleteProjectAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await deleteProject(id);
  refresh();
  redirect('/admin/finance/projects');
}

export async function addProjectItemAction(fd: FormData) {
  requireAdmin();
  const projectId = str(fd, 'projectId');
  if (projectId) {
    await addProjectItem(projectId, str(fd, 'name'), parsePesoToCentavos(str(fd, 'budget')));
  }
  refresh();
}

export async function updateProjectItemAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) {
    const name = str(fd, 'name').trim();
    await updateProjectItem(id, {
      ...(name ? { name } : {}), // don't blank the name if the field is empty
      budgetCentavos: parsePesoToCentavos(str(fd, 'budget')),
    });
  }
  refresh();
}

export async function deleteProjectItemAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await deleteProjectItem(id);
  refresh();
}

/** Add an expense already tagged to a project (and optionally a BOM line item). */
export async function addProjectExpenseAction(fd: FormData) {
  requireAdmin();
  const projectId = str(fd, 'projectId');
  if (projectId) {
    const paidBy = nullable(fd, 'paidBy');
    await addExpense({
      description: str(fd, 'description'),
      amountCentavos: parsePesoToCentavos(str(fd, 'amount')),
      categoryId: nullable(fd, 'categoryId'),
      spentOn: str(fd, 'spentOn') || manilaToday(),
      projectId,
      projectItemId: nullable(fd, 'projectItemId'),
      isAbono: Boolean(paidBy),
      paidBy,
    });
  }
  refresh();
}

// ─── Recurring ──────────────────────────────────────────────────────────────

export async function addRecurringAction(fd: FormData) {
  requireAdmin();
  const cadence: Cadence = str(fd, 'cadence') === 'weekly' ? 'weekly' : 'monthly';
  const paidBy = nullable(fd, 'paidBy');
  await addRecurring({
    name: str(fd, 'name'),
    amountCentavos: parsePesoToCentavos(str(fd, 'amount')),
    categoryId: nullable(fd, 'categoryId'),
    cadence,
    creditDay: Number(str(fd, 'creditDay')) || (cadence === 'weekly' ? 1 : 1),
    isAbono: Boolean(paidBy),
    paidBy,
  });
  refresh();
}

export async function setRecurringActiveAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await setRecurringActive(id, str(fd, 'active') === '1');
  refresh();
}

export async function deleteRecurringAction(fd: FormData) {
  requireAdmin();
  const id = str(fd, 'id');
  if (id) await deleteRecurring(id);
  refresh();
}
