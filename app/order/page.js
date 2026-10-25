"use client";
// update464: Order Materials (desktop / tablet). Body in components/CatalogueOrder.js (shared with /m/order).
import Sidebar from "@/components/Sidebar";
import CatalogueOrder from "@/components/CatalogueOrder";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";

export default function OrderMaterialsPage() {
  const [session, setSession] = useState(null);
  useEffect(() => { setSession(getSession()); }, []);
  const isITExecutive = String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
  return (
    <div className={"layout" + (isITExecutive ? " it-page it-page-order" : "")}>
      <Sidebar />
      <main className="main">
        <CatalogueOrder />
      </main>
    </div>
  );
}