import { prisma } from '../db/prisma.js';
import { PaginationParams, PaginatedResponse } from '../types/index.js';

export interface CreateJobRoleInput {
  title: string;
  description?: string;
  companyId: string;
}

export interface UpdateJobRoleInput {
  title?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateCategoryInput {
  name: string;
  order?: number;
  jobRoleId: string;
  companyId: string;
}

/**
 * Create a new job role
 */
export async function createJobRole(input: CreateJobRoleInput) {
  const { title, description, companyId } = input;

  return prisma.jobRole.create({
    data: {
      title,
      description,
      companyId,
    },
  });
}

/**
 * Get job role by ID (within company context)
 */
export async function getJobRoleById(id: string, companyId: string) {
  return prisma.jobRole.findFirst({
    where: { id, companyId },
    include: {
      categories: {
        orderBy: { order: 'asc' },
        include: {
          questions: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
          },
        },
      },
      _count: {
        select: { interviews: true },
      },
    },
  });
}

/**
 * List job roles for a company
 */
export async function listJobRoles(
  companyId: string,
  pagination: PaginationParams,
  activeOnly = false
): Promise<PaginatedResponse<unknown>> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { companyId };
  if (activeOnly) {
    where.isActive = true;
  }

  const [jobRoles, total] = await Promise.all([
    prisma.jobRole.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { title: 'asc' },
      include: {
        _count: {
          select: {
            categories: true,
            interviews: true,
          },
        },
      },
    }),
    prisma.jobRole.count({ where }),
  ]);

  return {
    items: jobRoles,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Update job role
 */
export async function updateJobRole(id: string, companyId: string, input: UpdateJobRoleInput) {
  return prisma.jobRole.update({
    where: { id, companyId },
    data: input,
  });
}

/**
 * Delete (archive) job role
 */
export async function deleteJobRole(id: string, companyId: string) {
  // Soft delete by setting isActive to false
  return prisma.jobRole.update({
    where: { id, companyId },
    data: { isActive: false },
  });
}

/**
 * Create a question category
 */
export async function createCategory(input: CreateCategoryInput) {
  const { name, order, jobRoleId, companyId } = input;

  // Get max order if not provided
  let categoryOrder = order;
  if (categoryOrder === undefined) {
    const maxOrder = await prisma.questionCategory.aggregate({
      where: { jobRoleId },
      _max: { order: true },
    });
    categoryOrder = (maxOrder._max.order ?? -1) + 1;
  }

  return prisma.questionCategory.create({
    data: {
      name,
      order: categoryOrder,
      jobRoleId,
      companyId,
    },
  });
}

/**
 * Get categories for a job role
 */
export async function getCategoriesByJobRole(jobRoleId: string, companyId: string) {
  return prisma.questionCategory.findMany({
    where: { jobRoleId, companyId },
    orderBy: { order: 'asc' },
    include: {
      questions: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
      },
    },
  });
}

/**
 * Update category
 */
export async function updateCategory(id: string, companyId: string, data: { name?: string; order?: number }) {
  return prisma.questionCategory.update({
    where: { id, companyId },
    data,
  });
}

/**
 * Delete category (and all its questions)
 */
export async function deleteCategory(id: string, companyId: string) {
  return prisma.questionCategory.delete({
    where: { id, companyId },
  });
}

/**
 * Reorder categories
 */
export async function reorderCategories(jobRoleId: string, companyId: string, orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    prisma.questionCategory.update({
      where: { id, companyId },
      data: { order: index },
    })
  );

  return prisma.$transaction(updates);
}
