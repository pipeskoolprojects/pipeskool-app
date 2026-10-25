"use client";
// update464: ORDER MATERIALS (Astral catalogue, grouped by size) — one screen for phone and desktop.
// update468: quick-commerce layout (reference: pipeskool-catalog-reference.html). Phone: compact header (back · category · search · filter), a fixed left category
// rail and a two-column product grid that scroll independently, ADD pill on the picture, sizes in a bottom sheet.
// Desktop: same cards in a 4–6 column grid with a horizontal category bar; the cart opens as a side drawer.
// Material Master is the source of truth: every size is its own item_master row (own stock, own PO line); names, sizes,
// units, brands and types come from it. The cart raises an ordinary site indent through createIndent (same numbering,
// duplicate guard, BOQ-kit check, notifications). Only the ORDERED quantity is saved.
// Prices: requested only when the database says this login has Price access (update 463); site roles never get them.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSession, setCurrentSite, can } from "@/lib/auth";
import { getSitesList } from "@/lib/mobile";
import { createIndent } from "@/lib/stock";
import { useCanViewPrices } from "@/lib/prices";
import { getCatalogue, getCataloguePrices, catalogueImage, loadCatalogueImages, matchProduct, searchWords } from "@/lib/catalogue";

const PAGE = 30;
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const CART_KEY = "psk_catalogue_cart_v1";
const lab = o => o.size + (o.variant ? " · " + o.variant : "");
const loadCart = () => { try { const v = JSON.parse(sessionStorage.getItem(CART_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const saveCart = c => { try { sessionStorage.setItem(CART_KEY, JSON.stringify(c)); } catch { /* private mode */ } };
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const sizeNum = s => { const m = String(s).match(/(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/); return m ? (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) : 1e9; };
const bySize = (a, b) => sizeNum(a) - sizeNum(b) || String(a).localeCompare(String(b));
const brandKey = s => String(s || "").trim().toUpperCase();
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Card title: one size → its Material Master name; several sizes → the Master name of the first size with that size taken out
// (e.g. "Pipe - CPVC 20mm (SDR-09) [ASTRAL]" → "Pipe - CPVC (SDR-09) [ASTRAL]"); nothing is invented.
const titleOf = p => {
  const o = p.opts[0]; if (!o) return p.name;
  if (p.opts.length === 1 || !o.size || o.size === "—") return o.name;
  const t = o.name.replace(new RegExp("\\s*" + esc(o.size) + "\\b", "i"), "").replace(/\s{2,}/g, " ").trim();
  return t && t !== o.name ? t : p.name;
};
const initials = s => String(s).replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "•";

const Ico = {
  back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>,
  filter: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>,
  cart: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21 7H6" /></svg>,
  all: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg>,
};

// sheets and the toast are drawn on document.body so they sit above the ERP bottom menu and the assistant button
function Portal({ children }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  return on ? createPortal(<div className="co-portal">{children}</div>, document.body) : null;
}

function Img({ p, imgs, alt }) {
  const [bad, setBad] = useState(false);
  if (p.image && imgs === null) return <span className="co-skel" aria-hidden="true" />;   // pictures still loading
  const im = catalogueImage(p.image, imgs);
  if (im && !bad) return <img src={im.src} width={im.w || undefined} height={im.h || undefined} alt={alt || p.name} loading="lazy" decoding="async" onError={() => setBad(true)} />;
  return <span className="co-noimg" aria-label="No picture"><b>{initials(p.category || p.name)}</b></span>;   // neutral placeholder only when there is no picture
}

function Step({ value, onChange, min = 0, label, big, readOnly }) {
  const v = Number(value) || 0;
  return (
    <div className={"co-step" + (big ? " big" : "")}>
      <button type="button" aria-label="Less" onClick={() => onChange(Math.max(min, Math.round((v - 1) * 1000) / 1000))}>−</button>
      <input inputMode="decimal" value={value} readOnly={readOnly} aria-label={label || "Quantity"} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
             onBlur={() => { const n = Number(value); if (!(n >= min)) onChange(min); }} />
      <button type="button" aria-label="More" onClick={() => onChange(Math.round((v + 1) * 1000) / 1000)}>+</button>
    </div>
  );
}

// rate shown on a card: the matched size if the search / size filter picked one, else the lowest rate ("From" when sizes differ)
function cardPrice(p, prices, hit) {
  if (hit && prices[hit.item_id]?.rate != null) return { ...prices[hit.item_id], from: false };
  const xs = p.opts.map(o => prices[o.item_id]).filter(x => x?.rate != null);
  if (!xs.length) return null;
  const lo = xs.reduce((a, b) => (b.rate < a.rate ? b : a));
  return { ...lo, from: new Set(xs.map(x => x.rate)).size > 1 };
}

function ProductCard({ p, imgs, prices, showPx, hit, inCart, onAddOne, onSetQty, onOpen }) {
  const n = p.opts.length;
  const px = showPx ? cardPrice(p, prices, hit) : null;
  const off = px && px.mrp && px.mrp > px.rate && px.disc > 0 ? Math.round(px.disc) : 0;
  const one = n === 1 ? p.opts[0] : null;
  const q1 = one ? inCart[one.item_id] : 0;
  const added = p.opts.filter(o => inCart[o.item_id]).length;
  const brand = p.opts[0]?.make || "";
  const spec = [p.master ? (p.opts[0]?.material || "") : p.name, brand, one ? (one.size !== "—" ? one.size : "") : "", p.opts[0]?.unit].filter(Boolean).join(" · ");
  return (
    <article className="co-card">
      <div className="co-tile">
        <button type="button" className="co-tilebtn" aria-label={"Open " + titleOf(p)} onClick={() => onOpen(p, hit)}><Img p={p} imgs={imgs} alt={titleOf(p)} /></button>
        {one && q1 > 0
          ? <div className="co-pill on"><Step value={q1} readOnly onChange={v => onSetQty(p, one, Number(v) || 0)} label={"Quantity of " + one.name} /></div>
          : <button type="button" className="co-pill" onClick={() => (one ? onAddOne(p, one) : onOpen(p, hit))}>
              ADD{n > 1 && <small>{n} options</small>}{added > 0 && <i className="co-dot" aria-label={added + " in order"}>{added}</i>}
            </button>}
      </div>
      {px?.rate != null && (
        <div className="co-pr"><b>{px.from ? <span className="co-from">From </span> : null}{inr(px.rate)}</b><span className="co-per">/{px.per}</span>{off > 0 && <s>{inr(px.mrp)}</s>}</div>)}
      {off > 0 && <div className="co-off">{off}% OFF</div>}
      <div className="co-nm" title={titleOf(p) + " — " + spec}><b>{titleOf(p)}</b> <span>{spec}</span></div>
      {p.pending > 0 && <div className="co-pend">+{p.pending} size{p.pending > 1 ? "s" : ""} not yet in Material Master</div>}
    </article>
  );
}

function SkeletonCard() {
  return <div className="co-card co-sk" aria-hidden="true"><div className="co-tile"><span className="co-skel" /></div><i /><i className="s" /></div>;
}

// Size picker: every option is its own Material Master item; chips show size and code (and rate for price viewers).
function OptionSheet({ p, start, imgs, prices, showPx, inCart, onAdd, onClose }) {
  const [id, setId] = useState((start && p.opts.find(o => o.id === start.id)?.id) || p.opts[0]?.id);
  const [qty, setQty] = useState(1);
  const cur = p.opts.find(o => o.id === id) || p.opts[0];
  const px = showPx && cur ? prices[cur.item_id] : null;
  const many = p.opts.length > 1;
  return (
    <div className="co-modal" role="dialog" aria-modal="true" aria-label={many ? "Select size" : "Add to order"} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="co-sheet co-optsheet">
        <header><h3>{many ? "Select size" : "Add to Order"}</h3><button type="button" className="co-x" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="co-st">
          <div className="co-shp">
            <span className="co-shimg"><Img p={p} imgs={imgs} alt={titleOf(p)} /></span>
            <div className="co-shi"><b>{titleOf(p)}</b><div>{[cur?.make, cur?.unit && "Unit " + cur.unit, many && plural(p.opts.length, "size")].filter(Boolean).join(" · ")}</div></div>
          </div>
          {many && <div className="co-lbl">Size</div>}
          {many && (
            <div className="co-ochips">
              {p.opts.map(o => (
                <button key={o.id} type="button" className={"co-ochip" + (o.id === cur?.id ? " on" : "")} aria-pressed={o.id === cur?.id} onClick={() => { setId(o.id); setQty(1); }}>
                  <b>{lab(o)}</b>{o.code && <small>{o.code}</small>}
                  {showPx && prices[o.item_id]?.rate != null && <small className="co-orate">{inr(prices[o.item_id].rate)}/{prices[o.item_id].per}</small>}
                  {inCart[o.item_id] > 0 && <i className="co-dot">{inCart[o.item_id]}</i>}
                </button>))}
            </div>)}
          {cur && (
            <div className="co-sel1">
              <div className="co-sel1n">{cur.name}</div>
              <div className="co-sel1m">{[cur.code && "Code " + cur.code, cur.size !== "—" && "Size " + cur.size, "Unit " + cur.unit, cur.make && "Brand " + cur.make].filter(Boolean).join(" · ")}</div>
              {inCart[cur.item_id] > 0 && <div className="co-sel1c">✓ {inCart[cur.item_id]} {cur.unit} already in this order</div>}
            </div>)}
        </div>
        <footer>
          <div className="co-shpx">{px?.rate != null ? <><b>{inr(px.rate)}</b><span>/{px.per}</span>{px.mrp > px.rate && px.disc > 0 && <s>{inr(px.mrp)}</s>}</> : null}</div>
          <Step value={qty} min={1} onChange={setQty} label="Quantity" big />
          <button type="button" className="primary co-cta" disabled={!cur || !(Number(qty) > 0)} onClick={() => { onAdd(p, cur, Number(qty)); setQty(1); if (!many) onClose(); }}>Add to Order</button>
        </footer>
      </div>
    </div>
  );
}

function Chips({ items, value, onPick, all = "All" }) {
  return (
    <div className="co-fchips">
      <button type="button" className={"co-fchip" + (!value ? " on" : "")} aria-pressed={!value} onClick={() => onPick("")}>{all}</button>
      {items.map(([k, v]) => <button key={k} type="button" className={"co-fchip" + (value === k ? " on" : "")} aria-pressed={value === k} onClick={() => onPick(value === k ? "" : k)}>{v}</button>)}
    </div>
  );
}

export default function CatalogueOrder({ mobile = false }) {
  const [siteId, setSiteId] = useState(null);
  const [sites, setSites] = useState([]);
  const [sess, setSess] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(""); const [searchOpen, setSearchOpen] = useState(false);
  const [cat, setCat] = useState(""); const [fam, setFam] = useState(""); const [brand, setBrand] = useState(""); const [sizeF, setSizeF] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [cart, setCart] = useState([]);
  const [meta, setMeta] = useState({ required_by: "", urgency: "normal", purpose: "" });
  const [sheet, setSheet] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [sendErr, setSendErr] = useState("");
  const [prices, setPrices] = useState({});
  const [imgs, setImgs] = useState(null);
  const [toast, setToast] = useState(null);
  const canPx = useCanViewPrices();
  const loaded = useRef(false);
  const toastT = useRef(null);
  const more = useRef(null);
  const grid = useRef(null);
  const app = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const s = getSession(); setSess(s);
    setSiteId(Number(s?.currentSite || s?.sites?.[0]?.id || 0) || null);
    setCart(loadCart()); loaded.current = true;
    getSitesList().then(setSites).catch(() => setSites([]));
    getCatalogue().then(setData).catch(e => setErr(e.message || "Could not load the catalogue."));
    loadCatalogueImages().then(setImgs);
    return () => clearTimeout(toastT.current);
  }, []);
  // phone: the screen sits between the top and the ERP bottom menu, whatever its real height (large system text etc.)
  useEffect(() => {
    const el = app.current; if (!el) return;
    const nav = () => document.querySelector(".m-nav");
    const set = () => { const n = nav(); el.style.setProperty("--co-navh", (n && n.getBoundingClientRect().height ? Math.round(n.getBoundingClientRect().height) : 58) + "px"); };
    set(); const t = setTimeout(set, 600);
    window.addEventListener("resize", set);
    let ro = null; if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(set); const n = nav(); if (n) ro.observe(n); }
    return () => { clearTimeout(t); window.removeEventListener("resize", set); ro && ro.disconnect(); };
  }, [data]);
  useEffect(() => { if (loaded.current) saveCart(cart); }, [cart]);
  useEffect(() => {
    if (canPx !== true || !data?.products?.length) return;
    getCataloguePrices(data.products.flatMap(p => p.opts)).then(setPrices).catch(() => setPrices({}));
  }, [canPx, data]);
  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 30); }, [searchOpen]);

  const showPx = canPx === true;
  const isITExecutive = String(sess?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
  const words = useMemo(() => searchWords(q), [q]);
  const all = data?.products || [];
  // categories straight from the data (catalogue category, or the Material Master type for other items) — busiest first
  const cats = useMemo(() => {
    const m = new Map(); all.forEach(p => { const c = p.category || "Other"; const e = m.get(c) || { n: 0, img: null, p: null }; e.n++; if (!e.img && p.image) { e.img = p.image; e.p = p; } if (!e.p) e.p = p; m.set(c, e); });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  }, [all]);
  const fams = useMemo(() => (data?.families || []).map(f => [f, f]), [data]);
  const brands = useMemo(() => {
    const m = new Map(); all.forEach(p => p.opts.forEach(o => { const k = brandKey(o.make); if (k && !m.has(k)) m.set(k, o.make.trim()); }));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  // a search looks through every category; otherwise the rail picks the category
  const base = useMemo(() => all.filter(p => (words.length || !cat || (p.category || "Other") === cat) && (!fam || p.family === fam)
    && (!brand || p.opts.some(o => brandKey(o.make) === brand)) && matchProduct(p, words)), [all, cat, fam, brand, words]);
  const sizeList = useMemo(() => [...new Set(base.flatMap(p => p.opts.map(o => o.size)).filter(s => s && s !== "—"))].sort(bySize), [base]);
  useEffect(() => { if (sizeF && !sizeList.includes(sizeF)) setSizeF(""); }, [sizeList, sizeF]);
  const list = useMemo(() => (sizeF ? base.filter(p => p.opts.some(o => o.size === sizeF)) : base), [base, sizeF]);
  useEffect(() => { setShown(PAGE); if (grid.current) grid.current.scrollTop = 0; }, [cat, fam, brand, sizeF, q]);
  useEffect(() => {
    const el = more.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setShown(s => s + PAGE); }, { rootMargin: "500px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [list.length, shown]);
  const hitOf = p => {
    if (sizeF) return p.opts.find(o => o.size === sizeF) || null;
    if (!words.length) return null;
    return p.opts.find(o => words.some(w => o.code.toLowerCase() === w)) || p.opts.find(o => words.some(w => /\d/.test(w) && o.size.toLowerCase().startsWith(w))) || null;
  };

  const pickSite = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); setDone(null); };
  const mayRaise = !!sess && !!siteId && (sess.role === "director" || can(sess, "indent", "create", siteId) || can(sess, "indent", "manage", siteId));
  const inCart = useMemo(() => Object.fromEntries(cart.map(x => [x.item_id, Number(x.qty) || 0])), [cart]);

  function flash(text) { clearTimeout(toastT.current); setToast({ text, k: Date.now() }); toastT.current = setTimeout(() => setToast(null), 2400); }
  function addLine(p, o, n) {
    if (!(n > 0)) return;
    setDone(null); setSendErr("");
    setCart(c => {
      const ex = c.find(x => x.item_id === o.item_id);   // same Material Master item → one line, quantities added
      if (ex) return c.map(x => x === ex ? { ...x, qty: String(Math.round((Number(x.qty) + n) * 1000) / 1000) } : x);
      return [...c, { item_id: o.item_id, link_id: o.id, product: titleOf(p), label: lab(o), code: o.code, unit: o.unit, name: o.name, item_type: o.item_type, qty: String(n) }];
    });
    flash(`Added ${n} ${o.unit} · ${o.name}`);
  }
  const setQtyFor = (p, o, n) => setCart(c => (n > 0 ? c.map(x => x.item_id === o.item_id ? { ...x, qty: String(n) } : x) : c.filter(x => x.item_id !== o.item_id)));
  const setLineQty = (id, v) => setCart(c => c.map(x => x.item_id === id ? { ...x, qty: String(v) } : x));
  const removeLine = id => setCart(c => c.filter(x => x.item_id !== id));
  const est = cart.reduce((s, x) => s + (prices[x.item_id]?.rate || 0) * (Number(x.qty) || 0), 0);
  const nFilters = (fam ? 1 : 0) + (brand ? 1 : 0) + (sizeF ? 1 : 0);
  const clearFilters = () => { setFam(""); setBrand(""); setSizeF(""); };
  const goBack = () => { if (typeof window === "undefined") return; if (window.history.length > 1) window.history.back(); else window.location.href = mobile ? "/m" : "/"; };

  async function send() {
    setSendErr(""); setDone(null);
    const valid = cart.filter(x => Number(x.qty) > 0);
    if (!valid.length) { setSendErr("Add at least one size with a quantity."); return; }
    if (!siteId) { setSendErr("Pick the site first."); return; }
    if (!mayRaise) { setSendErr("You don't have the right to place orders for this site."); return; }
    setBusy(true);
    const header = { site_id: siteId, required_by: meta.required_by || null, urgency: meta.urgency, note: meta.purpose || "Ordered from the catalogue", raised_by: sess?.id || null };
    const lines = valid.map(x => ({ item_id: x.item_id, item_name: x.name, item_type: x.item_type, qty: Number(x.qty), unit: x.unit, purpose: meta.purpose || null, spec: null }));
    let res = await createIndent(header, lines);
    if (!res.ok && res.duplicate && window.confirm(`This looks like a repeat of order ${res.duplicate} — same site, mostly the same items, still open.\n\nPlace it anyway as a separate order?`)) res = await createIndent({ ...header, allow_duplicate: true }, lines);
    setBusy(false);
    if (!res.ok) { setSendErr(String(res.error || "Could not place the order.").replace(/\bindent\b/gi, "order")); return; }
    setDone(res.indent_no); setCart([]); setMeta({ required_by: "", urgency: "normal", purpose: "" }); setCartOpen(false);
  }

  const siteName = (sites.find(s => Number(s.id) === Number(siteId))?.name || "").split(",")[0];
  // update473: the separate Indent screen is retired — orders are tracked in My orders (Site deliveries & receiving)
  const ordersHref = mobile ? "/m/deliveries" : "/stock/deliveries";
  const nItems = cart.length;
  const title = words.length ? "Search results" : (cat || "All materials");
  const siteSel = <select value={siteId || ""} onChange={e => pickSite(e.target.value)} aria-label="Site">{sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}</select>;
  const catThumb = (c, e) => (e?.p ? <Img p={e.p} imgs={imgs} alt="" /> : Ico.all);

  const cartBody = (
    <>
      <label className="co-site">Site{siteSel}</label>
      <div className="co-lines">
        {!cart.length && <div className="co-empty">No items yet. Tap ADD on a material.</div>}
        {Object.entries(cart.reduce((g, x) => { (g[x.product] = g[x.product] || []).push(x); return g; }, {})).map(([prod, xs]) => (
          <div key={prod} className="co-grp"><h4>{prod}</h4>
            {xs.map(x => (
              <div key={x.item_id} className="co-ln">
                <div className="co-lt"><div className="co-ls">{x.name}</div><div className="co-lc">{x.code ? x.code + " · " : ""}{x.unit}{showPx && prices[x.item_id]?.rate != null ? " · " + inr(prices[x.item_id].rate * (Number(x.qty) || 0)) : ""}</div></div>
                <Step value={x.qty} min={0.001} onChange={v => setLineQty(x.item_id, v)} label={"Quantity of " + x.name} />
                <button type="button" className="co-rm" aria-label={"Remove " + x.name} onClick={() => removeLine(x.item_id)}>Remove</button>
              </div>))}
          </div>))}
      </div>
      {showPx && cart.length > 0 && <div className="co-tot"><span>Est. value (net list price)</span><b>{inr(est)}</b></div>}
      <div className="co-tot"><span>Lines</span><b>{cart.length}</b></div>
      <div className="co-meta">
        <label>Need by<input type="date" value={meta.required_by} onChange={e => setMeta(m => ({ ...m, required_by: e.target.value }))} /></label>
        <label>Urgency<select value={meta.urgency} onChange={e => setMeta(m => ({ ...m, urgency: e.target.value }))}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label>
        <label className="co-wide">Purpose / note<input value={meta.purpose} placeholder="e.g. Tower B 3rd floor toilets" onChange={e => setMeta(m => ({ ...m, purpose: e.target.value }))} /></label>
      </div>
      {sendErr && <div className="note red" style={{ marginTop: 8 }}>{sendErr}</div>}
      <button type="button" className="primary co-send" disabled={busy || !cart.length || !mayRaise} onClick={send}>{busy ? "Placing order…" : "Place Order"}</button>
      {!mayRaise && sess && <div className="co-sub" style={{ marginTop: 6 }}>Placing orders for this site needs the ordering right. Ask a Director.</div>}
      <div className="co-note">Only the ordered quantity is saved on the order. Dispatched and received quantities are recorded separately on the challan and the site receipt. <a href={ordersHref}>My orders</a></div>
    </>
  );

  return (
    <div ref={app} className={"co-app" + (mobile ? " co-mob" : "") + (nItems ? " co-hascart" : "") + (isITExecutive && !mobile ? " it-co-app" : "")}>
      <style>{CSS}</style>
      <header className="co-hd">
        <button type="button" className="co-ib co-back" aria-label="Back" onClick={goBack}>{Ico.back}</button>
        <div className="co-ht"><h1>{title}</h1><div className="co-hs">{data ? plural(list.length, "material") : "Loading…"}{siteName ? " · " + siteName : ""}</div></div>
        <div className="co-dk co-hsite">{siteSel}<a className="co-link" href={ordersHref}>My orders</a></div>
        <button type="button" className={"co-ib co-sbtn" + (searchOpen || q ? " on" : "")} aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen(o => !o)}>{Ico.search}</button>
        <button type="button" className={"co-ib" + (nFilters ? " on" : "")} aria-label="Filters" onClick={() => setFilterOpen(true)}>{Ico.filter}{nFilters > 0 && <i className="co-dot">{nFilters}</i>}</button>
        <button type="button" className="co-ib co-dk co-cartbtn" aria-label={`Order cart, ${plural(nItems, "item")}`} onClick={() => setCartOpen(true)}>{Ico.cart}<span>Order</span>{nItems > 0 && <i className="co-dot">{nItems}</i>}</button>
      </header>
      {isITExecutive && !mobile && <section className="it-order-overview" aria-label="Live catalogue overview">
        <div><span>Materials in view</span><strong>{data ? list.length.toLocaleString("en-IN") : "—"}</strong></div>
        <div><span>Catalogue groups</span><strong>{data ? cats.length.toLocaleString("en-IN") : "—"}</strong></div>
        <div><span>Material options</span><strong>{data ? all.reduce((n, p) => n + p.opts.length, 0).toLocaleString("en-IN") : "—"}</strong></div>
        <div><span>Order lines</span><strong>{nItems.toLocaleString("en-IN")}</strong></div>
      </section>}
      <div className={"co-sbar" + (searchOpen || q ? " open" : "")}>
        <span className="co-sico">{Ico.search}</span>
        <input ref={searchRef} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, size, brand…" aria-label="Search the catalogue" />
        {q && <button type="button" className="co-clr" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}>×</button>}
      </div>
      <div className="co-catbar" role="tablist" aria-label="Categories">
        <button type="button" role="tab" aria-selected={!cat} className={"co-cb" + (!cat ? " on" : "")} onClick={() => setCat("")}><i>{Ico.all}</i>All</button>
        {cats.map(([c, e]) => <button key={c} type="button" role="tab" aria-selected={cat === c} className={"co-cb" + (cat === c ? " on" : "")} onClick={() => setCat(c)}><i>{catThumb(c, e)}</i>{c}</button>)}
      </div>
      {(done || err || data?.error || data?.missing) && (
        <div className="co-notes">
          {done && <div className="note green" role="status">✓ Order <b>{done}</b> placed for {siteName || "the site"}. It goes for approval as usual — track it in <a href={ordersHref + "?q=" + encodeURIComponent(done)}>My orders</a>.</div>}
          {err && <div className="note red">{err}</div>}
          {data?.error && <div className="note red">{data.error}</div>}
          {data?.missing && <div className="note amber">The catalogue could not be loaded. Please try again in a moment.</div>}
        </div>)}
      <div className="co-body">
        <nav className="co-side" aria-label="Categories">
          <button type="button" className={"co-sb" + (!cat ? " on" : "")} aria-current={!cat ? "true" : undefined} onClick={() => setCat("")}><i>{Ico.all}</i><span>All</span></button>
          {cats.map(([c, e]) => <button key={c} type="button" className={"co-sb" + (cat === c ? " on" : "")} aria-current={cat === c ? "true" : undefined} onClick={() => setCat(c)}><i>{catThumb(c, e)}</i><span>{c}</span></button>)}
        </nav>
        <main className="co-grid" ref={grid}>
          {nFilters > 0 && <div className="co-active">{[fam, brands.find(b => b[0] === brand)?.[1], sizeF].filter(Boolean).map(f => <span key={f}>{f}</span>)}<button type="button" onClick={clearFilters}>Clear</button></div>}
          <div className="co-cards">
            {!data && !err && Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
            {list.slice(0, shown).map(p => { const h = hitOf(p); return <ProductCard key={p.id} p={p} imgs={imgs} prices={prices} showPx={showPx} hit={h} inCart={inCart} onAddOne={(pp, o) => addLine(pp, o, 1)} onSetQty={setQtyFor} onOpen={(pp, hh) => setSheet({ p: pp, start: hh })} />; })}
          </div>
          {data && !list.length && <div className="co-empty">No materials found.{(nFilters || q) ? <> <button type="button" className="co-reset" onClick={() => { clearFilters(); setQ(""); }}>Clear search and filters</button></> : null}</div>}
          {list.length > shown && <button type="button" ref={more} className="co-more" onClick={() => setShown(s => s + PAGE)}>Show more ({list.length - shown} left)</button>}
        </main>
      </div>
      {nItems > 0 && <div className="co-mbar"><span><b>Order · {plural(nItems, "item")}</b>{siteName ? <small>{siteName}</small> : null}</span><button type="button" className="primary" onClick={() => setCartOpen(true)}>View Cart</button></div>}
      <Portal>
      {toast && <div key={toast.k} className="co-toast" role="status" aria-live="polite"><span className="co-tick" aria-hidden="true">✓</span><span className="co-tt">{toast.text}</span></div>}
      {sheet && <OptionSheet key={sheet.p.id} p={sheet.p} start={sheet.start} imgs={imgs} prices={prices} showPx={showPx} inCart={inCart} onAdd={addLine} onClose={() => setSheet(null)} />}
      {filterOpen && (
        <div className="co-modal" role="dialog" aria-modal="true" aria-label="Filters" onClick={e => { if (e.target === e.currentTarget) setFilterOpen(false); }}>
          <div className="co-sheet co-filtsheet">
            <header><h3>Filters</h3><button type="button" className="co-x" aria-label="Close" onClick={() => setFilterOpen(false)}>×</button></header>
            <div className="co-st">
              {fams.length > 1 && <><div className="co-lbl">Range</div><Chips items={fams} value={fam} onPick={setFam} all="All ranges" /></>}
              {brands.length > 1 && <><div className="co-lbl">Brand</div><Chips items={brands} value={brand} onPick={setBrand} all="All brands" /></>}
              <div className="co-lbl">Size</div>
              {sizeList.length > 1 && sizeList.length <= 120 ? <Chips items={sizeList.map(s => [s, s])} value={sizeF} onPick={setSizeF} all="All sizes" />
                : <div className="co-sub">{sizeList.length > 120 ? "Pick a category, range or brand first to choose a size." : "Only one size in this list."}</div>}
            </div>
            <footer><button type="button" className="co-reset" onClick={clearFilters} disabled={!nFilters}>Clear all</button><button type="button" className="primary co-cta" onClick={() => setFilterOpen(false)}>Show {plural(list.length, "material")}</button></footer>
          </div>
        </div>)}
      {cartOpen && (
        <div className="co-modal co-drawer" role="dialog" aria-modal="true" aria-label="Order cart" onClick={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
          <div className="co-sheet co-cartsheet"><header><h3>Order cart · {plural(nItems, "item")}</h3><button type="button" className="co-x" aria-label="Close" onClick={() => setCartOpen(false)}>×</button></header><div className="co-st">{cartBody}</div></div>
        </div>)}
      </Portal>
    </div>
  );
}

// NB: no greater-than, ampersand or double-quote characters in this CSS — they break hydration of the inline style tag.
const CSS = `
.co-app,.co-portal{--o:var(--copper,#FF7A1A);--od:var(--copper-deep,#E2610B);--os:var(--copper-soft,#FFF2EA);--ink:var(--text,#1F2933);--mute:var(--muted,#6B7280);--tile:#F5F6FA;--line:#E7E8EB;--green:#1A8F3C;--sb:78px;--co-navh:0px;min-width:0;color:var(--ink)}
.co-hd{display:flex;align-items:center;gap:8px;min-width:0}
.co-ib{position:relative;width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:#fff;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto;color:var(--ink)}
.co-ib.on{border-color:var(--o);color:var(--od);background:var(--os)}
.co-ht{flex:1 1 auto;min-width:0}
.co-ht h1{font-size:17px;font-weight:750;margin:0;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.co-hs{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.co-dot{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--o);color:#fff;font-size:10.5px;font-weight:700;font-style:normal;line-height:18px;text-align:center;box-sizing:border-box}
.co-sbar{display:none;position:relative;align-items:center;min-width:0}
.co-sbar.open{display:flex}
.co-sico{position:absolute;left:12px;color:var(--mute);display:flex;pointer-events:none}
.co-sbar input{width:100%;min-width:0;height:42px;border:1px solid var(--line);border-radius:10px;padding:0 40px 0 38px;font-size:15px;box-sizing:border-box;-webkit-appearance:none;appearance:none}
.co-sbar input::-webkit-search-cancel-button{display:none}
.co-clr{position:absolute;right:5px;width:32px;height:32px;border:0;border-radius:50%;background:var(--tile);font-size:19px;line-height:1;padding:0;color:var(--mute)}
.co-notes{padding:0 0 6px}
.co-body{display:flex;min-width:0}
.co-side{display:none}
.co-grid{flex:1 1 auto;min-width:0}
.co-active{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px}
.co-active span{font-size:12px;background:var(--os);color:var(--od);border-radius:999px;padding:3px 10px;font-weight:600}
.co-active button{border:0;background:none;color:var(--od);font-size:12.5px;font-weight:700;padding:3px 4px}
.co-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:20px 16px;align-content:start}
.co-card{min-width:0;display:flex;flex-direction:column}
.co-tile{position:relative;aspect-ratio:4/3;background:var(--tile);border-radius:10px;overflow:hidden;flex:0 0 auto}
.co-tilebtn{all:unset;position:absolute;inset:0;padding:8px 8px 22px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;cursor:pointer}
.co-tilebtn img{display:block;width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply}
.co-noimg{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#fff;border:1px solid var(--line);color:var(--mute);font-size:15px}
.co-skel{display:block;width:100%;height:100%;border-radius:8px;background:linear-gradient(90deg,#EEF0F4 25%,#E4E7EC 50%,#EEF0F4 75%);background-size:200% 100%;animation:co-sh 1.3s linear infinite}
@keyframes co-sh{from{background-position:200% 0}to{background-position:-200% 0}}
.co-sk i{display:block;height:11px;border-radius:6px;background:#EEF0F3;margin-top:9px}.co-sk i.s{width:60%}
.co-pill{position:absolute;right:6px;bottom:6px;min-width:62px;background:#fff;border:1.5px solid var(--o);color:var(--od);border-radius:9px;font-weight:800;font-size:13px;line-height:1.1;padding:6px 12px;text-align:center;box-shadow:0 1px 3px rgba(15,20,25,.08);overflow:visible}
.co-pill small{display:block;font-size:9.5px;font-weight:600;background:var(--os);margin:4px -12px -6px;padding:2px 0 3px;border-radius:0 0 7px 7px;color:var(--od)}
.co-pill .co-dot{top:-8px;right:-6px}
.co-pill.on{padding:0;border:0;background:var(--o);min-width:0}
.co-step{display:flex;align-items:center;border-radius:9px;overflow:hidden;background:var(--o);color:#fff}
.co-step button{width:30px;height:32px;border:0;border-radius:0;background:transparent;color:#fff;font-size:18px;font-weight:700;padding:0}
.co-step input{width:30px;height:32px;border:0;border-radius:0;background:transparent;color:#fff;text-align:center;font-weight:800;font-size:14px;padding:0;min-width:0}
.co-step.big button{width:38px;height:44px}.co-step.big input{width:40px;height:44px;font-size:16px}
.co-pr{margin-top:8px;display:flex;align-items:baseline;flex-wrap:wrap;gap:0 4px;line-height:1.2}
.co-pr b{font-size:17px;font-weight:800}.co-from{font-size:11.5px;font-weight:600;color:var(--mute)}
.co-per{font-size:11.5px;color:var(--mute)}
.co-pr s,.co-shpx s{font-size:11.5px;color:var(--mute)}
.co-off{font-size:12px;font-weight:800;color:var(--green);margin-top:1px}
.co-nm{font-size:13px;line-height:1.35;margin-top:5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.co-nm b{font-weight:600}.co-nm span{color:var(--mute)}
.co-pend{font-size:11px;color:var(--mute);margin-top:3px}
.co-more{width:100%;margin-top:16px;min-height:42px}
.co-empty{color:var(--mute);font-size:13px;padding:30px 4px;text-align:center}
.co-reset{border:0;background:none;color:var(--od);font-weight:700;font-size:13px;padding:6px 4px}
.co-reset:disabled{color:var(--mute)}
.co-mbar{position:fixed;z-index:120;right:84px;bottom:calc(18px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:12px;background:var(--deep,#1F2933);color:#fff;border-radius:14px;padding:8px 8px 8px 14px;box-shadow:0 8px 24px rgba(15,20,25,.22);max-width:calc(100vw - 24px);box-sizing:border-box}
.co-mbar span{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.co-mbar b{font-size:14px;white-space:nowrap}.co-mbar small{font-size:11px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.co-mbar button{min-height:40px;padding:8px 16px;font-weight:700;border-radius:10px;white-space:nowrap;flex:0 0 auto}
.co-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:230;display:flex;align-items:center;gap:10px;max-width:min(460px,calc(100vw - 24px));width:max-content;box-sizing:border-box;background:#0F1419;color:#fff;border-radius:12px;padding:10px 14px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:co-in .18s ease-out}
.co-tick{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--green);font-size:13px;flex:0 0 auto}
.co-tt{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@keyframes co-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.co-modal{position:fixed;inset:0;background:rgba(15,20,25,.5);z-index:220;display:flex;align-items:flex-end;justify-content:center}
.co-sheet{background:#fff;width:100%;max-width:520px;max-height:86vh;border-radius:16px 16px 0 0;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);animation:co-up .2s ease-out}
@keyframes co-up{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
.co-sheet header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px;gap:8px}
.co-sheet h3{margin:0;font-size:16px;font-weight:750}
.co-x{border:0;background:var(--tile);border-radius:50%;font-size:22px;line-height:1;width:34px;height:34px;padding:0;color:var(--mute)}
.co-st{overflow:auto;padding:4px 16px 12px;min-height:0}
.co-sheet footer{display:flex;align-items:center;gap:10px;padding:12px 16px 14px;border-top:1px solid var(--line)}
.co-shp{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.co-shimg{width:64px;height:48px;border-radius:8px;background:var(--tile);display:flex;align-items:center;justify-content:center;padding:4px;box-sizing:border-box;flex:0 0 auto;overflow:hidden}
.co-shimg img{width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply}.co-shimg .co-noimg{width:36px;height:36px;font-size:12px}
.co-shi{min-width:0}.co-shi b{font-size:14px;line-height:1.3;display:block}.co-shi div{font-size:12.5px;color:var(--mute);margin-top:2px}
.co-lbl{font-size:12px;color:var(--mute);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:4px 0 8px}
.co-ochips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.co-ochip{position:relative;border:1px solid var(--line);border-radius:10px;padding:7px 12px;font-size:13px;background:#fff;text-align:left;min-height:44px;line-height:1.25;max-width:100%}
.co-ochip b{font-weight:700;display:block}.co-ochip small{display:block;font-size:10.5px;color:var(--mute)}
.co-ochip .co-orate{color:var(--ink);font-weight:600}
.co-ochip.on{border-color:var(--o);background:var(--os);box-shadow:inset 0 0 0 1px var(--o)}.co-ochip.on b{color:var(--od)}
.co-sel1{background:var(--tile);border-radius:10px;padding:10px 12px;font-size:12.5px}
.co-sel1n{font-weight:700;font-size:13.5px;overflow-wrap:anywhere}.co-sel1m{color:var(--mute);margin-top:3px;overflow-wrap:anywhere}.co-sel1c{color:var(--green);font-weight:700;margin-top:5px}
.co-shpx{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;gap:4px;flex-wrap:wrap}.co-shpx b{font-size:18px}.co-shpx span{font-size:12px;color:var(--mute)}
.co-cta{min-height:44px;padding:0 18px;border-radius:10px;font-weight:800;font-size:14.5px;white-space:nowrap}
.co-filtsheet footer{justify-content:space-between}
.co-fchips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.co-fchip{border:1px solid var(--line);border-radius:999px;padding:7px 13px;font-size:13px;background:#fff;min-height:36px}
.co-fchip.on{border-color:var(--o);background:var(--os);color:var(--od);font-weight:700}
.co-site{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--mute);margin:2px 0 8px}
.co-site select{width:100%;min-width:0;min-height:40px}
.co-lines{margin:6px 0 10px}
.co-grp h4{font-size:12.5px;margin:10px 0 4px}
.co-ln{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;align-items:center;padding:7px 0;border-bottom:1px dashed var(--line)}
.co-ls{font-weight:600;font-size:13px;overflow-wrap:anywhere}.co-lc{font-size:12px;color:var(--mute);overflow-wrap:anywhere}
.co-rm{grid-column:1/-1;justify-self:start;border:0;background:none;color:var(--red,#b91c1c);font-size:12.5px;padding:0}
.co-tot{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
.co-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.co-meta label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mute);min-width:0}
.co-meta input,.co-meta select{width:100%;box-sizing:border-box;min-height:40px}
.co-wide{grid-column:1/-1}
.co-send{width:100%;margin-top:12px;min-height:46px;font-weight:800;font-size:15px}
.co-note{font-size:11.5px;color:var(--mute);margin-top:8px}
.co-sub{color:var(--mute);font-size:12.5px}
@media (min-width:700px){.co-modal{align-items:center}.co-sheet{border-radius:16px}.co-drawer{justify-content:flex-end;align-items:stretch}.co-drawer .co-sheet{max-height:none;height:100%;max-width:440px;border-radius:0}}
/* desktop and tablet */
@media (min-width:601px){
  .co-app{max-width:1600px;margin:0 auto}
  .co-hd{flex-wrap:wrap;gap:10px;margin-bottom:12px}
  .co-back{display:none}
  .co-ht h1{font-size:21px}
  .co-hsite{display:flex;align-items:center;gap:10px;min-width:0}
  .co-hsite select{width:auto;max-width:240px;min-height:38px;min-width:0}
  .co-link{font-size:13.5px;font-weight:600;color:var(--od);white-space:nowrap}
  .co-cartbtn{width:auto;border-radius:10px;padding:0 12px;gap:6px;font-weight:700;font-size:13px}
  .co-sbtn{display:none}
  .co-sbar{display:flex;margin-bottom:10px}
  .co-catbar{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;scrollbar-width:thin;min-width:0}
  .co-cb{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:4px 14px 4px 4px;font-size:13px;background:#fff;flex:0 0 auto;min-height:38px}
  .co-cb i{width:28px;height:28px;border-radius:50%;background:var(--tile);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto;color:var(--mute)}
  .co-cb i img{width:100%;height:100%;object-fit:cover}.co-cb i svg{width:16px;height:16px}.co-cb i .co-noimg{width:28px;height:28px;font-size:10px;border:0}
  .co-cb.on{background:var(--o);border-color:var(--o);color:#fff;font-weight:700}
  .co-hascart .co-grid{padding-bottom:70px}
}
@media (min-width:1280px){.co-cards{grid-template-columns:repeat(auto-fill,minmax(max(190px,calc((100% - 80px) / 6)),1fr))}}
/* phone: full-height shop screen between the top of the screen and the ERP bottom menu */
@media (max-width:600px){
  .co-app{position:fixed;left:0;right:0;top:0;bottom:var(--co-navh,58px);z-index:90;background:#fff;display:flex;flex-direction:column;overflow:hidden}
  .co-hd{flex:0 0 auto;min-height:58px;padding:8px 58px 8px 10px;background:linear-gradient(#FFF1E4,#fff);padding-top:calc(8px + env(safe-area-inset-top,0px))}
  .co-dk,.co-catbar{display:none}
  .co-sbar.open{flex:0 0 auto;margin:0 10px 8px}
  .co-notes{flex:0 0 auto;padding:0 10px 6px;max-height:30vh;overflow:auto}
  .co-body{flex:1 1 auto;min-height:0}
  .co-side{display:block;width:var(--sb);flex:0 0 var(--sb);overflow-y:auto;overscroll-behavior:contain;border-right:1px solid var(--line);padding:4px 0 90px;box-sizing:border-box;scrollbar-width:none}
  .co-side::-webkit-scrollbar{display:none}
  .co-sb{all:unset;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:8px 3px;box-sizing:border-box;font-size:11px;line-height:1.2;text-align:center;color:var(--mute);cursor:pointer;overflow-wrap:anywhere}
  .co-sb i{width:50px;height:50px;border-radius:50%;background:var(--tile);border:1.5px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;font-style:normal;color:var(--mute);box-sizing:border-box}
  .co-sb i img{width:100%;height:100%;object-fit:cover}.co-sb i .co-noimg{width:100%;height:100%;border:0;font-size:13px}
  .co-sb span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:100%}
  .co-sb.on{color:var(--ink);font-weight:700}
  .co-sb.on i{border:2px solid var(--o);box-shadow:0 0 0 2px var(--os)}
  .co-sb.on{background:linear-gradient(var(--o),var(--o)) right 10px / 3px calc(100% - 20px) no-repeat}
  .co-grid{overflow-y:auto;overscroll-behavior:contain;padding:8px 8px 96px;box-sizing:border-box;-webkit-overflow-scrolling:touch}
  .co-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 8px}
  .co-pr b{font-size:16px}
  .co-mbar{left:12px;right:78px;bottom:12px;justify-content:space-between;margin:0 auto;max-width:420px}
  .co-mob .co-mbar,.co-app.co-mob .co-mbar{bottom:12px}
  .co-mbar{position:absolute}
  .co-toast{width:calc(100vw - 24px);bottom:calc(var(--co-toastb,140px) + env(safe-area-inset-bottom,0px))}
}
`;