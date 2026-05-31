const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../lib/supabase');
const { PDFDocument } = require('pdf-lib');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Auth middleware — accepts header or query param (for iframe src)
router.use((req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.adminToken || req.query.token;
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Upload PDF
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    const fileId = uuidv4();
    const fileName = `${fileId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, req.file.buffer, { contentType: 'application/pdf' });

    if (uploadError) throw uploadError;

    const docId = uuidv4();
    const { error: dbError } = await supabase.from('documents').insert({
      id: docId,
      name: req.file.originalname,
      pdf_path: fileName,
      status: 'draft',
    });

    if (dbError) throw dbError;

    res.json({ docId, fileName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy PDF directly (avoids CORS issues with Supabase signed URLs)
router.get('/pdf-proxy/:docId', async (req, res) => {
  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('pdf_path')
      .eq('id', req.params.docId)
      .single();

    if (!doc) return res.status(404).json({ error: 'Not found' });

    const { data: fileData, error } = await supabase.storage
      .from('pdfs')
      .download(doc.pdf_path);

    if (error) throw error;

    const buffer = Buffer.from(await fileData.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get PDF page count and dimensions
router.get('/pdf-meta/:docId', async (req, res) => {
  try {
    const { data: doc } = await supabase.from('documents').select('pdf_path').eq('id', req.params.docId).single();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const { data: fileData } = await supabase.storage.from('pdfs').download(doc.pdf_path);
    const bytes = Buffer.from(await fileData.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPageCount();
    const dims = {};
    for (let i = 0; i < pages; i++) {
      const { width, height } = pdf.getPage(i).getSize();
      dims[i + 1] = { width, height };
    }
    res.json({ pages, dims });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save signature fields + signers, send first link
router.post('/send/:docId', async (req, res) => {
  try {
    const { signers, fields } = req.body;
    const docId = req.params.docId;

    // Save fields
    const fieldRows = fields.map(f => ({ ...f, document_id: docId }));
    await supabase.from('signature_fields').insert(fieldRows);

    // Save signers with unique tokens
    const signerRows = signers.map((s, i) => ({
      id: uuidv4(),
      document_id: docId,
      signer_order: i + 1,
      name: s.name,
      email: s.email,
      phone: s.phone,
      token: uuidv4(),
      signed_at: null,
    }));
    await supabase.from('signers').insert(signerRows);

    // Update doc status
    await supabase.from('documents').update({ status: 'in_progress' }).eq('id', docId);

    // Return first signer link
    const first = signerRows[0];
    const link = `${process.env.APP_URL}/sign.html?token=${first.token}`;

    res.json({ link, signerName: first.name, signerEmail: first.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List documents
router.get('/documents', async (req, res) => {
  const { data } = await supabase
    .from('documents')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false });
  res.json(data);
});

// Get all signers with status (for admin polling)
router.get('/signers/:docId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('signers')
      .select('id, name, signer_order, signed_at, token')
      .eq('document_id', req.params.docId)
      .order('signer_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download signed PDF
router.get('/download/:id', async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('name, signed_pdf_path')
      .eq('id', req.params.id)
      .single();

    if (error || !doc) return res.status(404).json({ error: 'מסמך לא נמצא' });
    if (!doc.signed_pdf_path) return res.status(404).json({ error: 'המסמך עוד לא חתום על ידי כולם' });

    const { data: fileData, error: dlErr } = await supabase.storage
      .from('pdfs')
      .download(doc.signed_pdf_path);

    if (dlErr) throw dlErr;

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const safeName = doc.name.replace(/[^\w֐-׿\s.-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName + '_חתום.pdf')}`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete document (+ files from storage)
router.delete('/documents/:id', async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('pdf_path, signed_pdf_path')
      .eq('id', req.params.id)
      .single();

    if (error || !doc) return res.status(404).json({ error: 'מסמך לא נמצא' });

    // Delete files from storage
    const toDelete = [doc.pdf_path].filter(Boolean);
    if (doc.signed_pdf_path) toDelete.push(doc.signed_pdf_path);
    if (toDelete.length) await supabase.storage.from('pdfs').remove(toDelete);

    // Delete DB record (cascades to signers, fields, signatures)
    await supabase.from('documents').delete().eq('id', req.params.id);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
