require('dotenv').config();
const app = require('./app');
const { ensureStorageDirs, startCleanupScheduler } = require('./utils/fileUtils');

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGODB_DB = process.env.MONGODB_DB || undefined;

ensureStorageDirs();
startCleanupScheduler();

async function bootstrap() {
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI is missing. Starting backend without database connection.');
  } else {
    try {
      // Lazy-load mongoose so incompatible runtime errors are caught in startup logs.
      const mongoose = require('mongoose');
      await mongoose.connect(MONGODB_URI, {
        dbName: MONGODB_DB,
      });
      console.log('MongoDB connected ✅');
    } catch (error) {
      console.error(
        'MongoDB connection failed. Starting backend without database.',
        error && error.message ? error.message : error
      );
    }
  }

  app.listen(PORT, () => {
    console.log(`PDF Master backend running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Backend startup failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});