import { prisma } from '../db/prisma.js';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';
import { PaginationParams, PaginatedResponse } from '../types/index.js';

export interface CreateCompanyInput {
  name: string;
  domain: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
}

export interface UpdateCompanyInput {
  name?: string;
  domain?: string;
  settings?: Record<string, unknown>;
  isActive?: boolean;
}

/**
 * Create a new company with initial admin user
 */
export async function createCompany(input: CreateCompanyInput) {
  const { name, domain, adminEmail, adminPassword, adminName } = input;

  // Hash password
  const hashedPassword = await bcrypt.hash(adminPassword, config.bcryptRounds);

  // Create company and admin user in transaction
  const company = await prisma.company.create({
    data: {
      name,
      domain: domain.toLowerCase(),
      users: {
        create: {
          email: adminEmail.toLowerCase(),
          password: hashedPassword,
          name: adminName,
          role: 'COMPANY_ADMIN',
        },
      },
    },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
  });

  return company;
}

/**
 * Get company by ID
 */
export async function getCompanyById(id: string) {
  return prisma.company.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          jobRoles: true,
          interviews: true,
        },
      },
    },
  });
}

/**
 * Get company by domain
 */
export async function getCompanyByDomain(domain: string) {
  return prisma.company.findUnique({
    where: { domain: domain.toLowerCase() },
  });
}

/**
 * List all companies (for super admin)
 */
export async function listCompanies(
  pagination: PaginationParams
): Promise<PaginatedResponse<unknown>> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            jobRoles: true,
            interviews: true,
          },
        },
      },
    }),
    prisma.company.count(),
  ]);

  return {
    items: companies,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Update company
 */
export async function updateCompany(id: string, input: UpdateCompanyInput) {
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.domain !== undefined) data.domain = input.domain.toLowerCase();
  if (input.settings !== undefined) data.settings = JSON.stringify(input.settings);
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return prisma.company.update({
    where: { id },
    data,
  });
}

/**
 * Delete company and all related data
 */
export async function deleteCompany(id: string) {
  return prisma.company.delete({
    where: { id },
  });
}

/**
 * Get company statistics
 */
export async function getCompanyStats(companyId: string) {
  const [
    userCount,
    jobRoleCount,
    totalInterviews,
    completedInterviews,
    scheduledInterviews,
  ] = await Promise.all([
    prisma.user.count({ where: { companyId } }),
    prisma.jobRole.count({ where: { companyId, isActive: true } }),
    prisma.interview.count({ where: { companyId } }),
    prisma.interview.count({ where: { companyId, status: 'COMPLETED' } }),
    prisma.interview.count({ where: { companyId, status: 'SCHEDULED' } }),
  ]);

  return {
    userCount,
    jobRoleCount,
    totalInterviews,
    completedInterviews,
    scheduledInterviews,
  };
}
