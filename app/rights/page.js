"use client";
// update377: this page read permission_catalog, a table that does not exist in the database,
// so its rights panel was always empty — on the phone AND on the desktop. /access is the
// Access Rights screen that works (per-site rights, role defaults, copy between sites).
// Anything still linking here lands there.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RightsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/access"); }, [router]);
  return <div style={{ padding: 24 }} className="muted">Opening Access Rights…</div>;
}
