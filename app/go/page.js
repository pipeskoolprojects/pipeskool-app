"use client";
// update353: NOTIFICATION LANDING. A notification link is written when the notification is
// SENT — on the server, which cannot know whether it will be opened on a phone or a laptop.
// So the link no longer names a screen; it names a DESTINATION, and this page picks the
// shell once it is actually running on the device.
//
// It also rescues links already sitting in the notifications table. Every expense, advance
// and petty notification sent before today stored "/expenses" — the desktop money page —
// and those rows are not going to rewrite themselves. The service worker and the in-app
// bell both send legacy links here, so old notifications land in the right place too.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// destination -> [ desktop route, mobile route ]
export const ROUTES = {
  approvals: ["/approvals", "/m/approvals"],
  money:     ["/expenses",  "/m/money"],
  tasks:     ["/tasks",     "/m/tasks"],
  indent:    ["/procure",   "/m/indent"],
  stock:     ["/stock",     "/m/stock"],
  dpr:       ["/dpr",       "/m/dpr"],
};

export function isMobileShell() {
  if (typeof window === "undefined") return false;
  // the installed Android app launches at /m and runs standalone; a narrow window is a phone
  // browser. Either one wants the mobile shell.
  const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  return standalone || window.innerWidth <= 760 || window.location.pathname.startsWith("/m");
}

export default function Go() {
  const router = useRouter();
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const to = sp.get("to") || "approvals";
    const pair = ROUTES[to] || ROUTES.approvals;
    router.replace(pair[isMobileShell() ? 1 : 0]);
  }, [router]);

  return <div style={{ padding: 24 }} className="muted">Opening…</div>;
}
