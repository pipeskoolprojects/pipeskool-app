// update475: single definition of "who gets the IT Executive UI" — used by the gate, the sidebar and the phone nav,
// and by tests. Role strings in the database vary in case/underscores ("it_executive", "IT Executive").
export const isITExecutiveRole = role => String(role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
// layout bucket shared by the gate and the shell CSS ([data-it-layout])
export const itLayoutFor = (width, nativePhone = false) => (nativePhone || width < 760) ? "phone" : width < 1100 ? "tablet" : "desktop";
