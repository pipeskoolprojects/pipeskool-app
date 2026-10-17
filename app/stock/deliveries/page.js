"use client";
// update462: Site Deliveries & Receiving (desktop / tablet). Body in components/SiteDeliveries.js (shared with /m/deliveries).
import Sidebar from "@/components/Sidebar";
import SiteDeliveries from "@/components/SiteDeliveries";

export default function SiteDeliveriesPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <SiteDeliveries />
      </main>
    </div>
  );
}
