const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');
const https = require('https');

const HEBREW_FONT_PATH = path.join(__dirname, '../assets/Heebo-Bold.woff2');
const HEBREW_FONT_URL  = 'https://cdn.jsdelivr.net/npm/@fontsource/heebo@5/files/heebo-all-700-normal.woff2';

// Download font once if missing
function ensureFont() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(HEBREW_FONT_PATH) && fs.statSync(HEBREW_FONT_PATH).size > 10000) {
      return resolve();
    }
    const dir = path.dirname(HEBREW_FONT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(HEBREW_FONT_PATH);
    https.get(HEBREW_FONT_URL, res => {
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`Font download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function burnSignatures(pdfBytes, signatures) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages  = pdfDoc.getPages();

  // Try to use Hebrew font; fall back to Helvetica if unavailable
  let fontBold;
  try {
    await ensureFont();
    pdfDoc.registerFontkit(fontkit);
    const hebrewFontBytes = fs.readFileSync(HEBREW_FONT_PATH);
    fontBold = await pdfDoc.embedFont(hebrewFontBytes);
  } catch (e) {
    console.warn('Hebrew font unavailable, falling back to Helvetica:', e.message);
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const today   = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY

  for (const sig of signatures) {
    const page = pages[sig.page];
    if (!page) continue;

    const { height: pageH } = page.getSize();

    // ── Signature image ───────────────────────────────────────────
    // Y-flip: screen coords (top=0) → PDF coords (bottom=0)
    const pdfY = pageH - sig.y - sig.height;

    const imgBytes = Buffer.from(
      sig.imageData.replace(/^data:image\/png;base64,/, ''), 'base64'
    );
    const sigImage = await pdfDoc.embedPng(imgBytes);
    page.drawImage(sigImage, {
      x: sig.x, y: pdfY,
      width: sig.width, height: sig.height,
    });

    // ── Digital stamp ─────────────────────────────────────────────
    const stW = Math.min(sig.width, 105);
    const stH = 15;
    const stX = sig.x;

    // Place below signature; if too close to bottom → place above
    const stY = (pdfY - stH - 3) > 4
      ? pdfY - stH - 3
      : pdfY + sig.height + 3;

    // Background
    page.drawRectangle({
      x: stX, y: stY, width: stW, height: stH,
      color: rgb(0.94, 0.97, 1.0),
      borderColor: rgb(0.18, 0.38, 0.84),
      borderWidth: 0.75,
    });

    // Green checkmark (two lines)
    const ck = { x: stX + 4, y: stY + stH / 2 };
    page.drawLine({ start: { x: ck.x,       y: ck.y - 1.5 }, end: { x: ck.x + 2.5, y: ck.y - 3.5 }, thickness: 1.1, color: rgb(0.04, 0.54, 0.14) });
    page.drawLine({ start: { x: ck.x + 2.5, y: ck.y - 3.5 }, end: { x: ck.x + 7,   y: ck.y + 4   }, thickness: 1.1, color: rgb(0.04, 0.54, 0.14) });

    // Vertical separator
    page.drawLine({
      start: { x: stX + 13, y: stY + 2 },
      end:   { x: stX + 13, y: stY + stH - 2 },
      thickness: 0.5, color: rgb(0.60, 0.70, 0.88),
    });

    // "נחתם דיגיטלית" — reversed for correct RTL rendering in pdf-lib
    const hebrewLabel = 'נחתם דיגיטלית'.split('').reverse().join('');
    page.drawText(hebrewLabel, {
      x: stX + 17, y: stY + stH - 7,
      size: 5.5, font: fontBold,
      color: rgb(0.12, 0.32, 0.82),
    });

    // Date
    page.drawText(today, {
      x: stX + 17, y: stY + 2.5,
      size: 5.0, font: fontReg,
      color: rgb(0.38, 0.48, 0.66),
    });
  }

  return await pdfDoc.save();
}

module.exports = { burnSignatures };
