import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import './db.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { signingRouter } from './routes/signing.js';

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/signing', signingRouter);

// Central error handler (multer errors, unexpected failures).
app.use((err, req, res, next) => {
  if (err.message === 'Apenas arquivos PDF são permitidos') {
    return res.status(422).json({ error: 'Validation failed', errors: { file: err.message } });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(422).json({ error: 'Validation failed', errors: { file: 'O arquivo é muito grande (máx. 25 MB)' } });
  }
  console.error(err);
  res.status(500).json({ error: 'Ocorreu um erro inesperado' });
});

app.listen(config.port, () => {
  console.log(`eSign API listening on http://localhost:${config.port}`);
});
