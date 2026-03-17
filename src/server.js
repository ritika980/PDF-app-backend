require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { ensureStorageDirs, startCleanupScheduler } = require('./utils/fileUtils');

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGODB_DB = process.env.MONGODB_DB || undefined;

ensureStorageDirs();
startCleanupScheduler();

async function bootstrap() {
  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI in environment variables');
  }

  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB,
  });

  console.log('MongoDB connected ✅');

  app.listen(PORT, () => {
    console.log(`PDF Master backend running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Backend startup failed:', error.message);
  process.exit(1);
});