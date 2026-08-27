"use client";
// update238: ONE definition of "who may approve what", for the whole app.
//
// This file is a MIRROR of the database rules — it is not the enforcement. Enforcement lives in
// RLS policies and SECURITY DEFINER functions (pipeskool_approvals_lockdown.sql). This exists so
// the UI stops offering buttons that the database will refuse, and so every screen asks the same
// question the same way. Before 238 each screen had its own slightly different check, which is
// exactly how the Approvals inbox shipped with no check at all.
//
// If you change a rule here you MUST change the matching DB rule, and vice versa.
// The pairing, module by module:
//
//   money   -> RLS exp_update / adv_update, fn_approve_petty, fn_confirm_petty_return
//              = director OR money.approve|manage OR wages.approve|manage
//   leave   -> RLS on leave_approvals insert
//              = director OR leave.approve|manage
//   indent  -> fn_po_approve  ... DIRECTOR ONLY, hard-coded in the function.
//              Granting a non-director indent.approve does NOT let them approve a PO; the RPC
//              still refuses. So this mirror says director-only too, rather than showing a
//              button that always errors. To delegate PO approval, fn_po_approve must change.
//   stock   -> fn_approve_item (new in 238)
//              = director OR stock.approve|manage
//
import { canAnySite, hasAdminCap } from "@/lib/auth";

export const APPROVAL_MODULES = ["money", "leave", "indent", "stock"];

export const APPROVAL_MODULE_LABEL = {
  money: "Petty cash, expense claims, salary advances, cash returns",
  leave: "Leave requests",
  indent: "Purchase orders",
  stock: "New items awaiting review",
};

// update238: VIEW-ONLY money access. Accountants and IT Executives hold the
// view_all_money capability (update162, Director decision 8 Aug). They may READ pending
// money records across every site; they may never approve or reject anything. This
// mirrors the pending branch of fn_approval_row_visible() in the database.
export function canViewPendingMoney(session) {
  if (!session) return false;
  return canApprove(session, "money") || hasAdminCap(session, "view_all_money");
}

export function canApprove(session, module) {
  if (!session) return false;
  if (session.role === "director") return true;
  switch (module) {
    case "money":
      return canAnySite(session, "money", "approve") || canAnySite(session, "money", "manage")
          || canAnySite(session, "wages", "approve") || canAnySite(session, "wages", "manage");
    case "leave":
      return canAnySite(session, "leave", "approve") || canAnySite(session, "leave", "manage");
    case "indent":
      return false;   // fn_po_approve is director-only — see the note above
    case "stock":
      return canAnySite(session, "stock", "approve") || canAnySite(session, "stock", "manage");
    default:
      return false;
  }
}

// may this person ACT on anything?
export function canApproveAny(session) {
  return APPROVAL_MODULES.some(m => canApprove(session, m));
}

// may this person OPEN the Approvals inbox at all? (approvers, plus money viewers)
export function canOpenApprovals(session) {
  return canApproveAny(session) || canViewPendingMoney(session);
}

// which sections of the inbox they may see, as one object
export function approvalRights(session) {
  const money = canApprove(session, "money");
  const moneyView = canViewPendingMoney(session);
  return {
    money,                                // may approve/reject money items
    moneyView,                            // may SEE pending money (approvers + view_all_money)
    leave: canApprove(session, "leave"),
    indent: canApprove(session, "indent"),
    stock: canApprove(session, "stock"),
    any: canApproveAny(session),          // may act on something
    open: canOpenApprovals(session),      // may open the inbox at all
    viewerOnly: moneyView && !canApproveAny(session),
  };
}
