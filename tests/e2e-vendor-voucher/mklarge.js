const { PDFDocument, StandardFonts, rgb } = require("/home/claude/.npm-global/lib/node_modules/pdf-lib");
const sharp = require("/home/claude/.npm-global/lib/node_modules/sharp"); const fs = require("fs");
(async () => { const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 20; i++) {
    const raw = Buffer.alloc(1240 * 1754 * 3); for (let k = 0; k < raw.length; k++) raw[k] = 200 + ((k * 7919 + i * 104729) % 55) ;
    const img = await doc.embedJpg(await sharp(raw, { raw: { width: 1240, height: 1754, channels: 3 } }).jpeg({ quality: 95 }).toBuffer());
    const p = doc.addPage([595, 842]); p.drawImage(img, { x: 0, y: 0, width: 595, height: 842 }); p.drawText("LARGE PDF page " + i + " of 20", { x: 60, y: 400, size: 34, font: f, color: rgb(0.7, 0, 0) }); }
  fs.writeFileSync("assets/large.pdf", await doc.save()); console.log((fs.statSync("assets/large.pdf").size / 1e6).toFixed(1) + " MB"); })();
