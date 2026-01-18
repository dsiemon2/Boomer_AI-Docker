import { prisma } from '../db/prisma.js';
import { PaginationParams, PaginatedResponse } from '../types/index.js';

export interface CreateQuestionInput {
  text: string;
  followUps?: string[];
  evaluationCriteria?: string;
  timeAllocation?: number;
  isRequired?: boolean;
  order?: number;
  categoryId: string;
}

export interface UpdateQuestionInput {
  text?: string;
  followUps?: string[];
  evaluationCriteria?: string;
  timeAllocation?: number;
  isRequired?: boolean;
  order?: number;
  isActive?: boolean;
}

export interface ImportQuestionRow {
  category: string;
  text: string;
  followUps?: string;
  evaluationCriteria?: string;
  timeAllocation?: number;
  isRequired?: boolean;
}

/**
 * Create a new question
 */
export async function createQuestion(input: CreateQuestionInput) {
  const {
    text,
    followUps = [],
    evaluationCriteria,
    timeAllocation = 5,
    isRequired = false,
    order,
    categoryId,
  } = input;

  // Get max order if not provided
  let questionOrder = order;
  if (questionOrder === undefined) {
    const maxOrder = await prisma.question.aggregate({
      where: { categoryId },
      _max: { order: true },
    });
    questionOrder = (maxOrder._max.order ?? -1) + 1;
  }

  return prisma.question.create({
    data: {
      text,
      followUps: JSON.stringify(followUps),
      evaluationCriteria,
      timeAllocation,
      isRequired,
      order: questionOrder,
      categoryId,
    },
  });
}

/**
 * Get question by ID
 */
export async function getQuestionById(id: string) {
  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          jobRole: true,
        },
      },
    },
  });

  if (question) {
    return {
      ...question,
      followUps: JSON.parse(question.followUps) as string[],
    };
  }

  return null;
}

/**
 * List questions for a category
 */
export async function listQuestionsByCategory(categoryId: string, activeOnly = true) {
  const where: Record<string, unknown> = { categoryId };
  if (activeOnly) {
    where.isActive = true;
  }

  const questions = await prisma.question.findMany({
    where,
    orderBy: { order: 'asc' },
  });

  return questions.map(q => ({
    ...q,
    followUps: JSON.parse(q.followUps) as string[],
  }));
}

/**
 * List questions for a job role (all categories)
 */
export async function listQuestionsByJobRole(
  jobRoleId: string,
  companyId: string,
  pagination?: PaginationParams
): Promise<PaginatedResponse<unknown>> {
  const categories = await prisma.questionCategory.findMany({
    where: { jobRoleId, companyId },
    select: { id: true },
  });

  const categoryIds = categories.map(c => c.id);

  const baseWhere = {
    categoryId: { in: categoryIds },
    isActive: true,
  };

  if (pagination) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where: baseWhere,
        skip,
        take: pageSize,
        orderBy: { order: 'asc' },
        include: {
          category: true,
        },
      }),
      prisma.question.count({ where: baseWhere }),
    ]);

    return {
      items: questions.map(q => ({
        ...q,
        followUps: JSON.parse(q.followUps) as string[],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  const questions = await prisma.question.findMany({
    where: baseWhere,
    orderBy: { order: 'asc' },
    include: {
      category: true,
    },
  });

  return {
    items: questions.map(q => ({
      ...q,
      followUps: JSON.parse(q.followUps) as string[],
    })),
    total: questions.length,
    page: 1,
    pageSize: questions.length,
    totalPages: 1,
  };
}

/**
 * Update question
 */
export async function updateQuestion(id: string, input: UpdateQuestionInput) {
  const data: Record<string, unknown> = {};

  if (input.text !== undefined) data.text = input.text;
  if (input.followUps !== undefined) data.followUps = JSON.stringify(input.followUps);
  if (input.evaluationCriteria !== undefined) data.evaluationCriteria = input.evaluationCriteria;
  if (input.timeAllocation !== undefined) data.timeAllocation = input.timeAllocation;
  if (input.isRequired !== undefined) data.isRequired = input.isRequired;
  if (input.order !== undefined) data.order = input.order;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const question = await prisma.question.update({
    where: { id },
    data,
  });

  return {
    ...question,
    followUps: JSON.parse(question.followUps) as string[],
  };
}

/**
 * Delete (deactivate) question
 */
export async function deleteQuestion(id: string) {
  return prisma.question.update({
    where: { id },
    data: { isActive: false },
  });
}

/**
 * Reorder questions within a category
 */
export async function reorderQuestions(categoryId: string, orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    prisma.question.update({
      where: { id },
      data: { order: index },
    })
  );

  return prisma.$transaction(updates);
}

/**
 * Bulk import questions from CSV data
 */
export async function importQuestions(
  jobRoleId: string,
  companyId: string,
  rows: ImportQuestionRow[]
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  // Group by category
  const byCategory = new Map<string, ImportQuestionRow[]>();
  for (const row of rows) {
    const categoryName = row.category.trim();
    if (!byCategory.has(categoryName)) {
      byCategory.set(categoryName, []);
    }
    byCategory.get(categoryName)!.push(row);
  }

  // Process each category
  for (const [categoryName, questions] of byCategory) {
    // Find or create category
    let category = await prisma.questionCategory.findFirst({
      where: { name: categoryName, jobRoleId },
    });

    if (!category) {
      const maxOrder = await prisma.questionCategory.aggregate({
        where: { jobRoleId },
        _max: { order: true },
      });

      category = await prisma.questionCategory.create({
        data: {
          name: categoryName,
          order: (maxOrder._max.order ?? -1) + 1,
          jobRoleId,
          companyId,
        },
      });
    }

    // Get current max question order
    const maxQuestionOrder = await prisma.question.aggregate({
      where: { categoryId: category.id },
      _max: { order: true },
    });
    let nextOrder = (maxQuestionOrder._max.order ?? -1) + 1;

    // Create questions
    for (const row of questions) {
      try {
        const followUps = row.followUps
          ? row.followUps.split('|').map(f => f.trim()).filter(Boolean)
          : [];

        await prisma.question.create({
          data: {
            text: row.text,
            followUps: JSON.stringify(followUps),
            evaluationCriteria: row.evaluationCriteria,
            timeAllocation: row.timeAllocation ?? 5,
            isRequired: row.isRequired ?? false,
            order: nextOrder++,
            categoryId: category.id,
          },
        });
        imported++;
      } catch (error) {
        errors.push(`Failed to import question "${row.text.slice(0, 50)}...": ${error}`);
      }
    }
  }

  return { imported, errors };
}
