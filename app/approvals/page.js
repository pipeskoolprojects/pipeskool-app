"use client";
// update236: DESKTOP APPROVALS — the one screen that shows every pending request together.
// Before 236 this existed only at /m/approvals, which is capped at 430px by .m-wrap, so on a
// desktop browser it rendered as a narrow strip in a sea of white. Same component, real shell.
import Sidebar from "@/components/Sidebar";
import ApprovalsView from "@/components/ApprovalsView";

export default function ApprovalsPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <ApprovalsView mode="desk" />
      </main>
    </div>
  );
}
