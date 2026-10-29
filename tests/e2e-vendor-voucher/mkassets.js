// test bills: portrait / landscape / very large photos, PNG, WEBP, an EXIF-rotated JPG, a 3-page PDF, a 1-page PDF
const sharp = require("/home/claude/.npm-global/lib/node_modules/sharp");
const { PDFDocument, StandardFonts, rgb } = require("/home/claude/.npm-global/lib/node_modules/pdf-lib");
const fs = require("fs");
function svg(w, h, label, bg) { return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><rect x="4%" y="4%" width="92%" height="92%" fill="none" stroke="#111" stroke-width="${Math.max(4, w / 150)}"/><text x="50%" y="45%" font-size="${Math.round(w / 9)}" text-anchor="middle" font-family="Arial" font-weight="bold">${label}</text><text x="50%" y="62%" font-size="${Math.round(w / 22)}" text-anchor="middle" font-family="Arial">${w} x ${h} TOP</text></svg>`); }
(async () => {
  await sharp(svg(1200, 1700, "PORTRAIT", "#fde68a")).jpeg({ quality: 85 }).toFile("assets/portrait.jpg");
  await sharp(svg(1800, 1100, "LANDSCAPE", "#bfdbfe")).jpeg({ quality: 85 }).toFile("assets/landscape.jpg");
  await sharp(svg(6000, 4500, "HUGE", "#bbf7d0")).jpeg({ quality: 80 }).toFile("assets/huge.jpg");
  await sharp(svg(900, 1300, "PNG", "#fecaca")).png().toFile("assets/bill.png");
  await sharp(svg(1000, 1400, "WEBP", "#e9d5ff")).webp().toFile("assets/bill.webp");
  // stored landscape pixels + EXIF orientation 6 → must DISPLAY as portrait (text upright)
  await sharp(await sharp(svg(1400, 1000, "EXIF-6", "#fbcfe8")).rotate(-90).jpeg().toBuffer()).withMetadata({ orientation: 6 }).jpeg().toFile("assets/exif6.jpg");
  const mk = async (pages, file) => { const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let p = 1; p <= pages; p++) { const pg = doc.addPage([595, 842]); pg.drawRectangle({ x: 20, y: 20, width: 555, height: 802, borderColor: rgb(0, 0, 0), borderWidth: 3 }); pg.drawText(`PDF BILL page ${p} of ${pages}`, { x: 90, y: 420, size: 34, font: f }); }
    fs.writeFileSync(file, await doc.save()); };
  await mk(3, "assets/three.pdf"); await mk(1, "assets/one.pdf");
  console.log(fs.readdirSync("assets").join(", "));
})();
