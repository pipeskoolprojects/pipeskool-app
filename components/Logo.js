// update331: THE OFFICIAL LOGO, used as-is.
//
// Until now this component DREW an approximation of the logo: three equal-width
// rounded dashes plus the word "Pipeskool" set in whatever font the device had.
// The real mark is not that. Its three rules are different lengths (41.5 : 82.2 :
// 117.8 units, short to long) and the wordmark is a specific set of letterforms.
// Every screen and every printed document was therefore showing a redrawn logo.
//
// public/pipeskool-logo.svg holds the artwork lifted straight out of the official
// pipeskool-logo-color.pdf, with the glyphs as vector outlines. Nothing here
// redraws, recolours or stretches it: the image is rendered at its own aspect
// ratio, and the colours (#0F1419 wordmark, #FF7A1A rules) live inside the file.
//
// `height` keeps its old meaning — the visual size of the wordmark — so all nine
// existing call sites render at the size they always did. LOGO_RATIO converts that
// to the height of the full lockup, which includes the rules above the word.
const LOGO_RATIO = 1.32;      // full lockup height / wordmark cap size
const ASPECT = 450.6 / 113.6; // from the official file's artwork bounds

export default function Logo({ height = 30, align = "left", className, style }) {
  const h = Math.round(height * LOGO_RATIO);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/pipeskool-logo.svg"
      alt="Pipeskool"
      className={className}
      width={Math.round(h * ASPECT)}
      height={h}
      style={{
        height: h,
        width: "auto",              // never stretched — width follows the artwork
        display: "block",
        alignSelf: align === "center" ? "center" : "flex-start",
        margin: align === "center" ? "0 auto" : undefined,
        ...style,
      }}
    />
  );
}
