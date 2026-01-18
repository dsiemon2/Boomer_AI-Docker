import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pino from 'pino';
import cookieParser from 'cookie-parser';

// Boomer AI Admin Routes
import boomerAdminRouter from './routes/boomerAdmin.js';

const app = express();
const logger = pino();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.set('views', 'views');
app.set('view engine', 'ejs');

// Boomer AI Admin Panel
app.use('/admin', boomerAdminRouter);

// Redirect root to admin
app.get('/', (req, res) => {
  const token = process.env.ADMIN_TOKEN || 'admin';
  res.redirect(`/admin?token=${token}`);
});

// Health check
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', app: 'Boomer AI Admin' });
});

const port = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 8061;

app.listen(port, () => {
  logger.info(`Boomer AI - Admin Panel running on :${port}`);
  logger.info(`Admin URL: http://localhost:${port}/admin?token=${process.env.ADMIN_TOKEN || 'admin'}`);
});
