"use client";
// update440: public share page for a vendor enquiry (token link in WhatsApp/Email) — enquiry only, no login, no prices
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPublicEnquiry } from "@/lib/enquiry";
import { EnquiryDoc } from "@/components/EnquiryDoc";
export default function PublicEnquiry() {
  const { token } = useParams(); const [enq, setEnq] = useState(undefined);
  useEffect(() => { getPublicEnquiry(String(token)).then(setEnq); }, [token]);
  if (enq === undefined) return <div style={{ padding: 40, textAlign: "center" }}>Loading enquiry…</div>;
  if (!enq) return <div style={{ padding: 40, textAlign: "center" }}>This enquiry link is not valid.</div>;
  return <div><div className="no-print" style={{ textAlign: "center", padding: 8 }}><button onClick={() => window.print()}>🖨 Print / Save as PDF</button></div><EnquiryDoc enq={enq} /></div>;
}
