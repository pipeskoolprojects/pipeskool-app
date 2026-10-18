"use client";
// update464: ORDER MATERIALS (Astral catalogue, grouped by size) — one screen for phone and desktop.
// update465: shop-style layout — 4:3 picture boxes, cart count in the header, search clear button, brand / size
// filters, collapsible size chips, "Added" toast, phone cards with the picture on the left and a cart bar above the nav.
// update466: layout re-proportioned — catalogue ~74% / cart clamp(280px,26%,340px), cards 220–310 px (3–4 per row),
// pictures fill a full-width 4:3 box; phone cards ~185 px high with a 112–120 px picture on the left; no sideways page scroll.
// Each product is one card; picking a size picks its own Material Master item (its own stock, its own PO line).
// The cart raises an ordinary site indent through createIndent (same numbering, duplicate guard, BOQ-kit check,
// notifications). Only the ORDERED quantity is saved — dispatched / received stay with challans and receipts.
// Prices: shown only when the database says this login has Price access (update 463).
import { useEffect, useMemo, useRef, useState } from "react";
import { getSession, setCurrentSite, can } from "@/lib/auth";
import { getSitesList } from "@/lib/mobile";
import { createIndent } from "@/lib/stock";
import { useCanViewPrices } from "@/lib/prices";
import { getCatalogue, getCataloguePrices, catalogueImage, loadCatalogueImages, matchProduct, searchWords } from "@/lib/catalogue";

const PAGE = 24;
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const CART_KEY = "psk_catalogue_cart_v1";
const lab = o => o.size + (o.variant ? " · " + o.variant : "");
const loadCart = () => { try { const v = JSON.parse(sessionStorage.getItem(CART_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const saveCart = c => { try { sessionStorage.setItem(CART_KEY, JSON.stringify(c)); } catch { /* private mode */ } };
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
// natural size order: 15mm, 20mm, 1/2", 110mm …
const sizeNum = s => { const m = String(s).match(/(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/); return m ? (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) : 1e9; };
const bySize = (a, b) => sizeNum(a) - sizeNum(b) || String(a).localeCompare(String(b));
const brandKey = s => String(s || "").trim().toUpperCase();

const CartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21 7H6" />
  </svg>
);

// Picture box: fixed 4:3, white, product centred and filling the box (object-fit: contain — never stretched or cut).
// Blank studio background is already trimmed off in lib/catalogueImages.js, so the product uses the whole box.
function Img({ p, imgs }) {
  const [bad, setBad] = useState(false);
  if (p.image && imgs === null) return <span className="co-skel" aria-hidden="true" />;   // pictures still loading
  const im = catalogueImage(p.image, imgs);
  if (im && !bad) return <img src={im.src} width={im.w || undefined} height={im.h || undefined} alt={p.name} loading="lazy" decoding="async" onError={() => setBad(true)} />;
  return <span className="co-noimg">No picture</span>;   // only when there is genuinely no picture
}

function Qty({ value, onChange, min = 1, label }) {
  const v = Number(value) || 0;
  return (
    <div className="co-qty">
      <button type="button" aria-label="Less" onClick={() => onChange(String(Math.max(min, Math.round((v - 1) * 1000) / 1000)))}>−</button>
      <input inputMode="decimal" value={value} aria-label={label || "Quantity"} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
             onBlur={() => { const n = Number(value); if (!(n >= min)) onChange(String(min)); }} />
      <button type="button" aria-label="More" onClick={() => onChange(String(Math.round((v + 1) * 1000) / 1000))}>+</button>
    </div>
  );
}

// Size selector. Desktop: chips wrap, at most ~2 rows, then "+N more". Phone: one row that scrolls sideways
// (the chosen size is scrolled into view) plus an "All N" button that opens every size as a wrapped grid.
function SizeChips({ sizes, size, onPick, limit, narrow, onMulti }) {
  const [open, setOpen] = useState(false);
  const row = useRef(null);
  const [over, setOver] = useState(false);   // phone: the sizes do not fit on one line → offer "All N"
  useEffect(() => {
    if (!narrow || !row.current) return;
    const el = row.current; const chk = () => setOver(el.scrollWidth > el.clientWidth + 2);
    chk(); if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(chk); ro.observe(el); return () => ro.disconnect();
  }, [narrow, sizes]);
  useEffect(() => {
    if (!narrow || open || !row.current) return;
    const el = row.current.querySelector(".co-sz.on");
    if (el) row.current.scrollLeft = Math.max(0, el.offsetLeft - row.current.offsetLeft - 8);
  }, [size, narrow, open]);
  const chip = s => <button key={s} type="button" className={"co-sz" + (s === size ? " on" : "")} aria-pressed={s === size} onClick={() => onPick(s)}>{s}</button>;
  const multi = onMulti && <button type="button" className="co-multi" onClick={onMulti}>＋ Order several sizes</button>;
  if (narrow) {
    return (
      <div className={"co-szrow" + (open ? " open" : "")}>
        <div className="co-chips" ref={row}>{sizes.map(chip)}{open && multi}</div>
        {(over || open || (multi && sizes.length > 2)) && <button type="button" className="co-szmore" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? "Less" : `All ${sizes.length}`}</button>}
      </div>);
  }
  if (sizes.length <= limit || open) {
    return (
      <div className="co-chips">
        {sizes.map(chip)}
        {open && <button type="button" className="co-szmore" aria-expanded="true" onClick={() => setOpen(false)}>Show less</button>}
      </div>);
  }
  let vis = sizes.slice(0, limit - 1);
  if (!vis.includes(size)) vis = [...vis.slice(0, limit - 2), size];   // the chosen size always stays visible
  return (
    <div className="co-chips">
      {vis.map(chip)}
      <button type="button" className="co-szmore" aria-expanded="false" onClick={() => setOpen(true)}>+{sizes.length - vis.length} more</button>
    </div>);
}

function ProductCard({ p, imgs, prices, showPx, firstHit, onAdd, onMulti, chipLimit, narrow }) {
  const sizes = useMemo(() => [...new Set(p.opts.map(o => o.size))], [p]);
  const [size, setSize] = useState(firstHit?.size || sizes[0]);
  const variants = p.opts.filter(o => o.size === size);
  const [optId, setOptId] = useState(firstHit?.id || variants[0]?.id);
  useEffect(() => { if (firstHit) { setSize(firstHit.size); setOptId(firstHit.id); } }, [firstHit]);
  const cur = variants.find(o => o.id === optId) || variants[0];
  const [qty, setQty] = useState("1");
  const px = showPx && cur ? prices[cur.item_id] : null;
  const pick = s => { setSize(s); const v = p.opts.find(o => o.size === s); setOptId(v?.id); };
  const spec = p.master ? [p.family, cur?.material].filter(Boolean).join(" · ") : p.name + (p.family ? " · " + p.family : "");
  const hasSizes = sizes.length > 1 || (sizes[0] && sizes[0] !== "—");
  const multi = sizes.length > 1 ? () => onMulti(p) : null;
  return (
    <article className="co-card">
      <div className="co-ph"><Img p={p} imgs={imgs} /></div>
      <div className="co-bd">
        <div className="co-top"><span className="co-tag">{p.category}</span>{sizes.length > 1 && <span className="co-nsz">{sizes.length} sizes</span>}</div>
        {cur && <h3 className="co-nm" title={cur.name}>{cur.name}</h3>}
        <div className="co-grpnm" title={spec}>{spec}</div>
        {hasSizes && (
          <div className="co-szbox">
            <div className="co-lbl"><span>Size{sizes.length > 1 ? ` · ${sizes.length} options` : ""}</span>{!narrow && multi && <button type="button" className="co-multi" onClick={multi}>Several sizes ›</button>}</div>
            <SizeChips sizes={sizes} size={size} onPick={pick} limit={chipLimit} narrow={narrow} onMulti={narrow ? multi : null} />
          </div>)}
        {variants.length > 1 && (
          <div className="co-chips co-var" aria-label="Type / length">{variants.map(o => <button key={o.id} type="button" className={"co-sz" + (o.id === cur?.id ? " on" : "")} aria-pressed={o.id === cur?.id} onClick={() => setOptId(o.id)}>{o.variant || o.code || "Standard"}</button>)}</div>)}
        {cur && (
          <div className="co-spec">
            {narrow && p.family && <span className="co-fam">{p.family}</span>}
            {cur.code && <span><b>Code</b> {cur.code}</span>}
            <span><b>Unit</b> {cur.unit}</span>
            {cur.make && <span><b>Brand</b> {cur.make}</span>}
            {variants.length === 1 && cur.variant && <span><b>Type</b> {cur.variant}</span>}
          </div>)}
        <div className="co-buy">
          {px?.rate != null && <div className="co-price">{inr(px.rate)} <span>/ {px.per}</span><small>{px.src === "last" ? "Last purchase rate" : `Net of list${px.disc ? ` − ${px.disc}%` : ""}`}</small></div>}
          <div className="co-row">
            <Qty value={qty} onChange={setQty} />
            <button type="button" className="primary co-add" disabled={!cur} onClick={() => { const n = Number(qty); if (n > 0) { onAdd(p, cur, n); setQty("1"); } }}>Add</button>
          </div>
          {p.pending > 0 && <div className="co-pend">+{p.pending} catalogue size{p.pending > 1 ? "s" : ""} not yet in the Material Master — ask the office.</div>}
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return <div className="co-card co-sk" aria-hidden="true"><div className="co-ph"><span className="co-skel" /></div><div className="co-bd"><i /><i /><i className="s" /><i className="s" /></div></div>;
}

function MultiSheet({ p, prices, showPx, onClose, onAdd }) {
  const [q, setQ] = useState({});
  const n = Object.values(q).filter(v => Number(v) > 0).length;
  return (
    <div className="co-modal" role="dialog" aria-modal="true" aria-label={p.name} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="co-sheet">
        <header><h3>{p.name}</h3><button type="button" className="co-x" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="co-st">
          <table>
            <thead><tr><th>Size</th><th className="co-c2">Material Master item</th><th>Unit</th>{showPx && <th>Net ₹</th>}<th>Qty</th></tr></thead>
            <tbody>{p.opts.map(o => (
              <tr key={o.id}><td><b>{lab(o)}</b></td><td className="co-c2">{o.name}</td><td>{o.unit}</td>{showPx && <td>{prices[o.item_id]?.rate != null ? inr(prices[o.item_id].rate) : "—"}</td>}
                <td><Qty value={q[o.id] ?? "0"} min={0} label={"Quantity for " + lab(o)} onChange={v => setQ(x => ({ ...x, [o.id]: v }))} /></td></tr>
            ))}</tbody>
          </table>
        </div>
        <footer><span>{plural(n, "size")} selected</span>
          <button type="button" className="primary" disabled={!n} onClick={() => { const add = p.opts.filter(o => Number(q[o.id]) > 0); add.forEach(o => onAdd(p, o, Number(q[o.id]), true)); onClose(); }}>Add to cart</button></footer>
      </div>
    </div>
  );
}

export default function CatalogueOrder({ mobile = false }) {
  const [siteId, setSiteId] = useState(null);
  const [sites, setSites] = useState([]);
  const [sess, setSess] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(""); const [fam, setFam] = useState("All"); const [cat, setCat] = useState("All");
  const [brand, setBrand] = useState(""); const [sizeF, setSizeF] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [cart, setCart] = useState([]);
  const [meta, setMeta] = useState({ required_by: "", urgency: "normal", purpose: "" });
  const [multi, setMulti] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [sendErr, setSendErr] = useState("");
  const [prices, setPrices] = useState({});
  const [imgs, setImgs] = useState(null);   // product pictures: one module, loaded once in its own chunk
  const [toast, setToast] = useState(null);
  const [narrow, setNarrow] = useState(mobile);
  const canPx = useCanViewPrices();
  const loaded = useRef(false);
  const toastT = useRef(null);
  const more = useRef(null);
  const searchRef = useRef(null);
  const asideRef = useRef(null);

  useEffect(() => {
    const s = getSession(); setSess(s);
    setSiteId(Number(s?.currentSite || s?.sites?.[0]?.id || 0) || null);
    setCart(loadCart()); loaded.current = true;
    getSitesList().then(setSites).catch(() => setSites([]));
    getCatalogue().then(setData).catch(e => setErr(e.message || "Could not load the catalogue."));
    loadCatalogueImages().then(setImgs);
    const nw = () => setNarrow(window.innerWidth <= 560);
    nw(); window.addEventListener("resize", nw);
    return () => { window.removeEventListener("resize", nw); clearTimeout(toastT.current); };
  }, []);
  useEffect(() => { if (loaded.current) saveCart(cart); }, [cart]);
  useEffect(() => {
    if (canPx !== true || !data?.products?.length) return;
    getCataloguePrices(data.products.flatMap(p => p.opts)).then(setPrices).catch(() => setPrices({}));
  }, [canPx, data]);

  const showPx = canPx === true;
  const words = useMemo(() => searchWords(q), [q]);
  const all = data?.products || [];
  const cats = useMemo(() => ["All", ...new Set(all.filter(p => fam === "All" || p.family === fam).map(p => p.category))], [all, fam]);
  const brands = useMemo(() => {
    const m = new Map(); all.forEach(p => p.opts.forEach(o => { const k = brandKey(o.make); if (k && !m.has(k)) m.set(k, o.make.trim()); }));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const base = useMemo(() => all.filter(p => (fam === "All" || p.family === fam) && (cat === "All" || p.category === cat)
    && (!brand || p.opts.some(o => brandKey(o.make) === brand)) && matchProduct(p, words)), [all, fam, cat, brand, words]);
  const sizeList = useMemo(() => [...new Set(base.flatMap(p => p.opts.map(o => o.size)).filter(s => s && s !== "—"))].sort(bySize), [base]);
  const showSizeF = sizeList.length > 1 && sizeList.length <= 80;   // a size filter only makes sense once the list is narrowed
  useEffect(() => { if (sizeF && !sizeList.includes(sizeF)) setSizeF(""); }, [sizeList, sizeF]);
  const list = useMemo(() => (sizeF ? base.filter(p => p.opts.some(o => o.size === sizeF)) : base), [base, sizeF]);
  useEffect(() => { if (cat !== "All" && !cats.includes(cat)) setCat("All"); }, [cats, cat]);
  useEffect(() => { setShown(PAGE); }, [fam, cat, q, brand, sizeF]);
  // load the next page by itself when the end of the list scrolls into view (the "Show more" button stays as fallback)
  useEffect(() => {
    const el = more.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setShown(s => s + PAGE); }, { rootMargin: "600px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [list.length, shown]);
  const hitOf = p => {
    if (sizeF) return p.opts.find(o => o.size === sizeF) || null;
    if (!words.length) return null;
    return p.opts.find(o => words.some(w => o.code.toLowerCase() === w)) || p.opts.find(o => words.some(w => /\d/.test(w) && o.size.toLowerCase().startsWith(w))) || null;
  };

  const pickSite = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); setDone(null); };
  const mayRaise = !!sess && !!siteId && (sess.role === "director" || can(sess, "indent", "create", siteId) || can(sess, "indent", "manage", siteId));

  function flash(text) {
    clearTimeout(toastT.current); setToast({ text, k: Date.now() });
    toastT.current = setTimeout(() => setToast(null), 2600);
  }
  function addLine(p, o, n, many) {
    setDone(null); setSendErr("");
    setCart(c => {
      const ex = c.find(x => x.item_id === o.item_id);   // same Material Master item → one line, quantities added
      if (ex) return c.map(x => x === ex ? { ...x, qty: String(Math.round((Number(x.qty) + n) * 1000) / 1000) } : x);
      return [...c, { item_id: o.item_id, link_id: o.id, product: p.name, label: lab(o), code: o.code, unit: o.unit, name: o.name, item_type: o.item_type, qty: String(n) }];
    });
    flash(many ? `Added sizes of ${p.name} to the cart` : `Added ${n} ${o.unit} · ${o.name}`);
  }
  const setLineQty = (id, v) => setCart(c => c.map(x => x.item_id === id ? { ...x, qty: v } : x));
  const removeLine = id => setCart(c => c.filter(x => x.item_id !== id));
  const est = cart.reduce((s, x) => s + (prices[x.item_id]?.rate || 0) * (Number(x.qty) || 0), 0);
  const openCart = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024 && asideRef.current) { asideRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); asideRef.current.focus({ preventScroll: true }); }
    else setCartOpen(true);
  };
  const clearFilters = () => { setQ(""); setFam("All"); setCat("All"); setBrand(""); setSizeF(""); };
  const filtered = !!(q || fam !== "All" || cat !== "All" || brand || sizeF);

  async function send() {
    setSendErr(""); setDone(null);
    const valid = cart.filter(x => Number(x.qty) > 0);
    if (!valid.length) { setSendErr("Add at least one size with a quantity."); return; }
    if (!siteId) { setSendErr("Pick the site first."); return; }
    if (!mayRaise) { setSendErr("You don't have the right to raise indents for this site."); return; }
    setBusy(true);
    const header = { site_id: siteId, required_by: meta.required_by || null, urgency: meta.urgency, note: meta.purpose || "Ordered from the catalogue", raised_by: sess?.id || null };
    const lines = valid.map(x => ({ item_id: x.item_id, item_name: x.name, item_type: x.item_type, qty: Number(x.qty), unit: x.unit, purpose: meta.purpose || null, spec: null }));
    let res = await createIndent(header, lines);
    if (!res.ok && res.duplicate && window.confirm(res.error + "\n\nRaise it anyway as a separate indent?")) res = await createIndent({ ...header, allow_duplicate: true }, lines);
    setBusy(false);
    if (!res.ok) { setSendErr(res.error || "Could not raise the indent."); return; }
    setDone(res.indent_no); setCart([]); setMeta({ required_by: "", urgency: "normal", purpose: "" }); setCartOpen(false);
  }

  const siteName = (sites.find(s => Number(s.id) === Number(siteId))?.name || "").split(",")[0];
  const nItems = cart.length;

  const cartBody = (
    <>
      <div className="co-chead"><h2>Indent cart <span className={"co-badge" + (nItems ? "" : " z")}>{nItems}</span></h2>
      <div className="co-sub">Each size is its own line, linked to its own Material Master item.{siteName ? <> Site: <b>{siteName}</b>.</> : null}</div></div>
      <div className="co-lines">
        {!cart.length && <div className="co-empty">No items yet. Pick a size and tap Add.</div>}
        {Object.entries(cart.reduce((g, x) => { (g[x.product] = g[x.product] || []).push(x); return g; }, {})).map(([prod, xs]) => (
          <div key={prod} className="co-grp"><h4>{prod}</h4>
            {xs.map(x => (
              <div key={x.item_id} className="co-ln">
                <div className="co-lt"><div className="co-ls">{x.name}</div><div className="co-lc">{x.code ? x.code + " · " : ""}{x.unit}{showPx && prices[x.item_id]?.rate != null ? " · " + inr(prices[x.item_id].rate * (Number(x.qty) || 0)) : ""}</div></div>
                <Qty value={x.qty} min={0.001} onChange={v => setLineQty(x.item_id, v)} />
                <button type="button" className="co-rm" aria-label={"Remove " + x.label} onClick={() => removeLine(x.item_id)}>Remove</button>
              </div>))}
          </div>))}
      </div>
      <div className="co-cfoot">
      {showPx && cart.length > 0 && <div className="co-tot"><span>Est. value (net list price)</span><b>{inr(est)}</b></div>}
      <div className="co-tot"><span>Lines</span><b>{cart.length}</b></div>
      <div className="co-meta">
        <label>Need by<input type="date" value={meta.required_by} onChange={e => setMeta(m => ({ ...m, required_by: e.target.value }))} /></label>
        <label>Urgency<select value={meta.urgency} onChange={e => setMeta(m => ({ ...m, urgency: e.target.value }))}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label>
        <label className="co-wide">Purpose / note<input value={meta.purpose} placeholder="e.g. Tower B 3rd floor toilets" onChange={e => setMeta(m => ({ ...m, purpose: e.target.value }))} /></label>
      </div>
      {sendErr && <div className="note red" style={{ marginTop: 8 }}>{sendErr}</div>}
      <button type="button" className="primary co-send" disabled={busy || !cart.length || !mayRaise} onClick={send}>{busy ? "Sending…" : "Send indent"}</button>
      {!mayRaise && sess && <div className="co-sub" style={{ marginTop: 6 }}>Raising indents for this site needs the Indent “create” right.</div>}
      <div className="co-note">Only the ordered quantity is saved on the indent. Dispatched and received quantities are recorded separately on the challan and the site receipt.</div>
      </div>
    </>
  );

  return (
    <div className={"co-wrap" + (mobile ? " co-mob" : "") + (nItems ? " co-hascart" : "")}>
      <style>{CSS}</style>
      <div className="co-head">
        <div className="co-ttl"><h1>Order Materials</h1><div className="co-sub">Pick a product, choose the size, add to the indent</div></div>
        <div className="co-hr">
          <select value={siteId || ""} onChange={e => pickSite(e.target.value)} aria-label="Site">{sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}</select>
          <a className="co-link" href={mobile ? "/m/indent" : "/procure"}>My indents</a>
          <button type="button" className="co-cartbtn" onClick={openCart} aria-label={`Cart, ${plural(nItems, "item")}`}><CartIcon /><span className="co-cbl">Cart</span>{nItems > 0 && <span className="co-badge">{nItems}</span>}</button>
        </div>
      </div>
      {done && <div className="note green">Indent <b>{done}</b> raised for {siteName || "the site"}. Track it under <a href={mobile ? "/m/indent" : "/procure"}>{mobile ? "Material indent" : "Indent & Purchase"}</a>.</div>}
      {err && <div className="note red">{err}</div>}
      {data?.error && <div className="note red">{data.error}</div>}
      {data?.missing && <div className="note amber">The grouped catalogue is not installed yet. Use the normal indent screen meanwhile.</div>}
      <div className="co-grid2">
        <main className="co-main">
          <div className="co-sbox">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
            <input ref={searchRef} className="co-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, size or code — e.g. elbow 25" aria-label="Search the catalogue" />
            {q && <button type="button" className="co-clr" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}>×</button>}
          </div>
          <div className="co-fchips" role="tablist" aria-label="Product range">{["All", ...(data?.families || [])].map(f => <button key={f} type="button" role="tab" aria-selected={f === fam} className={"co-chip" + (f === fam ? " on" : "")} onClick={() => setFam(f)}>{f === "All" ? "All ranges" : f}</button>)}</div>
          <div className="co-fchips co-cats" aria-label="Category">{cats.map(c => <button key={c} type="button" aria-pressed={c === cat} className={"co-chip sm" + (c === cat ? " on" : "")} onClick={() => setCat(c)}>{c === "All" ? "All categories" : c}</button>)}</div>
          <div className="co-bar">
            <div className="co-count">{data ? `${plural(list.length, "product")} · ${list.reduce((s, p) => s + p.opts.length, 0)} orderable sizes` : "Loading the catalogue…"}</div>
            <div className="co-sel">
              {brands.length > 1 && <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Brand"><option value="">All brands</option>{brands.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
              {showSizeF && <select value={sizeF} onChange={e => setSizeF(e.target.value)} aria-label="Size"><option value="">All sizes</option>{sizeList.map(s => <option key={s} value={s}>{s}</option>)}</select>}
              {filtered && <button type="button" className="co-reset" onClick={clearFilters}>Clear filters</button>}
            </div>
          </div>
          <div className="co-cards">
            {!data && !err && Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
            {list.slice(0, shown).map(p => <ProductCard key={p.id} p={p} imgs={imgs} prices={prices} showPx={showPx} firstHit={hitOf(p)} onAdd={addLine} onMulti={setMulti} chipLimit={6} narrow={narrow} />)}
          </div>
          {data && !list.length && <div className="co-empty">Nothing matches. Try fewer words{filtered ? <>, or <button type="button" className="co-reset" onClick={clearFilters}>clear the filters</button></> : null}.</div>}
          {list.length > shown && <button type="button" ref={more} className="co-more" onClick={() => setShown(s => s + PAGE)}>Show more ({list.length - shown} left)</button>}
        </main>
        <aside className="co-cart" ref={asideRef} tabIndex={-1} aria-label="Indent cart">{cartBody}</aside>
      </div>
      {nItems > 0 && <div className="co-mbar"><b>Cart: {plural(nItems, "item")}</b><button type="button" className="primary" onClick={() => setCartOpen(true)}>View Cart</button></div>}
      {toast && <div key={toast.k} className="co-toast" role="status" aria-live="polite"><span className="co-tick" aria-hidden="true">✓</span><span className="co-tt">{toast.text}</span><button type="button" onClick={() => { setToast(null); openCart(); }}>View cart</button></div>}
      {cartOpen && <div className="co-modal" role="dialog" aria-modal="true" aria-label="Indent cart" onClick={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
        <div className="co-sheet co-cartsheet"><header><h3>Indent cart · {plural(nItems, "item")}</h3><button type="button" className="co-x" aria-label="Close" onClick={() => setCartOpen(false)}>×</button></header><div className="co-st">{cartBody}</div></div>
      </div>}
      {multi && <MultiSheet p={multi} prices={prices} showPx={showPx} onClose={() => setMulti(null)} onAdd={addLine} />}
    </div>
  );
}

// NB: no greater-than, ampersand or double-quote characters in this CSS — they break hydration of the inline style tag.
const CSS = `
.co-wrap{max-width:1560px;margin:0 auto;min-width:0;--co-line:#E3E6EA;--co-soft:#F5F6F8;--co-mut:var(--muted,#6E7780);--co-ink:var(--text,#1F2933)}
.co-mob{padding:12px 12px calc(72px + env(safe-area-inset-bottom,0px))}
.co-mob.co-hascart{padding-bottom:calc(140px + env(safe-area-inset-bottom,0px))}
.co-head{display:flex;gap:10px 16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px;min-width:0}
.co-ttl{min-width:0}
.co-head h1{font-size:22px;margin:0;letter-spacing:-.01em;line-height:1.2}
.co-mob .co-ttl{padding-right:38px}
.co-hr{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0}.co-hr select{width:auto;max-width:240px;min-height:40px;min-width:0}
.co-link{font-size:13.5px;font-weight:600;color:var(--copper-deep);padding:10px 4px;white-space:nowrap}
.co-cartbtn{display:inline-flex;align-items:center;gap:6px;min-height:40px;border-radius:10px;font-weight:600;white-space:nowrap}
.co-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--copper);color:#fff;font-size:11.5px;font-weight:700;line-height:1;box-sizing:border-box}
.co-badge.z{background:#E6E8EB;color:var(--co-mut)}
.co-sub{color:var(--co-mut);font-size:13px}
.co-grid2{display:grid;grid-template-columns:minmax(0,1fr) clamp(280px,26%,340px);gap:20px;align-items:start}
.co-main{min-width:0}
.co-sbox{position:relative;display:flex;align-items:center;min-width:0}
.co-sbox svg{position:absolute;left:14px;color:var(--co-mut);pointer-events:none}
.co-search{width:100%;padding:11px 44px 11px 40px;border-radius:10px;font-size:15px;box-sizing:border-box;min-height:46px;-webkit-appearance:none;appearance:none;min-width:0}
.co-search::-webkit-search-cancel-button{display:none}
.co-clr{position:absolute;right:6px;width:34px;height:34px;border:0;border-radius:999px;background:var(--co-soft);font-size:20px;line-height:1;padding:0;color:var(--co-mut)}
.co-fchips{display:flex;gap:8px;overflow-x:auto;padding:12px 0 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;min-width:0}
.co-fchips::-webkit-scrollbar{display:none}
.co-cats{padding-top:8px}
.co-chip{white-space:nowrap;border-radius:999px;padding:7px 14px;font-size:13px;flex:0 0 auto;min-height:36px}
.co-chip.sm{padding:5px 12px;font-size:12.5px;min-height:32px}
.co-chip.on{background:var(--deep,#0F1419);color:#fff;border-color:var(--deep,#0F1419);font-weight:600}
.co-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:12px 0}
.co-count{color:var(--co-mut);font-size:13px}
.co-sel{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0}
.co-sel select{width:auto;max-width:180px;min-height:36px;font-size:13px;padding:5px 8px}
.co-reset{border:0;background:none;color:var(--copper-deep);font-weight:600;font-size:13px;padding:6px 2px}
.co-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(max(220px,calc((100% - 48px) / 4)),1fr));gap:16px;align-items:stretch}
.co-card{background:#fff;border:1px solid var(--co-line);border-radius:12px;display:flex;flex-direction:column;min-width:0;overflow:hidden;transition:box-shadow .15s,border-color .15s}
.co-card:hover{border-color:#D0D5DB;box-shadow:0 6px 18px rgba(15,20,25,.08)}
.co-ph{width:100%;aspect-ratio:4/3;background:#fff;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--co-line);position:relative;padding:10px;box-sizing:border-box;flex:0 0 auto}
.co-ph{min-height:0;overflow:hidden}
.co-ph img{position:absolute;inset:0;display:block;width:100%;height:100%;padding:inherit;box-sizing:border-box;object-fit:contain;object-position:center}
.co-noimg{display:flex;align-items:center;justify-content:center;text-align:center;width:100%;height:100%;border-radius:8px;background:var(--co-soft);color:var(--co-mut);font-size:12px}
.co-skel{display:block;width:100%;height:100%;border-radius:8px;background:linear-gradient(90deg,#F1F3F5 25%,#E7EAED 50%,#F1F3F5 75%);background-size:200% 100%;animation:co-sh 1.3s linear infinite}
@keyframes co-sh{from{background-position:200% 0}to{background-position:-200% 0}}
.co-sk .co-bd i{display:block;height:12px;border-radius:6px;background:#EEF0F3}.co-sk .co-bd i.s{width:60%}
.co-bd{padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-width:0}
.co-top{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}
.co-tag{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--copper-deep);background:var(--copper-soft,#FEF2EC);border-radius:6px;padding:2px 8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.co-nsz{font-size:11.5px;color:var(--co-mut);white-space:nowrap;flex:0 0 auto}
.co-nm{font-weight:650;font-size:15px;line-height:1.35;margin:0;color:var(--co-ink);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}
.co-grpnm{font-size:12.5px;color:var(--co-mut);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.co-szbox{min-width:0}
.co-lbl{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--co-mut);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-weight:600}
.co-chips{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.co-sz{border-radius:8px;padding:5px 10px;font-size:13px;min-height:34px;min-width:46px;max-width:100%;overflow-wrap:anywhere;background:#fff;flex:0 0 auto;line-height:1.2}
.co-sz.on{border-color:var(--copper);background:var(--copper-soft,#FEF2EC);color:var(--copper-deep);font-weight:700;box-shadow:inset 0 0 0 1px var(--copper)}
.co-szmore{border:1px dashed #C4CAD1;border-radius:8px;padding:5px 10px;font-size:12.5px;min-height:34px;background:#fff;color:var(--copper-deep);font-weight:600;white-space:nowrap;flex:0 0 auto}
.co-multi{border:0;background:none;color:var(--copper-deep);font-weight:600;font-size:12.5px;padding:0;text-transform:none;letter-spacing:0;white-space:nowrap}
.co-spec{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12.5px;color:var(--co-ink);min-width:0;line-height:1.45}
.co-spec span{overflow-wrap:anywhere;min-width:0}.co-spec b{font-weight:500;color:var(--co-mut)}
.co-buy{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:2px;min-width:0}
.co-price{font-weight:750;font-size:18px;line-height:1.2;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 4px;color:var(--co-ink)}.co-price span{font-weight:500;font-size:13px;color:var(--co-mut)}
.co-price small{flex-basis:100%;font-size:12px;font-weight:400;color:var(--co-mut);margin-top:2px}
.co-row{display:flex;gap:8px;align-items:stretch;min-width:0}
.co-qty{display:flex;border:1px solid var(--co-line);border-radius:9px;overflow:hidden;flex:0 0 auto;background:#fff}
.co-qty button{width:36px;border:0;border-radius:0;background:var(--co-soft);font-size:18px;padding:0;min-height:42px}
.co-qty input{width:44px;border:0;border-radius:0;text-align:center;padding:6px 2px;min-width:0;font-size:14px}
.co-add{flex:1 1 auto;font-weight:700;min-height:44px;min-width:56px;border-radius:9px;font-size:14px}
.co-pend{font-size:11.5px;color:var(--co-mut);line-height:1.35}
.co-more{width:100%;margin-top:14px;min-height:44px}
.co-empty{color:var(--co-mut);font-size:13px;padding:14px 4px}
.co-cart{background:#fff;border:1px solid var(--co-line);border-radius:12px;position:sticky;top:0;max-height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden;outline:none;min-width:0}
.co-chead{padding:14px 16px 8px;flex:0 0 auto}
.co-cart h2{font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:8px}
.co-cart .co-lines{flex:1 1 auto;overflow:auto;min-height:72px;padding:0 16px;margin:0}
.co-cart .co-cfoot{flex:0 0 auto;border-top:1px solid var(--co-line);padding:10px 16px 14px}
.co-lines{margin:10px 0}
.co-grp h4{font-size:12.5px;margin:10px 0 4px}
.co-ln{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--co-line)}
.co-ln .co-qty button{width:32px;min-height:36px}.co-ln .co-qty input{width:44px}
.co-ls{font-weight:600;font-size:13px;overflow-wrap:anywhere}.co-lc{font-size:12px;color:var(--co-mut);overflow-wrap:anywhere}
.co-rm{grid-column:1/-1;justify-self:start;border:0;background:none;color:var(--red,#b91c1c);font-size:12.5px;padding:0}
.co-tot{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
.co-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.co-meta label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--co-mut);min-width:0}
.co-meta input,.co-meta select{width:100%;box-sizing:border-box;min-height:38px}
.co-wide{grid-column:1/-1}
.co-send{width:100%;margin-top:10px;min-height:44px;font-weight:700}
.co-note{font-size:11.5px;color:var(--co-mut);margin-top:8px}
.co-mbar{display:none}
.co-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:210;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);width:max-content;box-sizing:border-box;background:var(--deep,#0F1419);color:#fff;border-radius:12px;padding:10px 12px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:co-in .18s ease-out}
.co-tick{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#16A34A;font-size:13px;flex:0 0 auto}
.co-tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46ch}
.co-toast button{border:0;background:none;color:#FFB27A;font-weight:700;padding:4px 2px;white-space:nowrap;font-size:13px}
@keyframes co-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
.co-modal{position:fixed;inset:0;background:rgba(15,20,25,.45);z-index:220;display:flex;align-items:flex-end;justify-content:center}
.co-sheet{background:#fff;width:100%;max-width:640px;max-height:88vh;border-radius:14px 14px 0 0;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px)}
.co-sheet header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--co-line);gap:8px}
.co-sheet h3{margin:0;font-size:15px}
.co-x{border:0;background:none;font-size:24px;line-height:1;padding:2px 8px;min-width:40px;min-height:40px}
.co-st{overflow:auto;padding:8px 14px}
.co-st table{width:100%;font-size:13px}.co-st td,.co-st th{padding:6px 4px}
.co-sheet footer{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid var(--co-line);gap:8px}
@media (min-width:700px){.co-modal{align-items:center}.co-sheet{border-radius:14px}}
@media (max-width:1023px){
  .co-wrap{overflow-x:hidden;overflow-x:clip}
  .co-grid2{grid-template-columns:minmax(0,1fr)}
  .co-cart{display:none}
  .co-hascart{padding-bottom:84px}
  .co-mob.co-hascart{padding-bottom:calc(140px + env(safe-area-inset-bottom,0px))}
  .co-mbar{display:flex;position:fixed;left:12px;right:78px;bottom:calc(14px + env(safe-area-inset-bottom,0px));justify-content:space-between;align-items:center;gap:8px;background:#fff;border:1px solid var(--co-line);border-radius:14px;padding:8px 8px 8px 14px;box-shadow:0 6px 22px rgba(15,20,25,.14);z-index:120;max-width:560px;margin:0 auto;box-sizing:border-box}
  .co-mbar b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .co-mbar button{min-height:42px;padding:8px 16px;font-weight:700;white-space:nowrap;border-radius:10px;flex:0 0 auto}
  .co-toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
  .co-cartsheet .co-st h2{display:none}
}
body.has-global-mnav .co-mbar,.co-mob .co-mbar{bottom:calc(66px + env(safe-area-inset-bottom,0px))}
body.has-global-mnav .co-toast,.co-mob .co-toast{bottom:calc(132px + env(safe-area-inset-bottom,0px))}
@media (max-width:760px){
  .co-hascart{padding-bottom:96px}
  .co-mob.co-hascart{padding-bottom:calc(140px + env(safe-area-inset-bottom,0px))}
  .co-tt{max-width:none;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .co-toast{width:calc(100vw - 24px)}
}
@media (max-width:560px){
  .co-head{align-items:flex-start;margin-bottom:10px}
  .co-head h1{font-size:20px}
  .co-ttl .co-sub{display:none}
  .co-hr{width:100%;flex-wrap:nowrap}.co-hr select{flex:1 1 auto;max-width:none}
  .co-cbl{display:none}
  .co-fchips{gap:6px;padding-top:10px}
  .co-bar{margin:10px 0 8px}
  .co-sel select{max-width:150px}
  .co-cards{grid-template-columns:minmax(0,1fr);gap:10px}
  .co-card{display:grid;grid-template-columns:112px minmax(0,1fr);column-gap:12px;padding:10px;align-items:start}
  .co-ph{width:112px;border:1px solid var(--co-line);border-radius:8px;padding:4px}
  .co-bd{padding:0;gap:4px;min-height:100%}
  .co-top,.co-lbl{display:none}
  .co-nm{font-size:14px;min-height:0;line-height:1.28}
  .co-grpnm{display:none}
  .co-fam{font-weight:600;color:var(--co-ink)}
  .co-szrow{display:flex;align-items:center;gap:6px;min-width:0}
  .co-szrow .co-chips{flex:1 1 auto;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:1px}
  .co-szrow .co-chips::-webkit-scrollbar{display:none}
  .co-szrow.open{align-items:flex-start}
  .co-szrow.open .co-chips{flex-wrap:wrap;overflow:visible}
  .co-szrow .co-multi{border:1px dashed #C4CAD1;border-radius:8px;padding:4px 9px;min-height:32px;flex:0 0 auto}
  .co-szrow .co-sz{max-width:none;white-space:nowrap}
  .co-szrow.open .co-sz{white-space:normal;max-width:100%}
  .co-sz,.co-szmore{min-height:32px;padding:3px 9px;font-size:12.5px;min-width:40px}
  .co-szrow.open .co-multi{border:0;padding:6px 2px;min-height:0}
  .co-var{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .co-spec{font-size:12px;line-height:1.35;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .co-spec span{margin-right:10px}
  .co-buy{gap:5px;padding-top:2px}
  .co-price{font-size:16px;flex-wrap:nowrap;white-space:nowrap;min-width:0}.co-price span{font-size:12px}
  .co-price small{flex:0 1 auto;margin:0 0 0 4px;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .co-row{gap:6px}
  .co-qty button{width:32px;min-height:38px;font-size:17px}
  .co-qty input{width:38px}
  .co-add{min-height:40px;min-width:48px}
  .co-c2{display:none}
}
@media (min-width:390px) and (max-width:560px){
  .co-card{grid-template-columns:120px minmax(0,1fr)}
  .co-ph{width:120px}
}
@media (max-width:359px){
  .co-card{grid-template-columns:92px minmax(0,1fr);column-gap:10px}
  .co-ph{width:92px}
  .co-qty button{width:30px}.co-qty input{width:34px}
}
`;
