const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function burnSignatures(pdfBytes, signatures) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages  = pdfDoc.getPages();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const today    = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY

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
    const stW = Math.min(sig.width, 145);
    const stH = 20;
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
    const ck = { x: stX + 5, y: stY + stH / 2 };
    page.drawLine({ start: { x: ck.x,     y: ck.y - 2 }, end: { x: ck.x + 3, y: ck.y - 5 }, thickness: 1.3, color: rgb(0.04, 0.54, 0.14) });
    page.drawLine({ start: { x: ck.x + 3, y: ck.y - 5 }, end: { x: ck.x + 9, y: ck.y + 5 }, thickness: 1.3, color: rgb(0.04, 0.54, 0.14) });

    // Vertical separator
    page.drawLine({
      start: { x: stX + 16, y: stY + 2 },
      end:   { x: stX + 16, y: stY + stH - 2 },
      thickness: 0.5, color: rgb(0.60, 0.70, 0.88),
    });

    // "DIGITALLY SIGNED"
    page.drawText('DIGITALLY SIGNED', {
      x: stX + 20, y: stY + stH - 8,
      size: 6.5, font: fontBold,
      color: rgb(0.12, 0.32, 0.82),
    });

    // Date
    page.drawText(today, {
      x: stX + 20, y: stY + 3,
      size: 6.0, font: fontReg,
      color: rgb(0.38, 0.48, 0.66),
    });
  }

  return await pdfDoc.save();
}

module.exports = { burnSignatures };
