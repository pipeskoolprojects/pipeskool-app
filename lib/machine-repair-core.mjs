export const REPAIR_MAX_MACHINES = 20;
export const REPAIR_TABS = ["All", "Requested", "With vendor", "Received"];
export function deriveRepairStatus(request, machines = []) {
  if (!request?.sent_at) return "Requested";
  const received = machines.filter(m => m.received_at).length;
  if (received === machines.length && machines.length) return "Received";
  return received ? "Partially received" : "Sent to vendor";
}
export function repairTabMatches(tab, status) {
  if (tab === "All") return true;
  if (tab === "With vendor") return status === "Sent to vendor" || status === "Partially received";
  if (tab === "Requested") return status === "Requested";
  return status === "Received";
}
export function paginateRepairMachines(machines, pageSize = 4) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 4));
  const rows = [];
  for (let i = 0; i < machines.length; i += size) rows.push(machines.slice(i, i + size));
  return rows;
}
export function incompleteRepairMachines(machines) {
  return machines.map((m, i) => ({ number: i + 1, missing: [
    !m.photo && !m.photo_url ? "photo" : null,
    !String(m.name || "").trim() ? "name" : null,
    !String(m.problem || "").trim() ? "problem" : null,
  ].filter(Boolean) })).filter(x => x.missing.length);
}
export function repairRequestLabel(n) { return String(n || "Requested"); }
