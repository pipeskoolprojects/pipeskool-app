"use client";
// update464: Order Materials (desktop / tablet). Body in components/CatalogueOrder.js (shared with /m/order).
import Sidebar from "@/components/Sidebar";
import CatalogueOrder from "@/components/CatalogueOrder";

export default function OrderMaterialsPage() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <CatalogueOrder />
      </main>
    </div>
  );
}
