"use client";
// update464: ORDER MATERIALS (Astral catalogue, grouped by size) — one screen for phone and desktop.
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

function Img({ p, imgs }) {
  const [bad, setBad] = useState(false);
  const src = catalogueImage(p.image, imgs);
  return src && !bad
    ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} />
    : <span className="co-noimg"><b>{p.category}</b>{p.name}</span>;   // neutral placeholder: the product's own name, no icon
}

function Qty({ value, onChange, min = 1, label }) {
  const v = Number(value) || 0;
  return (
    <div className="co-qty">
      <button type="button" aria-label="Less" onClick={() => onChange(Math.max(min, v - 1))}>−</button>
      <input inputMode="decimal" value={value} aria-label={label || "Quantity"} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
             onBlur={() => { const n = Number(value); if (!(n >= min)) onChange(min); }} />
      <button type="button" aria-label="More" onClick={() => onChange(v + 1)}>+</button>
    </div>
  );
}

function ProductCard({ p, imgs, prices, showPx, firstHit, onAdd, onMulti }) {
  const sizes = useMemo(() => [...new Set(p.opts.map(o => o.size))], [p]);
  const [size, setSize] = useState(firstHit?.size || sizes[0]);
  const variants = p.opts.filter(o => o.size === size);
  const [optId, setOptId] = useState(firstHit?.id || variants[0]?.id);
  useEffect(() => { if (firstHit) { setSize(firstHit.size); setOptId(firstHit.id); } }, [firstHit]);
  const cur = variants.find(o => o.id === optId) || variants[0];
  const [qty, setQty] = useState("1");
  const px = showPx && cur ? prices[cur.item_id] : null;
  const pick = s => { setSize(s); const v = p.opts.find(o => o.size === s); setOptId(v?.id); };
  return (
    <div className="co-card">
      <div className="co-ph"><Img p={p} imgs={imgs} /><span className="co-nsz">{sizes.length} size{sizes.length > 1 ? "s" : ""}</span></div>
      <div className="co-bd">
        <span className="co-tag">{p.family} · {p.category}</span>
        <div className="co-grpnm">{p.name}</div>
        {cur && <div className="co-nm" title="Material Master name">{cur.name}</div>}
        <div>
          <div className="co-lbl">Size</div>
          {sizes.length <= 8
            ? <div className="co-chips">{sizes.map(s => <button key={s} type="button" className={"co-sz" + (s === size ? " on" : "")} aria-pressed={s === size} onClick={() => pick(s)}>{s}</button>)}</div>
            : <select value={size} onChange={e => pick(e.target.value)} aria-label="Size">{sizes.map(s => <option key={s} value={s}>{s}</option>)}</select>}
        </div>
        {(variants.length > 1 || variants[0]?.variant) && (
          <div>
            <div className="co-lbl">Type / length</div>
            <div className="co-chips">{variants.map(o => <button key={o.id} type="button" className={"co-sz" + (o.id === cur?.id ? " on" : "")} aria-pressed={o.id === cur?.id} onClick={() => setOptId(o.id)}>{o.variant || o.code || "Standard"}</button>)}</div>
          </div>)}
        {cur && (
          <div className="co-spec">
            {cur.code && <><b>Code</b><span>{cur.code}</span></>}
            {cur.size && cur.size !== "—" && <><b>Size</b><span>{cur.size}</span></>}
            <b>Unit</b><span>{cur.unit}</span>
            {cur.make && <><b>Brand</b><span>{cur.make}</span></>}
          </div>)}
        {px?.rate != null && <div className="co-price">{inr(px.rate)} <span>/ {px.per}{px.src === "last" ? " · last purchase rate" : ` · net of list${px.disc ? ` − ${px.disc}%` : ""}`}</span></div>}
        <div className="co-row">
          <Qty value={qty} onChange={setQty} />
          <button type="button" className="primary co-add" disabled={!cur} onClick={() => { const n = Number(qty); if (n > 0) { onAdd(p, cur, n); setQty("1"); } }}>Add</button>
        </div>
        {sizes.length > 1 && <button type="button" className="co-multi" onClick={() => onMulti(p)}>＋ Order several sizes at once</button>}
        {p.pending > 0 && <div className="co-pend">{p.pending} more catalogue size{p.pending > 1 ? "s" : ""} can be ordered once added to the Material Master — ask the office.</div>}
      </div>
    </div>
  );
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
        <footer><span>{n} size{n === 1 ? "" : "s"} selected</span>
          <button type="button" className="primary" disabled={!n} onClick={() => { p.opts.forEach(o => { const v = Number(q[o.id]); if (v > 0) onAdd(p, o, v); }); onClose(); }}>Add to cart</button></footer>
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
  const [shown, setShown] = useState(PAGE);
  const [cart, setCart] = useState([]);
  const [meta, setMeta] = useState({ required_by: "", urgency: "normal", purpose: "" });
  const [multi, setMulti] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [sendErr, setSendErr] = useState("");
  const [prices, setPrices] = useState({});
  const [imgs, setImgs] = useState(null);   // product pictures: one file, loaded once (public/catalogue-images.json)
  const canPx = useCanViewPrices();
  const loaded = useRef(false);

  useEffect(() => {
    const s = getSession(); setSess(s);
    setSiteId(Number(s?.currentSite || s?.sites?.[0]?.id || 0) || null);
    setCart(loadCart()); loaded.current = true;
    getSitesList().then(setSites).catch(() => setSites([]));
    getCatalogue().then(setData).catch(e => setErr(e.message || "Could not load the catalogue."));
    loadCatalogueImages().then(setImgs);
  }, []);
  useEffect(() => { if (loaded.current) saveCart(cart); }, [cart]);
  useEffect(() => {
    if (canPx !== true || !data?.products?.length) return;
    getCataloguePrices(data.products.flatMap(p => p.opts)).then(setPrices).catch(() => setPrices({}));
  }, [canPx, data]);

  const showPx = canPx === true;
  const words = useMemo(() => searchWords(q), [q]);
  const cats = useMemo(() => ["All", ...new Set((data?.products || []).map(p => p.category))], [data]);
  const list = useMemo(() => (data?.products || []).filter(p => (fam === "All" || p.family === fam) && (cat === "All" || p.category === cat) && matchProduct(p, words)), [data, fam, cat, words]);
  useEffect(() => { setShown(PAGE); }, [fam, cat, q]);
  const hitOf = p => {
    if (!words.length) return null;
    return p.opts.find(o => words.some(w => o.code.toLowerCase() === w)) || p.opts.find(o => words.some(w => /\d/.test(w) && o.size.toLowerCase().startsWith(w))) || null;
  };

  const pickSite = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); setDone(null); };
  const mayRaise = !!sess && !!siteId && (sess.role === "director" || can(sess, "indent", "create", siteId) || can(sess, "indent", "manage", siteId));

  function addLine(p, o, n) {
    setDone(null); setSendErr("");
    setCart(c => {
      const ex = c.find(x => x.item_id === o.item_id);
      if (ex) return c.map(x => x === ex ? { ...x, qty: String(Math.round((Number(x.qty) + n) * 1000) / 1000) } : x);
      return [...c, { item_id: o.item_id, link_id: o.id, product: p.name, label: lab(o), code: o.code, unit: o.unit, name: o.name, item_type: o.item_type, qty: String(n) }];
    });
  }
  const setLineQty = (id, v) => setCart(c => c.map(x => x.item_id === id ? { ...x, qty: v } : x));
  const removeLine = id => setCart(c => c.filter(x => x.item_id !== id));
  const est = cart.reduce((s, x) => s + (prices[x.item_id]?.rate || 0) * (Number(x.qty) || 0), 0);

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

  const cartBody = (
    <>
      <h2>Indent cart</h2>
      <div className="co-sub">Each size is its own line, linked to its own Material Master item.{siteName ? <> Site: <b>{siteName}</b>.</> : null}</div>
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
    </>
  );

  return (
    <div className={"co-wrap" + (mobile ? " co-mob" : "")}>
      <style>{CSS}</style>
      <div className="co-head">
        <div><h1>Order Materials</h1><div className="co-sub">Astral catalogue · pick a product, pick the size, add to the indent</div></div>
        <div className="co-hr">
          <select value={siteId || ""} onChange={e => pickSite(e.target.value)} aria-label="Site">{sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}</select>
          <a className="co-link" href={mobile ? "/m/indent" : "/procure"}>My indents</a>
        </div>
      </div>
      {done && <div className="note green">Indent <b>{done}</b> raised for {siteName || "the site"}. Track it under <a href={mobile ? "/m/indent" : "/procure"}>{mobile ? "Material indent" : "Indent & Purchase"}</a>.</div>}
      {err && <div className="note red">{err}</div>}
      {data?.error && <div className="note red">{data.error}</div>}
      {data?.missing && <div className="note amber">The grouped catalogue is not installed yet. Use the normal indent screen meanwhile.</div>}
      <div className="co-grid2">
        <main className="co-main">
          <input className="co-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, size or code — e.g. elbow 25, M512110503" aria-label="Search the catalogue" />
          <div className="co-fchips" role="tablist" aria-label="Product family">{["All", ...(data?.families || [])].map(f => <button key={f} type="button" role="tab" aria-selected={f === fam} className={"co-chip" + (f === fam ? " on" : "")} onClick={() => setFam(f)}>{f}</button>)}</div>
          <div className="co-fchips co-cats">{cats.map(c => <button key={c} type="button" className={"co-chip sm" + (c === cat ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
          <div className="co-count">{data ? `${list.length} product${list.length === 1 ? "" : "s"} · ${list.reduce((s, p) => s + p.opts.length, 0)} orderable sizes` : "Loading the catalogue…"}</div>
          <div className="co-cards">
            {list.slice(0, shown).map(p => <ProductCard key={p.id} p={p} imgs={imgs} prices={prices} showPx={showPx} firstHit={hitOf(p)} onAdd={addLine} onMulti={setMulti} />)}
          </div>
          {data && !list.length && <div className="co-empty">Nothing matches. Try fewer words, or search the full Material Master on the indent screen.</div>}
          {list.length > shown && <button type="button" className="co-more" onClick={() => setShown(s => s + PAGE)}>Show more ({list.length - shown} left)</button>}
        </main>
        <aside className="co-cart">{cartBody}</aside>
      </div>
      <div className="co-mbar"><b>Cart: {cart.length} line{cart.length === 1 ? "" : "s"}</b><button type="button" className="primary" onClick={() => setCartOpen(true)}>View cart</button></div>
      {cartOpen && <div className="co-modal" role="dialog" aria-modal="true" aria-label="Indent cart" onClick={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
        <div className="co-sheet co-cartsheet"><header><h3>Indent cart</h3><button type="button" className="co-x" aria-label="Close" onClick={() => setCartOpen(false)}>×</button></header><div className="co-st">{cartBody}</div></div>
      </div>}
      {multi && <MultiSheet p={multi} prices={prices} showPx={showPx} onClose={() => setMulti(null)} onAdd={addLine} />}
    </div>
  );
}

const CSS = `
.co-wrap{max-width:1500px;margin:0 auto;min-width:0}
.co-head{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
.co-head h1{font-size:20px;margin:0}
.co-mob .co-head h1,.co-mob .co-head h1+.co-sub{padding-right:38px}
.co-hr{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.co-hr select{width:auto;max-width:220px}
.co-link{font-size:13px;font-weight:600;color:var(--copper-deep)}
.co-sub{color:var(--muted,#6E7780);font-size:12.5px}
.co-grid2{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
.co-main{min-width:0}
.co-search{width:100%;padding:11px 14px;border-radius:10px;font-size:14px;box-sizing:border-box}
.co-fchips{display:flex;gap:6px;overflow-x:auto;padding:10px 0 2px;-webkit-overflow-scrolling:touch}
.co-cats{padding-top:6px}
.co-chip{white-space:nowrap;border-radius:999px;padding:6px 12px;font-size:13px;flex:0 0 auto}
.co-chip.sm{padding:4px 10px;font-size:12px}
.co-chip.on{background:var(--deep,#0F1419);color:#fff;border-color:var(--deep,#0F1419)}
.co-count{color:var(--muted,#6E7780);font-size:12px;margin:8px 0 10px}
.co-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.co-card{background:#fff;border:1px solid var(--border);border-radius:12px;display:flex;flex-direction:column;min-width:0}
.co-ph{aspect-ratio:16/10;background:#fafbfc;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border);border-radius:12px 12px 0 0;position:relative;overflow:hidden}
.co-ph img{max-width:80%;max-height:86%;object-fit:contain}
.co-noimg{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding:10px 14px;color:var(--muted,#6E7780);font-size:12px;line-height:1.35;overflow:hidden;max-height:100%}
.co-noimg b{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;opacity:.8}
.co-nsz{position:absolute;top:8px;left:8px;background:#fff;border:1px solid var(--border);border-radius:999px;font-size:11px;padding:2px 8px;color:var(--muted,#6E7780)}
.co-bd{padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
.co-tag{font-size:11px;color:var(--copper-deep);background:var(--copper-soft,#FEF2EC);border-radius:6px;padding:2px 7px;align-self:flex-start}
.co-grpnm{font-size:12px;color:var(--muted,#6E7780);line-height:1.3;overflow-wrap:anywhere}
.co-nm{font-weight:650;font-size:14px;line-height:1.3;overflow-wrap:anywhere}
.co-lbl{font-size:11px;color:var(--muted,#6E7780);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.co-chips{display:flex;flex-wrap:wrap;gap:6px}
.co-sz{border-radius:8px;padding:5px 9px;font-size:12.5px;min-height:32px}
.co-sz.on{border-color:var(--copper);background:var(--copper-soft,#FEF2EC);color:var(--copper-deep);font-weight:650;box-shadow:inset 0 0 0 1px var(--copper)}
.co-spec{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:7px 9px;font-size:12px;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;min-width:0}
.co-spec b{font-weight:600;color:var(--muted,#6E7780)}.co-spec span{overflow-wrap:anywhere}
.co-full{grid-column:1/-1;color:var(--muted,#6E7780);font-size:11px;margin-top:2px}
.co-price{font-weight:700;font-size:15px}.co-price span{font-weight:400;font-size:12px;color:var(--muted,#6E7780)}
.co-row{display:flex;gap:8px;align-items:center;margin-top:auto}
.co-qty{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;flex:0 0 auto;background:#fff}
.co-qty button{width:34px;border:0;border-radius:0;background:#f1f4f8;font-size:17px;padding:0;min-height:36px}
.co-qty input{width:56px;border:0;border-radius:0;text-align:center;padding:6px 2px}
.co-add{flex:1;font-weight:700;min-height:38px}
.co-multi{border:0;background:none;color:var(--copper-deep);font-weight:600;font-size:12.5px;padding:0;text-align:left;align-self:flex-start}
.co-pend{font-size:11.5px;color:var(--muted,#6E7780);border-top:1px dashed var(--border);padding-top:6px}
.co-more{width:100%;margin-top:12px}
.co-empty{color:var(--muted,#6E7780);font-size:13px;padding:14px 4px}
.co-cart{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px;position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto}
.co-cart h2{font-size:16px;margin:0 0 4px}
.co-lines{margin:10px 0}
.co-grp h4{font-size:12.5px;margin:10px 0 4px}
.co-ln{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border)}
.co-ls{font-weight:600;font-size:13px}.co-lc{font-size:11.5px;color:var(--muted,#6E7780);overflow-wrap:anywhere}
.co-rm{grid-column:1/-1;justify-self:start;border:0;background:none;color:var(--red,#b91c1c);font-size:12px;padding:0}
.co-tot{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
.co-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.co-meta label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted,#6E7780);min-width:0}
.co-meta input,.co-meta select{width:100%;box-sizing:border-box}
.co-wide{grid-column:1/-1}
.co-send{width:100%;margin-top:10px;min-height:42px;font-weight:700}
.co-note{font-size:11.5px;color:var(--muted,#6E7780);margin-top:8px}
.co-mbar{display:none}
.co-modal{position:fixed;inset:0;background:rgba(15,20,25,.45);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.co-sheet{background:#fff;width:100%;max-width:640px;max-height:88vh;border-radius:14px 14px 0 0;display:flex;flex-direction:column}
.co-sheet header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border);gap:8px}
.co-sheet h3{margin:0;font-size:15px}
.co-x{border:0;background:none;font-size:24px;line-height:1;padding:2px 8px}
.co-st{overflow:auto;padding:8px 14px}
.co-st table{width:100%;font-size:13px}.co-st td,.co-st th{padding:6px 4px}
.co-sheet footer{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid var(--border);gap:8px}
@media (min-width:700px){.co-modal{align-items:center}.co-sheet{border-radius:14px}}
@media (max-width:1023px){
  .co-grid2{grid-template-columns:minmax(0,1fr)}
  .co-cart{display:none}
  .co-mbar{display:flex;position:sticky;bottom:calc(64px + env(safe-area-inset-bottom));justify-content:space-between;align-items:center;gap:8px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:8px 12px;margin-top:12px;margin-right:66px;box-shadow:0 4px 18px rgba(0,0,0,.08);z-index:20}
  .co-cartsheet .co-st h2{display:none}
}
@media (max-width:480px){
  .co-cards{grid-template-columns:minmax(0,1fr)}
  .co-c2{display:none}
  .co-head h1{font-size:18px}
  .co-hr{width:100%}.co-hr select{flex:1;max-width:none}
}
`;
