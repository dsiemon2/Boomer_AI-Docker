// Boomer AI Authentication Routes
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'boomer-ai-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Helper to get basePath from request headers (set by nginx)
function getBasePath(req: Request): string {
  return (req.headers['x-forwarded-prefix'] as string) || '';
}

// ===== VIEW ROUTES =====

// Login page
router.get('/login', (req: Request, res: Response) => {
  const message = req.query.message as string;
  const error = req.query.error as string;
  const basePath = getBasePath(req);
  res.render('auth/login', { message, error, basePath });
});

// Register page
router.get('/register', (req: Request, res: Response) => {
  const basePath = getBasePath(req);
  res.render('auth/register', { error: null, basePath });
});

// Logout
router.get('/logout', (req: Request, res: Response) => {
  const basePath = getBasePath(req);
  res.clearCookie('token');
  res.redirect(`${basePath}/auth/login?message=logged_out`);
});

// ===== API ROUTES =====

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
      }
      return res.render('auth/register', { error: 'Name, email, and password are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(400).json({ success: false, error: 'An account with this email already exists' });
      }
      return res.render('auth/register', { error: 'An account with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        phone: phone || null,
      },
    });

    logger.info({ userId: user.id, email: user.email }, 'New user registered');

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({
        success: true,
        data: {
          user: { id: user.id, name: user.name, email: user.email },
          token,
        },
      });
    }

    // Redirect to voice assistant
    const basePath = getBasePath(req);
    res.redirect(`${basePath}/chat`);
  } catch (error) {
    logger.error({ error }, 'Registration error');
    const basePath = getBasePath(req);
    if (req.headers['content-type']?.includes('application/json')) {
      return res.status(500).json({ success: false, error: 'Registration failed' });
    }
    res.render('auth/register', { error: 'Registration failed. Please try again.', basePath });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const basePath = getBasePath(req);
  try {
    const { email, password } = req.body;

    // Validate
    if (!email || !password) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
      }
      return res.render('auth/login', { error: 'Email and password are required', message: null, basePath });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      return res.render('auth/login', { error: 'Invalid email or password', message: null, basePath });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      return res.render('auth/login', { error: 'Invalid email or password', message: null, basePath });
    }

    // Check if active
    if (!user.isActive) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(403).json({ success: false, error: 'Account is disabled' });
      }
      return res.render('auth/login', { error: 'Account is disabled', message: null, basePath });
    }

    logger.info({ userId: user.id, email: user.email }, 'User logged in');

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({
        success: true,
        data: {
          user: { id: user.id, name: user.name, email: user.email },
          token,
        },
      });
    }

    // Redirect to voice assistant
    res.redirect(`${basePath}/chat`);
  } catch (error) {
    logger.error({ error }, 'Login error');
    if (req.headers['content-type']?.includes('application/json')) {
      return res.status(500).json({ success: false, error: 'Login failed' });
    }
    res.render('auth/login', { error: 'Login failed. Please try again.', message: null, basePath });
  }
});

// Get current user (API)
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        timezone: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: { user } });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

export default router;
