import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /auth/login
 * Login page
 */
router.get('/login', (req: Request, res: Response) => {
  const { registered, verified, reset } = req.query;
  res.render('auth/login', {
    registered: registered === 'true',
    verified: verified === 'true',
    reset: reset === 'true',
  });
});

/**
 * GET /auth/register
 * Registration page
 */
router.get('/register', (_req: Request, res: Response) => {
  res.render('auth/register');
});

/**
 * GET /auth/forgot-password
 * Forgot password page
 */
router.get('/forgot-password', (_req: Request, res: Response) => {
  res.render('auth/forgot-password');
});

/**
 * GET /auth/reset-password
 * Reset password page (expects ?token=xxx)
 */
router.get('/reset-password', (_req: Request, res: Response) => {
  res.render('auth/reset-password');
});

/**
 * GET /auth/verify-email
 * Email verification result page
 */
router.get('/verify-email', (_req: Request, res: Response) => {
  res.render('auth/verify-email');
});

export default router;
