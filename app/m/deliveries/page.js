"use client";
// update462: Site Deliveries & Receiving on the phone (installed app / mobile browser).
import MobileNav from "@/components/MobileNav";
import SiteDeliveries from "@/components/SiteDeliveries";
import { getSession } from "@/lib/auth";

export default function MobileDeliveries() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  return (
    <div className="m-wrap" style={{ maxWidth: 760 }}>
      <SiteDeliveries mobile />
      <MobileNav />
    </div>
  );
}
