const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const baseStorageDir =
  process.env.STORAGE_DIR ||
  (process.env.NODE_ENV === 'production'
    ? path.join('/tmp', 'pdf-master-storage')
    : path.join(projectRoot, 'storage'));
const uploadsDir = path.join(baseStorageDir, 'uploads');
const outputsDir = path.join(baseStorageDir, 'outputs');

function ensureStorageDirs() {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(outputsDir, { recursive: true });
}

function deleteFileSafe(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

function deleteFilesSafe(files = []) {
  files.forEach((f) => {
    if (typeof f === 'string') {
      deleteFileSafe(f);
      return;
    }
    deleteFileSafe(f.path);
  });
}

function scheduleDelete(filePath, delayMs = 15 * 60 * 1000) {
  setTimeout(() => deleteFileSafe(filePath), delayMs).unref();
}

function startCleanupScheduler() {
  const maxAgeMs = 60 * 60 * 1000;

  setInterval(async () => {
    const now = Date.now();
    const targets = [uploadsDir, outputsDir];

    for (const dir of targets) {
      try {
        const fileNames = await fs.promises.readdir(dir);
        await Promise.all(
          fileNames.map(async (fileName) => {
            const fullPath = path.join(dir, fileName);
            const stat = await fs.promises.stat(fullPath);
            if (now - stat.mtimeMs > maxAgeMs) {
              await fs.promises.unlink(fullPath).catch(() => {});
            }
          })
        );
      } catch {
        // ignore cleanup errors
      }
    }
  }, 10 * 60 * 1000).unref();
}

module.exports = {
  uploadsDir,
  outputsDir,
  ensureStorageDirs,
  deleteFilesSafe,
  scheduleDelete,
  startCleanupScheduler,
};
