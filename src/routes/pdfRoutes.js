const express = require('express');
const { upload } = require('../middleware/upload');
const {
  mergePdf,
  splitPdf,
  compressPdf,
  imageToPdf,
  pdfToImage,
  officeToPdf,
  addWatermark,
} = require('../controllers/pdfController');

const router = express.Router();

router.post('/merge', upload.array('files'), mergePdf);
router.post('/split', upload.single('file'), splitPdf);
router.post('/compress', upload.single('file'), compressPdf);
router.post('/image-to-pdf', upload.array('files'), imageToPdf);
router.post('/pdf-to-image', upload.single('file'), pdfToImage);
router.post('/office-to-pdf', upload.single('file'), officeToPdf);
router.post('/watermark', upload.single('file'), addWatermark);

module.exports = router;
