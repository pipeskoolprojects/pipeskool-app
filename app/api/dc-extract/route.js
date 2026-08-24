// update215: reads a vendor's delivery challan photo/PDF with Claude vision and returns
// structured JSON. Needs ANTHROPIC_API_KEY in Vercel env (paid Anthropic API). Without the
// key the client falls back to manual entry beside the uploaded image — nothing breaks.
export async function POST(req) {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return Response.json({ ok: false, error: "no_key" });
    const { data_base64, media_type } = await req.json();
    if (!data_base64) return Response.json({ ok: false, error: "No file received." });
    const isPdf = media_type === "application/pdf";
    const block = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: data_base64 } }
      : { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: data_base64 } };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 1500,
        messages: [{ role: "user", content: [block, { type: "text", text:
          "This is a vendor's delivery challan for a plumbing/piping contractor in India. Extract and return ONLY strict JSON, no markdown: {\"vendor\": string, \"dc_no\": string, \"date\": \"YYYY-MM-DD\" or \"\", \"items\": [{\"name\": string, \"qty\": number, \"unit\": string}]}. Item names as printed. If a field is unreadable use empty string / 0." }] }],
      }),
    });
    const j = await r.json();
    const text = (j.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return Response.json({ ok: true, ...parsed });
  } catch (e) {
    return Response.json({ ok: false, error: "Could not read the document — fill the fields manually. (" + (e.message || "parse error") + ")" });
  }
}
