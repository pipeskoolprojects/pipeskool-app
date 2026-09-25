"use client";
// update432: tiny safe markdown renderer for Assistant replies — bold, italic, inline code, headings, bullet/numbered lists, pipe tables.
// No HTML injection: everything is built from React nodes, never dangerouslySetInnerHTML.
import React from "react";
function inline(text, key) {
  const parts = []; let rest = String(text); let i = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/;
  while (rest.length) { const m = rest.match(re); if (!m) { parts.push(rest); break; } if (m.index > 0) parts.push(rest.slice(0, m.index)); const tok = m[0];
    if (tok.startsWith("**")) parts.push(<b key={`${key}-${i++}`}>{tok.slice(2, -2)}</b>); else if (tok.startsWith("`")) parts.push(<code key={`${key}-${i++}`} style={{ background: "rgba(255,255,255,.08)", padding: "0 4px", borderRadius: 4 }}>{tok.slice(1, -1)}</code>); else parts.push(<i key={`${key}-${i++}`}>{tok.slice(1, -1)}</i>);
    rest = rest.slice(m.index + tok.length); }
  return parts;
}
export default function AssistantMd({ text }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n"); const out = []; let i = 0, k = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {   // pipe table
      const head = ln.split("|").slice(1, -1).map(c => c.trim()); i += 2; const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim())); i++; }
      out.push(<div key={k++} style={{ overflowX: "auto", margin: "6px 0" }}><table style={{ borderCollapse: "collapse", fontSize: 12 }}><thead><tr>{head.map((h, j) => <th key={j} style={{ textAlign: "left", padding: "3px 8px", borderBottom: "1px solid rgba(255,255,255,.15)" }}>{inline(h, `h${j}`)}</th>)}</tr></thead><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} style={{ padding: "3px 8px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{inline(c, `c${ri}-${j}`)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^\s*[-•*]\s+/.test(ln)) { const items = []; while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-•*]\s+/, "")); i++; } out.push(<ul key={k++} style={{ margin: "4px 0", paddingLeft: 18 }}>{items.map((t, j) => <li key={j}>{inline(t, `l${k}-${j}`)}</li>)}</ul>); continue; }
    if (/^\s*\d+[.)]\s+/.test(ln)) { const items = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; } out.push(<ol key={k++} style={{ margin: "4px 0", paddingLeft: 20 }}>{items.map((t, j) => <li key={j}>{inline(t, `o${k}-${j}`)}</li>)}</ol>); continue; }
    if (/^#{1,3}\s+/.test(ln)) { out.push(<div key={k++} style={{ fontWeight: 700, margin: "6px 0 2px" }}>{inline(ln.replace(/^#{1,3}\s+/, ""), `hd${k}`)}</div>); i++; continue; }
    if (ln.trim() === "") { out.push(<div key={k++} style={{ height: 6 }} />); i++; continue; }
    out.push(<div key={k++}>{inline(ln, `p${k}`)}</div>); i++;
  }
  return <div style={{ lineHeight: 1.55 }}>{out}</div>;
}
