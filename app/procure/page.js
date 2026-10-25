"use client";
// update243: thin route wrapper. The page body lives in components/ProcureView.js so the SAME
// component renders here and inside a project tab. No iframes.
// update283: on PHONES the page splits into two tabs — Indents | Purchase Orders — mirroring the
// project workspace's separation (the `only` prop ProcureView has supported since 243). Desktop
// stays exactly as it was: one page, both sections. Same for Director and Staff.
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ProcureView from "@/components/ProcureView";
import { getSession } from "@/lib/auth";

export default function ProcurePage() {
  const [mobile, setMobile] = useState(false);
  const [mtab, setMtab] = useState("indents");   // indents | po
  const [session, setSession] = useState(null);
  useEffect(() => {
    setSession(getSession());
    // update284: deep links from the Home tiles — /procure?tab=po | ?tab=indents
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "po" || t === "indents") setMtab(t);
    const mq = window.matchMedia("(max-width: 820px)");
    const on = () => setMobile(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const isITExecutive = String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
  return (
    <div className={"layout" + (isITExecutive ? " it-page it-page-procure" : "")}>
      <Sidebar />
      <main className="main">
        {mobile && (
          <div className="mw-tabs it-procure-tabs" style={{ marginBottom: 10 }}>
            <button className={mtab === "indents" ? "active" : ""} onClick={() => setMtab("indents")}>📝 Orders</button>
            <button className={mtab === "po" ? "active" : ""} onClick={() => setMtab("po")}>📄 Purchase Orders</button>
          </div>
        )}
        <ProcureView key={mobile ? mtab : "all"} only={mobile ? mtab : "all"} />
      </main>
    </div>
  );
}