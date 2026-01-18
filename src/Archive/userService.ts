import { prisma } from '../db/prisma.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { Role, PaginationParams, PaginatedResponse } from '../types/index.js';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: Role;
  companyId: string;
}

export interface RegisterUserInput {
  email: string;
  username?: string;
  password: string;
  name: string;
  companyId: string;
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  name?: string;
  role?: Role;
  isActive?: boolean;
}

/**
 * Create a new user
 */
export async function createUser(input: CreateUserInput) {
  const { email, password, name, role, companyId } = input;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role,
      companyId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * Get user by ID (within company context)
 */
export async function getUserById(id: string, companyId: string) {
  return prisma.user.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Get user by email (for login)
 */
export async function getUserByEmail(email: string, companyId?: string) {
  const where: Record<string, unknown> = { email: email.toLowerCase() };
  if (companyId) {
    where.companyId = companyId;
  }

  return prisma.user.findFirst({
    where,
    include: {
      company: {
        select: {
          id: true,
          name: true,
          domain: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * Find user by email across all companies (for login with email only)
 */
export async function findUserByEmailGlobal(email: string) {
  return prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          domain: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * List users in a company
 */
export async function listUsers(
  companyId: string,
  pagination: PaginationParams
): Promise<PaginatedResponse<unknown>> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { companyId },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where: { companyId } }),
  ]);

  return {
    items: users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Update user
 */
export async function updateUser(id: string, companyId: string, input: UpdateUserInput) {
  const data: Record<string, unknown> = {};

  if (input.email !== undefined) data.email = input.email.toLowerCase();
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (input.password !== undefined) {
    data.password = await bcrypt.hash(input.password, config.bcryptRounds);
  }

  return prisma.user.update({
    where: { id, companyId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });
}

/**
 * Delete user
 */
export async function deleteUser(id: string, companyId: string) {
  return prisma.user.delete({
    where: { id, companyId },
  });
}

/**
 * Validate user password
 */
export async function validatePassword(user: { password: string }, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}

/**
 * Get super admin by email
 */
export async function getSuperAdminByEmail(email: string) {
  return prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });
}

/**
 * Create super admin
 */
export async function createSuperAdmin(email: string, password: string, name: string) {
  const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

  return prisma.superAdmin.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
    },
  });
}

// ============================================
// REGISTRATION & AUTH FUNCTIONS
// ============================================

/**
 * Generate a random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Register a new user (public registration)
 */
export async function registerUser(input: RegisterUserInput) {
  const { email, username, password, name, companyId } = input;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

  // Generate email verification token (expires in 24 hours)
  const emailVerificationToken = generateToken();
  const emailVerificationExpires = new Date();
  emailVerificationExpires.setHours(emailVerificationExpires.getHours() + 24);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username: username?.toLowerCase(),
      password: hashedPassword,
      name,
      role: 'MANAGER', // Default role for self-registration
      companyId,
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  return { user, emailVerificationToken };
}

/**
 * Check if email is already registered in a company
 */
export async function isEmailRegistered(email: string, companyId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      companyId,
    },
  });
  return !!user;
}

/**
 * Check if username is already taken in a company
 */
export async function isUsernameTaken(username: string, companyId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: {
      username: username.toLowerCase(),
      companyId,
    },
  });
  return !!user;
}

/**
 * Verify email using token
 */
export async function verifyEmail(token: string) {
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: token,
      emailVerificationExpires: { gte: new Date() },
    },
  });

  if (!user) {
    return null;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
    },
  });
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string, companyId?: string) {
  const where: Record<string, unknown> = { email: email.toLowerCase() };
  if (companyId) {
    where.companyId = companyId;
  }

  const user = await prisma.user.findFirst({ where });

  if (!user) {
    return null;
  }

  // Generate reset token (expires in 1 hour)
  const passwordResetToken = generateToken();
  const passwordResetExpires = new Date();
  passwordResetExpires.setHours(passwordResetExpires.getHours() + 1);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken,
      passwordResetExpires,
    },
  });

  return { user, passwordResetToken };
}

/**
 * Reset password using token
 */
export async function resetPassword(token: string, newPassword: string) {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gte: new Date() },
    },
  });

  if (!user) {
    return null;
  }

  const hashedPassword = await bcrypt.hash(newPassword, config.bcryptRounds);

  return prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

/**
 * Find user by email or username (for login)
 */
export async function findUserByEmailOrUsername(identifier: string) {
  const lowerIdentifier = identifier.toLowerCase();

  return prisma.user.findFirst({
    where: {
      OR: [
        { email: lowerIdentifier },
        { username: lowerIdentifier },
      ],
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          domain: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * Link OAuth provider to user
 */
export async function linkOAuthProvider(
  userId: string,
  provider: 'google' | 'microsoft' | 'apple',
  providerId: string
) {
  const data: Record<string, string> = {};

  switch (provider) {
    case 'google':
      data.googleId = providerId;
      break;
    case 'microsoft':
      data.microsoftId = providerId;
      break;
    case 'apple':
      data.appleId = providerId;
      break;
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      googleId: true,
      microsoftId: true,
      appleId: true,
    },
  });
}

/**
 * Find user by OAuth provider ID
 */
export async function findUserByOAuthProvider(
  provider: 'google' | 'microsoft' | 'apple',
  providerId: string
) {
  const where: Record<string, string> = {};

  switch (provider) {
    case 'google':
      where.googleId = providerId;
      break;
    case 'microsoft':
      where.microsoftId = providerId;
      break;
    case 'apple':
      where.appleId = providerId;
      break;
  }

  return prisma.user.findFirst({
    where,
    include: {
      company: {
        select: {
          id: true,
          name: true,
          domain: true,
          isActive: true,
        },
      },
    },
  });
}
