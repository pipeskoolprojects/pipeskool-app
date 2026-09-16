"use client";
// update374: THE BOTTOM BAR, EVERYWHERE ON A PHONE.
//
// MobileNav was mounted page by page, and only inside /m/*. Every desktop route — Expenses,
// Procurement, Vendors, Workers, Access Rights, Tasks — renders the sidebar layout with no
// bar, so on a phone it vanished the moment you tapped a Quick Access tile. Home was the
// only way back.
//
// This mounts ONCE, in the root layout, and decides at runtime:
//   · a phone-sized viewport (or the installed app)  -> show the bar
//   · a /m/* page                                    -> skip; those pages mount their own
//   · /login, /go, print/slip routes                 -> skip; nothing to navigate from
// It also pads the bottom of the page so content is never hidden behind the bar.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { getSession } from "@/lib/auth";

const NO_BAR = [/^\/login/, /^\/go(\b|\/)/, /\/print(\b|\/)/, /\/slip(\b|\/)/, /^\/workers\/profile/, /^\/letters\/print/,
  /^\/purchase\/po(\b|\/)/, /^\/expenses\/voucher/, /^\/expenses\/advance-voucher/];   // update390: documents — no app chrome

export default function GlobalMobileNav() {
  const path = usePathname() || "/";
  const [show, setShow] = useState(false);

  useEffect(() => {
    const decide = () => {
      if (typeof window === "undefined") return;
      const phone = window.innerWidth <= 820 || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
      const ownBar = path.startsWith("/m/") || path === "/m";
      const excluded = NO_BAR.some(rx => rx.test(path));
      const loggedIn = !!getSession();
      setShow(phone && !ownBar && !excluded && loggedIn);
    };
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, [path]);

  useEffect(() => {
    // room for the bar — applied to the document, so every page layout gets it without edits
    document.body.classList.toggle("has-global-mnav", show);
    return () => document.body.classList.remove("has-global-mnav");
  }, [show]);

  if (!show) return null;
  return <MobileNav />;
}
