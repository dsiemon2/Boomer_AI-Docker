import { Router, Response } from 'express';
import { z } from 'zod';
import * as userService from '../services/userService.js';
import { generateUserToken, generateSuperAdminToken, authenticateUser } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { prisma } from '../db/prisma.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  identifier: z.string().min(1), // email OR username
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  name: z.string().min(2),
  companyDomain: z.string().min(1), // Company domain to register under
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const requestResetSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
});

const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/register
 * Public registration for new users
 */
router.post('/register', async (req, res: Response) => {
  try {
    const { email, username, password, name, companyDomain } = registerSchema.parse(req.body);

    // Find company by domain
    const company = await prisma.company.findUnique({
      where: { domain: companyDomain.toLowerCase() },
    });

    if (!company) {
      res.status(400).json({ success: false, error: 'Company not found' });
      return;
    }

    if (!company.isActive) {
      res.status(400).json({ success: false, error: 'Company registration is disabled' });
      return;
    }

    // Check if email is already registered
    const emailExists = await userService.isEmailRegistered(email, company.id);
    if (emailExists) {
      res.status(400).json({ success: false, error: 'Email already registered' });
      return;
    }

    // Check if username is taken (if provided)
    if (username) {
      const usernameTaken = await userService.isUsernameTaken(username, company.id);
      if (usernameTaken) {
        res.status(400).json({ success: false, error: 'Username already taken' });
        return;
      }
    }

    // Register user
    const { user, emailVerificationToken } = await userService.registerUser({
      email,
      username,
      password,
      name,
      companyId: company.id,
    });

    // TODO: Send verification email with token
    // In production, this would send an actual email
    console.log(`Verification token for ${email}: ${emailVerificationToken}`);

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      data: {
        user,
        // Include token in dev mode only
        ...(process.env.NODE_ENV !== 'production' && { verificationToken: emailVerificationToken }),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login for company users (admin/manager) - supports email OR username
 */
router.post('/login', async (req, res: Response) => {
  try {
    const { identifier, password } = loginSchema.parse(req.body);

    // Find user by email OR username
    const user = await userService.findUserByEmailOrUsername(identifier);

    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    // Validate password
    const isValid = await userService.validatePassword(user, password);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    // Check if user and company are active
    if (!user.isActive) {
      res.status(401).json({ success: false, error: 'Account is disabled' });
      return;
    }

    if (!user.company.isActive) {
      res.status(401).json({ success: false, error: 'Company account is disabled' });
      return;
    }

    // Generate token
    const token = generateUserToken({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role as 'COMPANY_ADMIN' | 'MANAGER',
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
        },
        company: {
          id: user.company.id,
          name: user.company.name,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * POST /api/auth/super-admin/login
 * Login for super admin
 */
router.post('/super-admin/login', async (req, res: Response) => {
  try {
    const { email, password } = superAdminLoginSchema.parse(req.body);

    const superAdmin = await userService.getSuperAdminByEmail(email);

    if (!superAdmin) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const isValid = await userService.validatePassword(superAdmin, password);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const token = generateSuperAdminToken({
      superAdminId: superAdmin.id,
      email: superAdmin.email,
      role: 'SUPER_ADMIN',
    });

    res.json({
      success: true,
      data: {
        token,
        superAdmin: {
          id: superAdmin.id,
          email: superAdmin.email,
          name: superAdmin.name,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Super admin login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const user = await userService.getUserById(req.user.userId, req.user.companyId);

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        user,
        companyId: req.user.companyId,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify email address using token
 */
router.post('/verify-email', async (req, res: Response) => {
  try {
    const { token } = verifyEmailSchema.parse(req.body);

    const user = await userService.verifyEmail(token);

    if (!user) {
      res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: { user },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Email verification error:', error);
    res.status(500).json({ success: false, error: 'Email verification failed' });
  }
});

/**
 * GET /api/auth/verify-email/:token
 * Verify email via GET (for clickable links in emails)
 */
router.get('/verify-email/:token', async (req, res: Response) => {
  try {
    const token = req.params.token;

    const user = await userService.verifyEmail(token);

    if (!user) {
      // Redirect to frontend with error
      res.redirect('/auth/verify-email?status=error&message=Invalid+or+expired+token');
      return;
    }

    // Redirect to frontend with success
    res.redirect('/auth/verify-email?status=success');
  } catch (error) {
    console.error('Email verification error:', error);
    res.redirect('/auth/verify-email?status=error&message=Verification+failed');
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', async (req, res: Response) => {
  try {
    const { email } = requestResetSchema.parse(req.body);

    const result = await userService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    if (result) {
      // TODO: Send password reset email with token
      // In production, this would send an actual email
      console.log(`Password reset token for ${email}: ${result.passwordResetToken}`);
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
      // Include token in dev mode only
      ...(process.env.NODE_ENV !== 'production' && result && { resetToken: result.passwordResetToken }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Password reset request failed' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password', async (req, res: Response) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    const user = await userService.resetPassword(token, password);

    if (!user) {
      res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
      data: { user },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Password reset failed' });
  }
});

/**
 * GET /api/auth/check-username/:username
 * Check if username is available (for real-time validation)
 */
router.get('/check-username/:username', async (req, res: Response) => {
  try {
    const { username } = req.params;
    const { companyDomain } = req.query;

    if (!companyDomain || typeof companyDomain !== 'string') {
      res.status(400).json({ success: false, error: 'companyDomain query param required' });
      return;
    }

    // Find company
    const company = await prisma.company.findUnique({
      where: { domain: companyDomain.toLowerCase() },
    });

    if (!company) {
      res.status(400).json({ success: false, error: 'Company not found' });
      return;
    }

    const isTaken = await userService.isUsernameTaken(username, company.id);

    res.json({
      success: true,
      data: {
        username,
        available: !isTaken,
      },
    });
  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({ success: false, error: 'Failed to check username' });
  }
});

/**
 * GET /api/auth/check-email/:email
 * Check if email is available (for real-time validation)
 */
router.get('/check-email/:email', async (req, res: Response) => {
  try {
    const { email } = req.params;
    const { companyDomain } = req.query;

    if (!companyDomain || typeof companyDomain !== 'string') {
      res.status(400).json({ success: false, error: 'companyDomain query param required' });
      return;
    }

    // Find company
    const company = await prisma.company.findUnique({
      where: { domain: companyDomain.toLowerCase() },
    });

    if (!company) {
      res.status(400).json({ success: false, error: 'Company not found' });
      return;
    }

    const isRegistered = await userService.isEmailRegistered(email, company.id);

    res.json({
      success: true,
      data: {
        email,
        available: !isRegistered,
      },
    });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ success: false, error: 'Failed to check email' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, server just acknowledges)
 */
router.post('/logout', (_req, res: Response) => {
  res.json({ success: true, message: 'Logged out' });
});

export default router;
