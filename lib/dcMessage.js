// update453: the "count before GRN" message sent to a site supervisor for one delivery challan.
// Same structure in all three languages. Item names stay as in the Item Master (never translated).
// buildDcMessage(lang, { name, site, vendor, dcRef, poNo, lines:[{item_name, received_qty, unit}] })

const fmtQty = q => { const n = Number(q) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(2); };

export const LANG_LABEL = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી" };

export function buildDcMessage(lang, d) {
  const items = (d.lines || []).map((l, i) => `${i + 1}. ${l.item_name} — ${fmtQty(l.received_qty)} ${l.unit || ""}`.trim()).join("\n");
  const total = (d.lines || []).reduce((t, l) => t + (Number(l.received_qty) || 0), 0);
  const units = [...new Set((d.lines || []).map(l => l.unit).filter(Boolean))];
  const totalLine = units.length === 1 ? `${fmtQty(total)} ${units[0]}` : `${fmtQty(total)}`;
  const po = d.poNo ? `, ${d.poNo}` : "";
  const T = {
    en: `Hi ${d.name},\nA delivery has arrived for ${d.site} from ${d.vendor} (DC ${d.dcRef}${po}).\nPlease count each item carefully against the list below before confirming GRN, so we catch any shortage or mismatch right away:\n\n${items}\nTotal: ${totalLine}\n\nOnce verified, please proceed to GRN. Thank you!\n— Pipeskool Projects`,
    hi: `नमस्ते ${d.name} जी,\n${d.site} साइट पर ${d.vendor} से माल आया है (DC ${d.dcRef}${po})।\nGRN कन्फ़र्म करने से पहले नीचे की सूची से हर आइटम ध्यान से गिनकर मिलाएँ, ताकि कोई कमी या गलत माल तुरंत पकड़ में आ जाए:\n\n${items}\nकुल: ${totalLine}\n\nजाँच पूरी होने पर GRN कर दें। धन्यवाद!\n— Pipeskool Projects`,
    gu: `નમસ્તે ${d.name},\n${d.site} સાઇટ પર ${d.vendor} તરફથી માલ આવ્યો છે (DC ${d.dcRef}${po}).\nGRN કન્ફર્મ કરતાં પહેલાં નીચેની યાદી સાથે દરેક આઇટમ ધ્યાનથી ગણીને મેળવો, જેથી કોઈ ઘટ કે ખોટો માલ તરત પકડાઈ જાય:\n\n${items}\nકુલ: ${totalLine}\n\nચકાસણી પૂરી થાય એટલે GRN કરી દેજો. આભાર!\n— Pipeskool Projects`,
  };
  return T[lang] || T.en;
}
