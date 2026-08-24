"use client";
// update201: stable top-level collapsible card. The previous Section was declared INSIDE
// the page component — React treats a re-created component type as a brand-new element
// every render, remounting the subtree and (depending on build) breaking the toggle.
// This one is a plain top-level component driven purely by props, with an explicit
// type="button" and conditional rendering, so View/Hide always works.
export default function CollapseCard({ htmlId, open, onToggle, icon, title, sub, stats, accent, keepMounted, children }) {
  return (
    // update210: overflow:hidden here TRAPPED wheel/touch scrolling (it consumed the scroll
    // hand-off from the tables' internal scroller) and hid the horizontal bar that reaches
    // the right-side action columns. The card no longer clips; the content strip scrolls X.
    <div id={htmlId} className="panel" style={{ padding: 0, overflowX: "visible", scrollMarginTop: 70, ...(accent ? { borderLeft: "4px solid " + accent } : {}) }}>
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ fontSize: 20 }}>{icon}</div>
        <div style={{ minWidth: 150 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {sub && <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {(stats || []).map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 10.5 }}>{l}</div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: c || "var(--text)" }}>{v}</div>
            </div>
          ))}
          <button type="button" style={{ fontSize: 12, whiteSpace: "nowrap" }}
            onClick={e => { e.stopPropagation(); onToggle(); }}>{open ? "Hide ▲" : "View ▼"}</button>
        </div>
      </div>
      {keepMounted
        ? <div hidden={!open} style={{ padding: "0 16px 16px", overflowX: "auto" }}>{children}</div>
        : open && <div style={{ padding: "0 16px 16px", overflowX: "auto" }}>{children}</div>}
    </div>
  );
}
