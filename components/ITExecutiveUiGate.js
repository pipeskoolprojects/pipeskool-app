"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";

import { isITExecutiveRole as isITExecutive, itLayoutFor } from "@/lib/it-ui.mjs";

export default function ITExecutiveUiGate() {
  const path = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const session = getSession();
      const enabled = isITExecutive(session?.role);
      root.classList.toggle("it-executive-ui", enabled);
      if (!enabled) {
        delete root.dataset.itTheme;
        delete root.dataset.itPlatform;
        delete root.dataset.itLayout;
        return;
      }
      const ua = navigator.userAgent || "";
      const phone = /iPhone|iPad|iPod|Android/i.test(ua) || window.innerWidth < 760;
      root.dataset.itPlatform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : "mac";
      root.dataset.itLayout = itLayoutFor(window.innerWidth, phone);
      let theme = "dark";
      try { theme = localStorage.getItem("pk-theme") || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); } catch {}
      root.dataset.itTheme = theme === "light" ? "light" : "dark";
    };
    apply();
    const onResize = () => apply();
    const onSession = () => apply();
    window.addEventListener("resize", onResize);
    window.addEventListener("storage", onSession);
    window.addEventListener("psk-session-changed", onSession);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("storage", onSession);
      window.removeEventListener("psk-session-changed", onSession);
    };
  }, [path]);

  return null;
}