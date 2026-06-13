export default function Logo({ height = 30, color = "#FF7A1A", wordColor = "#0F1419", wordmark = "Pipeskool", align = "left" }) {
  const dashW = height * 0.42;
  const dashH = Math.max(2.5, height * 0.085);
  const dashGap = height * 0.18;
  const r = dashH / 2;
  const rowW = dashW * 3 + dashGap * 2;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", gap: height * 0.16, lineHeight: 1 }}>
      <svg width={rowW} height={dashH} viewBox={`0 0 ${rowW} ${dashH}`} aria-hidden="true" style={{ display: "block" }}>
        <rect x="0" y="0" width={dashW} height={dashH} rx={r} fill={color} />
        <rect x={dashW + dashGap} y="0" width={dashW} height={dashH} rx={r} fill={color} />
        <rect x={(dashW + dashGap) * 2} y="0" width={dashW} height={dashH} rx={r} fill={color} />
      </svg>
      <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: height, color: wordColor, letterSpacing: "-0.03em", lineHeight: 1 }}>
        {wordmark}
      </span>
    </span>
  );
}
