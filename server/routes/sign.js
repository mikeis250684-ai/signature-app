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

    // Save signature record
    for (const field of fields) {
      await supabase.from('signatures').insert({
        document_id: signer.document_id,
        signer_id: signer.id,
        field_id: field.id,
        image_data: signatureImage,
      });
    }

    // Check next signer
    const { data: nextSigner } = await supabase
      .from('signers')
      .select('*')
      .eq('document_id', signer.document_id)
      .eq('signer_order', signer.signer_order + 1)
      .single();

    if (nextSigner) {
      // Send link to next signer
      const link = `${process.env.APP_URL}/sign.html?token=${nextSigner.token}`;
      if (nextSigner.email) {
        await sendEmail(nextSigner.email, `נדרשת חתימתך על: ${signer.documents.name}`, `
          <div dir="rtl" style="font-family: Arial; font-size: 16px;">
            <p>שלום ${nextSigner.name},</p>
            <p>מסמך <strong>${signer.documents.name}</strong> ממתין לחתימתך.</p>
            <p><a href="${link}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">לחץ כאן לחתימה</a></p>
            <p>הלינק תקף ל-30 יום.</p>
          </div>
        `);
      }
      res.json({ status: 'signed', nextSignerName: nextSigner.name, link });
    } else {
      // All signed — burn PDF and notify admin
      await finalizePdf(signer.document_id);
      res.json({ status: 'complete' });
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
