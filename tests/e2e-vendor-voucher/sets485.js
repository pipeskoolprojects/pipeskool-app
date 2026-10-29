// update485 voucher id → bill files
module.exports = {
  500: [], 501: ["portrait.jpg"], 502: ["portrait.jpg", "landscape.jpg"], 503: ["portrait.jpg", "landscape.jpg", "bill.png"],
  504: ["portrait.jpg", "landscape.jpg", "bill.png", "bill.webp"], 505: ["portrait.jpg", "landscape.jpg", "bill.png", "bill.webp", "exif6.jpg"],
  507: ["portrait.jpg", "landscape.jpg", "bill.png", "bill.webp", "exif6.jpg", "huge.jpg", "portrait.jpg"],
  508: ["portrait.jpg", "three.pdf", "one.pdf"],          // 1 + 3 + 1 = 5 slots
  509: ["portrait.jpg", "missing.jpg", "landscape.jpg"],   // the 2nd bill fails to load
  510: ["landscape.jpg"], 511: ["portrait.jpg", "landscape.jpg"], 512: ["portrait.jpg", "landscape.jpg"], 513: ["photo.heic"],
};
