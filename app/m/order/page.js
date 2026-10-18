"use client";
// update464: Order Materials on the phone. Body in components/CatalogueOrder.js (shared with /order).
import MobileNav from "@/components/MobileNav";
import CatalogueOrder from "@/components/CatalogueOrder";
import { getSession } from "@/lib/auth";

export default function MobileOrder() {
  if (typeof window !== "undefined" && !getSession()) { window.location.replace("/m"); return null; }
  return (
    <div className="m-wrap" style={{ maxWidth: 1100, width: "100%", minWidth: 0, overflowX: "clip" }}>
      <CatalogueOrder mobile />
      <MobileNav />
    </div>
  );
}
