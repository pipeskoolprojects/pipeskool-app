// update486 test bills: scanned PDF (photo inside), rotated-page PDF, large 30-page PDF, corrupt PDF; password PDF via qpdf
const { PDFDocument, StandardFonts, rgb, degrees } = require("/home/claude/.npm-global/lib/node_modules/pdf-lib");
const sharp = require("/home/claude/.npm-global/lib/node_modules/sharp");
const fs = require("fs"); const { execFileSync } = require("child_process");
(async () => {
  // scanned: a 2480×3508 JPEG (A4 @ 300 dpi photo) as the only content
  const scan = await sharp({ create: { width: 2480, height: 3508, channels: 3, background: "#f5f5f0" } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2480" height="3508"><text x="200" y="600" font-size="160" font-family="Arial" font-weight="bold">SCANNED BILL</text><text x="200" y="900" font-size="90" font-family="Arial">Ashapura Hardware · Rs 33,420</text></svg>`) }]).jpeg({ quality: 70 }).toBuffer();
  let doc = await PDFDocument.create(); let jpg = await doc.embedJpg(scan); let p = doc.addPage([595, 842]); p.drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
  fs.writeFileSync("assets/scanned.pdf", await doc.save());
  // rotated: page stored landscape-text but /Rotate 90
  doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.HelveticaBold);
  p = doc.addPage([842, 595]); p.drawText("ROTATED PAGE (Rotate 90)", { x: 120, y: 290, size: 40, font: f }); p.setRotation(degrees(90));
  fs.writeFileSync("assets/rotated.pdf", await doc.save());
  // large: 30 pages each with a big photo → several MB
  doc = await PDFDocument.create(); jpg = await doc.embedJpg(await sharp(scan).jpeg({ quality: 92 }).toBuffer());
  for (let i = 1; i <= 30; i++) { p = doc.addPage([595, 842]); p.drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 }); p.drawText("LARGE PDF page " + i + " of 30", { x: 60, y: 60, size: 30, font: await doc.embedFont(StandardFonts.HelveticaBold), color: rgb(0.8, 0, 0) }); }
  fs.writeFileSync("assets/large.pdf", await doc.save());
  fs.writeFileSync("assets/corrupt.pdf", Buffer.from("%PDF-1.4\nthis is not really a pdf file at all\n%%EOF"));
  execFileSync("qpdf", ["--encrypt", "user123", "owner123", "256", "--", "assets/one.pdf", "assets/locked.pdf"]);
  for (const n of ["scanned.pdf", "rotated.pdf", "large.pdf", "corrupt.pdf", "locked.pdf"]) console.log(n, fs.statSync("assets/" + n).size);
})();
