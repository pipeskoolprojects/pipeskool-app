"use client";
// update236: thin mobile shell — the inbox itself lives in components/ApprovalsView.js and is
// shared with the desktop route /approvals. Approval rules and RPCs unchanged (188/198).
import ApprovalsView from "@/components/ApprovalsView";

export default function MobileApprovalsPage() {
  return <ApprovalsView mode="mobile" />;
}
