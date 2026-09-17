"use client";
// update396: Attendance Rules now lives as the "Rules" tab of /calendar — keep old links working.
import { useEffect } from "react";
export default function RulesRedirect() {
  useEffect(() => { window.location.replace("/calendar?tab=rules"); }, []);
  return null;
}
