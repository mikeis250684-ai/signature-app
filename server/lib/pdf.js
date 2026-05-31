const { PDFDocument, rgb } = require('pdf-lib');

async function burnSignatures(pdfBytes, signatures) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const sig of signatures) {
    const page = pages[sig.page];
    if (!page) continue;

    const { height } = page.getSize();
    const imgBytes = Buffer.from(sig.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
    const sigImage = await pdfDoc.embedPng(imgBytes);

    // PDF coordinates: y=0 is bottom, so we flip
    const pdfY = height - sig.y - sig.height;

    page.drawImage(sigImage, {
      x: sig.x,
      y: pdfY,
      width: sig.width,
      height: sig.height,
    });
  }

  return await pdfDoc.save();
}

module.exports = { burnSignatures };
