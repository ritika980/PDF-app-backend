const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const { PDFDocument } = require('pdf-lib');

const { parseRanges } = require('../utils/parseRanges');
const { outputsDir, deleteFilesSafe, scheduleDelete } = require('../utils/fileUtils');
const { createHttpError } = require('../middleware/errorHandler');

const execFileAsync = promisify(execFile);

function sendAndCleanup(res, filePath, downloadName, contentType = 'application/octet-stream') {
  scheduleDelete(filePath);
  res.setHeader('Content-Type', contentType);
  res.download(filePath, downloadName, () => {
    fs.promises.unlink(filePath).catch(() => {});
  });
}

async function mergePdf(req, res, next) {
  const files = req.files || [];

  if (files.length < 2) {
    deleteFilesSafe(files);
    return next(createHttpError(400, 'Please upload at least 2 PDF files.'));
  }

  try {
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      if (file.mimetype !== 'application/pdf') {
        throw createHttpError(400, `File ${file.originalname} is not a PDF.`);
      }

      const bytes = await fs.promises.readFile(file.path);
      const sourcePdf = await PDFDocument.load(bytes);
      const pageIndices = sourcePdf.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const outputBytes = await mergedPdf.save({ useObjectStreams: true });
    const outputPath = path.join(outputsDir, `merged-${Date.now()}-${crypto.randomUUID()}.pdf`);
    await fs.promises.writeFile(outputPath, outputBytes);

    deleteFilesSafe(files);
    sendAndCleanup(res, outputPath, 'merged.pdf', 'application/pdf');
  } catch (error) {
    deleteFilesSafe(files);
    next(error);
  }
}

async function splitPdf(req, res, next) {
  const file = req.file;
  if (!file) {
    return next(createHttpError(400, 'Please upload a PDF file.'));
  }

  if (file.mimetype !== 'application/pdf') {
    deleteFilesSafe([file]);
    return next(createHttpError(400, 'Only PDF file is allowed.'));
  }

  try {
    const bytes = await fs.promises.readFile(file.path);
    const sourcePdf = await PDFDocument.load(bytes);
    const totalPages = sourcePdf.getPageCount();
    const requestedRanges = req.body.ranges || '';
    const pageIndexes = requestedRanges
      ? parseRanges(requestedRanges, totalPages)
      : sourcePdf.getPageIndices();

    if (!pageIndexes.length) {
      throw createHttpError(400, 'No pages selected for split.');
    }

    const zipPath = path.join(outputsDir, `split-${Date.now()}-${crypto.randomUUID()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const finalizePromise = new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
    });

    archive.pipe(output);

    for (const pageIndex of pageIndexes) {
      const singleDoc = await PDFDocument.create();
      const [page] = await singleDoc.copyPages(sourcePdf, [pageIndex]);
      singleDoc.addPage(page);
      const pageBytes = await singleDoc.save({ useObjectStreams: true });
      archive.append(Buffer.from(pageBytes), { name: `page-${pageIndex + 1}.pdf` });
    }

    await archive.finalize();
    await finalizePromise;

    deleteFilesSafe([file]);
    sendAndCleanup(res, zipPath, 'split-pages.zip', 'application/zip');
  } catch (error) {
    deleteFilesSafe([file]);
    next(error);
  }
}

async function compressPdf(req, res, next) {
  const file = req.file;
  if (!file) {
    return next(createHttpError(400, 'Please upload a PDF file.'));
  }

  if (file.mimetype !== 'application/pdf') {
    deleteFilesSafe([file]);
    return next(createHttpError(400, 'Only PDF file is allowed.'));
  }

  try {
    const bytes = await fs.promises.readFile(file.path);
    const pdf = await PDFDocument.load(bytes);

    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    pdf.setProducer('PDF Master');
    pdf.setCreator('PDF Master');

    const outputBytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    const outputPath = path.join(outputsDir, `compressed-${Date.now()}-${crypto.randomUUID()}.pdf`);
    await fs.promises.writeFile(outputPath, outputBytes);

    deleteFilesSafe([file]);
    sendAndCleanup(res, outputPath, 'compressed.pdf', 'application/pdf');
  } catch (error) {
    deleteFilesSafe([file]);
    next(error);
  }
}

async function imageToPdf(req, res, next) {
  const files = req.files || [];
  if (!files.length) {
    return next(createHttpError(400, 'Please upload image files.'));
  }

  try {
    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
      const imageBytes = await fs.promises.readFile(file.path);
      const isPng = file.mimetype === 'image/png';
      const embedded = isPng
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

      const { width, height } = embedded.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    const outputBytes = await pdfDoc.save({ useObjectStreams: true });
    const outputPath = path.join(outputsDir, `images-${Date.now()}-${crypto.randomUUID()}.pdf`);
    await fs.promises.writeFile(outputPath, outputBytes);

    deleteFilesSafe(files);
    sendAndCleanup(res, outputPath, 'images-to-pdf.pdf', 'application/pdf');
  } catch (error) {
    deleteFilesSafe(files);
    next(error);
  }
}

async function pdfToImage(req, res, next) {
  const file = req.file;
  if (!file) {
    return next(createHttpError(400, 'Please upload a PDF file.'));
  }

  if (file.mimetype !== 'application/pdf') {
    deleteFilesSafe([file]);
    return next(createHttpError(400, 'Only PDF file is allowed.'));
  }

  const baseOutput = path.join(outputsDir, `pdf-images-${Date.now()}-${crypto.randomUUID()}`);
  const imagePrefix = path.join(baseOutput, 'page');

  try {
    await fs.promises.mkdir(baseOutput, { recursive: true });

    await execFileAsync('pdftoppm', ['-png', file.path, imagePrefix]);

    const imageFiles = (await fs.promises.readdir(baseOutput))
      .filter((name) => name.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!imageFiles.length) {
      throw createHttpError(500, 'No images generated from PDF.');
    }

    const zipPath = path.join(outputsDir, `pdf-to-image-${Date.now()}-${crypto.randomUUID()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const finalizePromise = new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
    });

    archive.pipe(output);

    for (const imageName of imageFiles) {
      archive.file(path.join(baseOutput, imageName), { name: imageName });
    }

    await archive.finalize();
    await finalizePromise;

    await fs.promises.rm(baseOutput, { recursive: true, force: true });
    deleteFilesSafe([file]);

    sendAndCleanup(res, zipPath, 'pdf-images.zip', 'application/zip');
  } catch (error) {
    await fs.promises.rm(baseOutput, { recursive: true, force: true }).catch(() => {});
    deleteFilesSafe([file]);

    if (error.code === 'ENOENT') {
      return next(
        createHttpError(
          500,
          'PDF to image tool requires poppler utils (pdftoppm). Install poppler-utils on server.'
        )
      );
    }

    next(error);
  }
}

async function officeToPdf(req, res, next) {
  const file = req.file;
  if (!file) {
    return next(createHttpError(400, 'Please upload an Office file.'));
  }

  const officeKind = String(req.body.officeKind || '').toLowerCase();
  const kindToMime = {
    word: new Set([
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
    excel: new Set([
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
    ppt: new Set([
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]),
  };

  if (officeKind && kindToMime[officeKind] && !kindToMime[officeKind].has(file.mimetype)) {
    deleteFilesSafe([file]);
    return next(createHttpError(400, `Uploaded file does not match selected tool (${officeKind}).`));
  }

  try {
    let libre;
    try {
      libre = require('libreoffice-convert');
    } catch {
      throw createHttpError(
        501,
        'Office conversion dependency is missing. Install libreoffice-convert and LibreOffice.'
      );
    }

    const convertAsync = promisify(libre.convert);
    const inputBuffer = await fs.promises.readFile(file.path);
    const pdfBuffer = await convertAsync(inputBuffer, '.pdf', undefined);

    const outputPath = path.join(outputsDir, `office-${Date.now()}-${crypto.randomUUID()}.pdf`);
    await fs.promises.writeFile(outputPath, pdfBuffer);

    deleteFilesSafe([file]);
    sendAndCleanup(res, outputPath, 'office-converted.pdf', 'application/pdf');
  } catch (error) {
    deleteFilesSafe([file]);

    if (error.message && /soffice|libreoffice|ENOENT/i.test(error.message)) {
      return next(
        createHttpError(
          500,
          'LibreOffice is not installed on server. Install LibreOffice to enable Office to PDF conversion.'
        )
      );
    }

    next(error);
  }
}

module.exports = {
  mergePdf,
  splitPdf,
  compressPdf,
  imageToPdf,
  pdfToImage,
  officeToPdf,
};
