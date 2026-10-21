export function approvedExpenseTotal(expenses, month) {
  if (!Array.isArray(expenses)) return null;
  return expenses
    .filter(row => String(row.expense_date || row.date || "").slice(0, 7) === month && row.status === "approved")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

export function countOpenIndents(indents) {
  if (!Array.isArray(indents)) return null;
  return indents.filter(row => ["open", "pending", "quoting"].includes(String(row.status || "").toLowerCase())).length;
}

export function progressPercent(done, boq) {
  const total = Number(boq);
  if (!Number.isFinite(total) || total <= 0) return null;
  const complete = Number(done || 0);
  if (!Number.isFinite(complete)) return null;
  return Math.max(0, Math.min(100, Math.round(complete / total * 100)));
}
