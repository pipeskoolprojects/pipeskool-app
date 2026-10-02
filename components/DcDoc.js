"use client";
// update454: the Delivery Note document, moved out of /stock/dc-print so the SAME layout can be rendered
// to a PDF by "Send challan to site supervisor" (the PDF the supervisor receives is this exact page).
// update223: exact replica of the company's Tally Delivery Note (PSP/2026-27 series). QUANTITY ONLY.
import { shipBlock, addrLines } from "@/lib/clients";   // update393

export default function DcDoc({ d, hsn }) {
  // update223: exact replica of the company's Tally Delivery Note (PSP/2026-27 series).
  // QUANTITY ONLY — no rate / per / disc / amount / taxable value anywhere.
  const bc = "1px solid #444";
  const cell = { border: bc, padding: "4px 8px", verticalAlign: "top", fontSize: 11.5 };
  const lbl = { fontSize: 9.5, color: "#555" };
  const units = [...new Set(d.lines.map(l => l.unit || "NOS"))];
  const totQty = d.lines.reduce((t, l) => t + Number(l.received_qty || l.ordered_qty || 0), 0);
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 20, color: "#111", background: "#fff", pageBreakAfter: "always", fontFamily: "Arial, system-ui" }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Delivery Note</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: "50%" }} rowSpan={3}>
              <b style={{ fontSize: 12.5 }}>Pipeskool Projects Pvt Ltd</b><br />
              102, Darshak, Opp Shrey Hospital<br />Punjabi Hall Lane, Navrangpura, Ahmedabad<br />
              GSTIN/UIN: 24AAMCP3389A1ZF<br />State Name : Gujarat, Code : 24<br />
              CIN: U26956GJ2021PTC126015<br />E-Mail : pipeskoolprojects@gmail.com
            </td>
            <td style={{ ...cell, width: "25%" }}><div style={lbl}>Delivery Note No.</div><b>{d.dc_ref}</b></td>
            <td style={{ ...cell, width: "25%" }}><div style={lbl}>Dated</div><b>{d.date}</b></td>
          </tr>
          <tr>
            <td style={cell}><div style={lbl}>Reference No. &amp; Date.</div>{d.vendor_dc_no ? <>{d.vendor_dc_no}{d.date ? " dt. " + d.date : ""}</> : "\u00A0"}</td>
            <td style={cell}><div style={lbl}>Buyer&apos;s Order No.</div>{d.po_no || "\u00A0"}</td>
          </tr>
          <tr>
            <td style={cell}><div style={lbl}>Dispatched through</div>{d.vendor || "\u00A0"}</td>
            <td style={cell}><div style={lbl}>Destination</div>{d.site || "\u00A0"}</td>
          </tr>
          <tr>
            <td style={cell}>
              <div style={lbl}>Consignee (Ship to)</div>
              {d.clientRow ? (<>{/* update393: from the Client Master */}
                <b>{d.clientRow.name}</b><br />Site: {d.site}<br />
                {addrLines(shipBlock(d.clientRow)).map((l, i) => <span key={i}>{l}<br /></span>)}
                {(d.clientRow.contact_name || d.clientRow.mobile) && <>Contact: {[d.clientRow.contact_name, d.clientRow.mobile].filter(Boolean).join(" · ")}<br /></>}
                State Name : {shipBlock(d.clientRow)?.state || "Gujarat"}, Code : {shipBlock(d.clientRow)?.state_code || "24"}
              </>) : (<><b>{d.client || d.site}</b><br />{d.client ? <>Site: {d.site}<br /></> : null}State Name : Gujarat, Code : 24</>)}
            </td>
            <td style={cell} colSpan={2}><div style={lbl}>Terms of Delivery</div>&nbsp;</td>
          </tr>
          <tr>
            <td style={cell}>
              <div style={lbl}>Buyer (Bill to)</div>
              {d.clientRow ? (<>
                <b>{d.clientRow.company_name || d.clientRow.name}</b><br />
                {addrLines({ line1: d.clientRow.bill_line1, line2: d.clientRow.bill_line2, city: d.clientRow.bill_city, pincode: d.clientRow.bill_pincode }).map((l, i) => <span key={i}>{l}<br /></span>)}
                {d.clientRow.gstin && <>GSTIN/UIN : {d.clientRow.gstin}<br /></>}
                State Name : {d.clientRow.bill_state || "Gujarat"}, Code : {d.clientRow.bill_state_code || "24"}
              </>) : (<><b>{d.client || d.site}</b><br />State Name : Gujarat, Code : 24</>)}
            </td>
            <td style={cell} colSpan={2}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: -1 }}>
        <thead>
          <tr>
            <th style={{ ...cell, width: 36 }}>Sl<br />No.</th>
            <th style={{ ...cell, textAlign: "left" }}>Description of Goods</th>
            <th style={{ ...cell, width: 90 }}>HSN/SAC</th>
            <th style={{ ...cell, width: 110, textAlign: "right" }}>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: "center", borderTop: "none", borderBottom: "none" }}>{i + 1}</td>
              <td style={{ ...cell, fontWeight: 700, borderTop: "none", borderBottom: "none" }}>{l.item_name}</td>
              <td style={{ ...cell, textAlign: "center", borderTop: "none", borderBottom: "none" }}>{hsn[l.item_id] || ""}</td>
              <td style={{ ...cell, textAlign: "right", borderTop: "none", borderBottom: "none" }}><b>{Number(l.received_qty || l.ordered_qty || 0).toFixed(2)} {l.unit || "NOS"}</b></td>
            </tr>
          ))}
          <tr><td style={{ ...cell, borderTop: "none" }}>&nbsp;</td><td style={{ ...cell, borderTop: "none" }}>&nbsp;</td><td style={{ ...cell, borderTop: "none" }}>&nbsp;</td><td style={{ ...cell, borderTop: "none" }}>&nbsp;</td></tr>
          <tr>
            <td style={cell}>&nbsp;</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 800 }}>Total</td>
            <td style={cell}>&nbsp;</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 800 }}>{totQty.toFixed(2)} {units.length === 1 ? units[0] : ""}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginTop: 2 }}><span /><span>E. &amp; O.E</span></div>
      <div style={{ fontSize: 11.5, marginTop: 10 }}>Company&apos;s PAN : <b>AAMCP3389A</b></div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <tbody><tr>
          <td style={{ ...cell, height: 74 }}><div style={lbl}>Recd. in Good Condition</div></td>
          <td style={{ ...cell, height: 74, textAlign: "right" }}>
            <div style={{ fontSize: 11 }}>for <b>Pipeskool Projects Pvt Ltd</b></div>
            <div style={{ marginTop: 42, fontSize: 11 }}>Authorised Signatory</div>
          </td>
        </tr></tbody>
      </table>
      <div style={{ textAlign: "center", fontSize: 10, color: "#555", marginTop: 8 }}>This is a Computer Generated Document</div>
    </div>
  );
}
