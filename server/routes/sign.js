const express = require('express');
const { Resend } = require('resend');
const supabase = require('../lib/supabase');
const { burnSignatures } = require('../lib/pdf');

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendEmail(to, subject, html) {
  if (!resend) { console.log('Email skipped (no RESEND_API_KEY):', subject); return; }
  await resend.emails.send({ from: 'חתימות <noreply@mkt.co.il>', to, subject, html });
}

// PDF proxy for signers (auth via token)
router.get('/pdf-proxy', async (req, res) => {
  try {
    const { token } = req.query;
    const { data: signer } = await supabase.from('signers').select('*, documents(*)').eq('token', token).single();
    if (!signer) return res.status(404).send('Not found');
    const { data: fileData } = await supabase.storage.from('pdfs').download(signer.documents.pdf_path);
    const buffer = Buffer.from(await fileData.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get signer info + document by token
router.get('/info', async (req, res) => {
  try {
    const { token } = req.query;
    const { data: signer } = await supabase
      .from('signers')
      .select('*, documents(*)')
      .eq('token', token)
      .single();

    if (!signer) return res.status(404).json({ error: 'לינק לא תקין' });
    if (signer.signed_at) return res.status(410).json({ error: 'כבר חתמת על מסמך זה' });

    const { data: fields } = await supabase
      .from('signature_fields')
      .select('*')
      .eq('document_id', signer.document_id)
      .eq('signer_order', signer.signer_order);

    const { data: urlData } = await supabase.storage
      .from('pdfs')
      .createSignedUrl(signer.documents.pdf_path, 3600);

    res.json({
      signerName: signer.name,
      docName: signer.documents.name,
      pdfUrl: urlData.signedUrl,
      fields,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit signature
router.post('/submit', async (req, res) => {
  try {
    const { token, signatureImage } = req.body;

    const { data: signer } = await supabase
      .from('signers')
      .select('*, documents(*)')
      .eq('token', token)
      .single();

    if (!signer || signer.signed_at) return res.status(400).json({ error: 'Invalid' });

    const { data: fields } = await supabase
      .from('signature_fields')
      .select('*')
      .eq('document_id', signer.document_id)
      .eq('signer_order', signer.signer_order);

    // Mark as signed
    await supabase.from('signers').update({ signed_at: new Date().toISOString() }).eq('token', token);

    // Save a signature record for EVERY field — insert all at once and check for errors
    console.log(`Saving signatures for ${fields.length} field(s):`, fields.map(f => `page ${f.page} id=${f.id}`));
    const sigRows = fields.map(f => ({
      document_id: signer.document_id,
      signer_id:   signer.id,
      field_id:    f.id,
      image_data:  signatureImage,
    }));
    const { error: sigInsertErr } = await supabase.from('signatures').insert(sigRows);
    if (sigInsertErr) {
      console.error('Signature insert error:', sigInsertErr);
      throw new Error(`שגיאה בשמירת חתימה: ${sigInsertErr.message}`);
    }
    console.log(`Saved ${sigRows.length} signature record(s) OK`);

    // Re-fetch ALL signers for this document and check in JS (avoids Supabase NULL quirks)
    const { data: allSigners, error: signersErr } = await supabase
      .from('signers')
      .select('id, name, signed_at')
      .eq('document_id', signer.document_id);

    if (signersErr) {
      console.error('Error fetching signers:', signersErr);
      return res.status(500).json({ error: signersErr.message });
    }

    const unsigned = (allSigners || []).filter(s => !s.signed_at);

    console.log(`Document ${signer.document_id}: ${allSigners.length} total signers, ${unsigned.length} still unsigned`);
    console.log('Unsigned:', unsigned.map(s => s.name));

    // Notify admin that this specific signer signed
    if (unsigned.length > 0) {
      await sendEmail(
        process.env.ADMIN_EMAIL,
        `✍️ ${signer.name} חתם על "${signer.documents.name}"`,
        `<div dir="rtl" style="font-family:Arial;font-size:16px">
          <p><strong>${signer.name}</strong> חתם על המסמך <strong>"${signer.documents.name}"</strong>.</p>
          <p>נותרו ${unsigned.length} חותמים נוספים.</p>
        </div>`
      );
    }

    if (unsigned.length === 0) {
      // Every signer is done — finalize the PDF
      await finalizePdf(signer.document_id);
      res.json({ status: 'complete' });
    } else {
      // Still waiting for others
      res.json({ status: 'signed', remaining: unsigned.length });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

async function finalizePdf(documentId) {
  const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).single();
  const { data: allSignatures } = await supabase
    .from('signatures')
    .select('*, signature_fields(*)')
    .eq('document_id', documentId);

  // Download original PDF
  const { data: pdfData } = await supabase.storage.from('pdfs').download(doc.pdf_path);
  const pdfBytes = Buffer.from(await pdfData.arrayBuffer());

  // Burn all signatures
  console.log(`Burning ${allSignatures.length} signature(s) into PDF`);
  const sigData = allSignatures.map(s => ({
    page: s.signature_fields.page,
    x: s.signature_fields.x,
    y: s.signature_fields.y,
    width: s.signature_fields.width,
    height: s.signature_fields.height,
    imageData: s.image_data,
  }));

  const signedBytes = await burnSignatures(pdfBytes, sigData);

  // Upload signed PDF
  const signedPath = doc.pdf_path.replace('.pdf', '_signed.pdf');
  await supabase.storage.from('pdfs').upload(signedPath, signedBytes, { contentType: 'application/pdf', upsert: true });

  // Update doc
  await supabase.from('documents').update({ status: 'completed', signed_pdf_path: signedPath }).eq('id', documentId);

  // Notify admin
  const { data: urlData } = await supabase.storage.from('pdfs').createSignedUrl(signedPath, 60 * 60 * 24 * 7);
  await sendEmail(process.env.ADMIN_EMAIL, `✅ המסמך "${doc.name}" נחתם על ידי כולם`, `
    <div dir="rtl" style="font-family: Arial; font-size: 16px;">
      <p>כל החותמים השלימו את חתימתם.</p>
      <p><a href="${urlData.signedUrl}">הורד את המסמך החתום</a></p>
    </div>
  `);
}

module.exports = router;
