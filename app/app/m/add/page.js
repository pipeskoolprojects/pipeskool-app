"use client";
import { getSession as __gs } from "@/lib/auth";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { addWorker, getContractors, getSitesList } from "@/lib/mobile";

export default function AddWorkerScreen() {
  if (typeof window !== "undefined" && !__gs()) { window.location.replace("/m"); return null; }
  const [f, setF] = useState({
    full_name: "", mobile: "", category: "plumber", labour_type: "own",
    contractor_id: "", daily_wage: "", site_id: "",
    bank_account_no: "", bank_ifsc: "", bank_holder_name: "",
  });
  const [contractors, setContractors] = useState([]);
  const [sites, setSites] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getContractors().then(setContractors);
    getSitesList().then(s => { setSites(s); if (s[0]) set("site_id", s[0].id); });
  }, []);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  async function save() {
    setErr(""); setMsg("");
    if (!f.full_name || !f.mobile || !f.daily_wage || !f.site_id) {
      setErr("Name, mobile, daily wage and site are mandatory."); return;
    }
    if (f.labour_type === "contractor" && !f.contractor_id) {
      setErr("Select the contractor for contractor labour."); return;
    }
    setBusy(true);
    const payload = {
      full_name: f.full_name, mobile: f.mobile, category: f.category,
      labour_type: f.labour_type,
      contractor_id: f.labour_type === "contractor" ? Number(f.contractor_id) : null,
      daily_wage: Number(f.daily_wage), site_id: Number(f.site_id),
      bank_account_no: f.bank_account_no || null,
      bank_ifsc: f.bank_ifsc || null,
      bank_holder_name: f.bank_holder_name || null,
    };
    const res = await addWorker(payload);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    const incomplete = !f.bank_account_no || !f.bank_ifsc;
    setMsg(`Worker saved.${incomplete ? " Profile flagged INCOMPLETE — Aadhaar/bank pending; reminders will show until completed." : ""} The worker can now log in with their mobile number and punch.`);
    setF(prev => ({ ...prev, full_name: "", mobile: "", daily_wage: "", bank_account_no: "", bank_ifsc: "", bank_holder_name: "" }));
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Add new worker</div>
          <div className="sub">Photo &amp; Aadhaar upload activate after database connection</div>
        </div>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — form works, data is not stored yet.</div>}

        <div className="m-field"><label>Full name *</label>
          <input value={f.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Worker name" /></div>
        <div className="m-field"><label>Mobile number * (unique ID — used for login)</label>
          <input inputMode="numeric" value={f.mobile} onChange={e => set("mobile", e.target.value)} placeholder="98250 00000" /></div>

        <div className="m-grid2">
          <div className="m-field"><label>Category</label>
            <select value={f.category} onChange={e => set("category", e.target.value)}>
              <option value="plumber">Plumber</option><option value="fitter">Fitter</option>
              <option value="helper">Helper</option><option value="welder">Welder</option>
              <option value="supervisor">Supervisor</option><option value="operator">Operator</option>
            </select></div>
          <div className="m-field"><label>Daily wage ₹ *</label>
            <input inputMode="numeric" value={f.daily_wage} onChange={e => set("daily_wage", e.target.value)} placeholder="800" /></div>
        </div>

        <div className="m-grid2">
          <div className="m-field"><label>Labour type</label>
            <select value={f.labour_type} onChange={e => set("labour_type", e.target.value)}>
              <option value="own">Own</option><option value="contractor">Petty contractor</option>
            </select></div>
          <div className="m-field"><label>Contractor</label>
            <select value={f.contractor_id} onChange={e => set("contractor_id", e.target.value)}
                    disabled={f.labour_type !== "contractor"}>
              <option value="">—</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        </div>

        <div className="m-field"><label>Site</label>
          <select value={f.site_id} onChange={e => set("site_id", e.target.value)}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>

        <div className="note amber">
          Aadhaar photocopy &amp; bank details are compulsory but NOT blocking —
          you can save now and complete later. Profile stays flagged until done.
        </div>

        <div className="m-field"><label>Bank account number</label>
          <input value={f.bank_account_no} onChange={e => set("bank_account_no", e.target.value)} placeholder="Account no." /></div>
        <div className="m-grid2">
          <div className="m-field"><label>IFSC</label>
            <input value={f.bank_ifsc} onChange={e => set("bank_ifsc", e.target.value)} placeholder="IFSC code" /></div>
          <div className="m-field"><label>Account holder</label>
            <input value={f.bank_holder_name} onChange={e => set("bank_holder_name", e.target.value)} placeholder="Name" /></div>
        </div>

        {err && <div className="note red">{err}</div>}
        {msg && <div className="note green">{msg}</div>}

        <button className="primary btn-block" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save worker"}
        </button>
      </div>
      <MobileNav />
    </div>
  );
}
