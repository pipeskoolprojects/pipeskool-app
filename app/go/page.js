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
  repairs:   ["/repairs", "/m/repairs"],
  deliveries: ["/stock/deliveries", "/m/deliveries"],        // update462: site receiving
  order:     ["/order",     "/m/order"],                     // update464: catalogue ordering
  challans:  ["/stock/challans", "/stock/challans"],          // update462: office challan list (no phone shell)
  dpr:       ["/dpr",       "/m/dpr"],
  // update364: these two have NO /m/ shell, so both entries point at the same route rather
  // than sending a phone to a URL that does not exist.
  leave:     ["/leave",     "/leave"],
  tickets:   ["/tickets",   "/tickets"],
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
    const to = sp.get("to") || "money";
    const pair = ROUTES[to] || ROUTES.money;
    // update364: carry the record id through, so the module can open THAT indent / PO /
    // claim instead of dropping the person on a list to go hunting.
    const rest = new URLSearchParams();
    sp.forEach((v, k) => { if (k !== "to" && k !== "board" && !k.startsWith("f_")) rest.set(k, v); });
    const q = rest.toString();
    router.replace(pair[isMobileShell() ? 1 : 0] + (q ? "?" + q : ""));
  }, [router]);

  return <div style={{ padding: 24 }} className="muted">Opening…</div>;
}

