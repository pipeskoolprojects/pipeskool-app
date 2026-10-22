"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PunchScreen from "@/app/m/page";

export default function DesktopPunchPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const checkWidth = () => {
      const isPhone = window.innerWidth <= 820;
      setMobile(isPhone);
      if (isPhone) router.replace("/m");
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, [router]);

  if (mobile) return null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main" style={{ padding: "24px clamp(16px, 3vw, 40px)", background: "#f5f7fa", minHeight: "100vh" }}>
        <div className="psk-desktop-punch">
          <PunchScreen />
        </div>
      </main>
      <style jsx global>{`
        .psk-desktop-punch .m-wrap {
          width: min(100%, 960px);
          max-width: 960px;
          min-height: calc(100vh - 48px);
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 8px 28px rgba(15, 23, 42, .08);
          overflow: hidden;
        }
        .psk-desktop-punch .m-head { padding: 22px 28px 18px; }
        .psk-desktop-punch .m-body {
          width: min(100%, 580px);
          box-sizing: border-box;
          margin: 28px auto;
          padding: 26px 30px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 2px 12px rgba(15, 23, 42, .05);
        }
        .psk-desktop-punch nav.m-nav { display: none !important; }
        @media (max-width: 820px) {
          .psk-desktop-punch .m-wrap { width: 100%; min-height: 100dvh; border: 0; border-radius: 0; box-shadow: none; }
          .psk-desktop-punch .m-body { width: auto; margin: 0; padding: 16px; border: 0; border-radius: 0; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
