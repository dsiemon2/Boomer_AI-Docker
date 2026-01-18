import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pino from 'pino';
import http from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import cookieParser from 'cookie-parser';

// Routes
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import notificationsRouter from './routes/notifications.js';
import caregiversRouter from './routes/caregivers.js';
import smsRouter from './routes/sms.js';
import billingRouter from './routes/billing.js';
import accountRouter from './routes/account.js';
import teamsRouter from './routes/teams.js';
import boomerAdminRouter from './routes/boomerAdmin.js';

// Middleware
import { requireAuth, loadUser } from './middleware/boomerAuth.js';

// Services
import { initializeFirebase } from './services/pushNotifications.js';
import { initializeSMS } from './services/smsService.js';
import { initializeStripe } from './services/billingService.js';

// Voice handler
import { handleVoiceConnection } from './realtime/boomerVoiceHandler.js';

// Initialize services
initializeFirebase();
initializeSMS();
initializeStripe();

const app = express();
const logger = pino();

// Helper to get basePath from request headers (set by nginx)
function getBasePath(req: express.Request): string {
  return (req.headers['x-forwarded-prefix'] as string) || '';
}

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

// Health check
app.use('/healthz', healthRouter);

// Auth routes (public)
app.use('/auth', authRouter);

// Notifications API (protected)
app.use('/api/notifications', notificationsRouter);

// Caregivers API (protected)
app.use('/api/caregivers', caregiversRouter);

// SMS API
app.use('/api/sms', smsRouter);

// Billing API (webhook needs raw body)
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/api/billing', billingRouter);

// Account API
app.use('/api/account', accountRouter);

// Teams API (meeting scheduling)
app.use('/api/teams', teamsRouter);

// Admin routes
app.use('/admin', boomerAdminRouter);

// Account page
app.get('/account', requireAuth, (req, res) => {
  res.render('account', {
    title: 'Account Settings',
    user: req.user,
    basePath: getBasePath(req),
  });
});

// Billing page
app.get('/billing', requireAuth, (req, res) => {
  res.render('billing', {
    title: 'Billing',
    user: req.user,
    basePath: getBasePath(req),
  });
});

app.get('/billing/success', requireAuth, (req, res) => {
  res.render('billing', {
    title: 'Subscription Activated',
    user: req.user,
    basePath: getBasePath(req),
  });
});

// Caregiver dashboard
app.get('/caregiver', requireAuth, (req, res) => {
  res.render('caregiver/dashboard', {
    title: 'Caregiver Dashboard',
    user: req.user,
    basePath: getBasePath(req),
  });
});

// Splash/Landing page (public)
app.get('/', (req, res) => {
  res.render('index', {
    basePath: getBasePath(req),
  });
});

// Chat interface (voice assistant - protected)
app.get('/chat', requireAuth, (req, res) => {
  res.render('chat', {
    title: 'Boomer AI - Voice Assistant',
    user: req.user,
    basePath: getBasePath(req),
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 8060;
const server = http.createServer(app);

// WebSocket server for real-time voice
const voiceWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = parse(request.url || '');

  if (pathname === '/ws/voice') {
    voiceWss.handleUpgrade(request, socket, head, (ws) => {
      voiceWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Voice WebSocket handler - connects to Boomer AI Engine
voiceWss.on('connection', (ws, request) => {
  logger.info('Voice WebSocket connected');
  handleVoiceConnection(ws, request);
});

server.listen(port, () => {
  logger.info(`Boomer AI - Voice Assistant running on :${port}`);
  logger.info(`Voice interface: http://localhost:${port}/`);
  logger.info(`WebSocket: ws://localhost:${port}/ws/voice`);
});
