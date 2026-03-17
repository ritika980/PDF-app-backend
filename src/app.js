const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const pdfRoutes = require('./routes/pdfRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-master-backend' });
});

app.use('/api/pdf', pdfRoutes);

app.use(errorHandler);

module.exports = app;
