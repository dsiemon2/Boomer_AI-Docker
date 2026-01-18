import { prisma } from '../db/prisma.js';
import { InterviewMode, InterviewStatus, PaginationParams, PaginatedResponse } from '../types/index.js';

export interface CreateInterviewInput {
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  mode: InterviewMode;
  scheduledAt: Date;
  duration?: number;
  notes?: string;
  jobRoleId: string;
  companyId: string;
  managerId?: string;
}

export interface UpdateInterviewInput {
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  mode?: InterviewMode;
  status?: InterviewStatus;
  scheduledAt?: Date;
  duration?: number;
  notes?: string;
  jobRoleId?: string;
}

export interface InterviewFilter {
  status?: InterviewStatus;
  jobRoleId?: string;
  managerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Create a new interview
 */
export async function createInterview(input: CreateInterviewInput) {
  const {
    candidateName,
    candidateEmail,
    candidatePhone,
    mode,
    scheduledAt,
    duration = 60,
    notes,
    jobRoleId,
    companyId,
    managerId,
  } = input;

  // Create interview with initial session
  const interview = await prisma.interview.create({
    data: {
      candidateName,
      candidateEmail: candidateEmail.toLowerCase(),
      candidatePhone,
      mode,
      scheduledAt,
      duration,
      notes,
      jobRoleId,
      companyId,
      sessions: managerId
        ? {
            create: {
              managerId,
            },
          }
        : undefined,
    },
    include: {
      jobRole: true,
      sessions: {
        include: {
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  return interview;
}

/**
 * Get interview by ID
 */
export async function getInterviewById(id: string, companyId: string) {
  return prisma.interview.findFirst({
    where: { id, companyId },
    include: {
      jobRole: {
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
        },
      },
      sessions: {
        include: {
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      result: true,
    },
  });
}

/**
 * List interviews for a company
 */
export async function listInterviews(
  companyId: string,
  pagination: PaginationParams,
  filter?: InterviewFilter
): Promise<PaginatedResponse<unknown>> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { companyId };

  if (filter?.status) {
    where.status = filter.status;
  }
  if (filter?.jobRoleId) {
    where.jobRoleId = filter.jobRoleId;
  }
  if (filter?.dateFrom || filter?.dateTo) {
    where.scheduledAt = {};
    if (filter.dateFrom) {
      (where.scheduledAt as Record<string, unknown>).gte = filter.dateFrom;
    }
    if (filter.dateTo) {
      (where.scheduledAt as Record<string, unknown>).lte = filter.dateTo;
    }
  }
  if (filter?.managerId) {
    where.sessions = {
      some: { managerId: filter.managerId },
    };
  }

  const [interviews, total] = await Promise.all([
    prisma.interview.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { scheduledAt: 'desc' },
      include: {
        jobRole: {
          select: {
            id: true,
            title: true,
          },
        },
        sessions: {
          include: {
            manager: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        result: {
          select: {
            overallScore: true,
            recommendation: true,
          },
        },
      },
    }),
    prisma.interview.count({ where }),
  ]);

  return {
    items: interviews,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * List interviews for a manager (only their interviews)
 */
export async function listManagerInterviews(
  companyId: string,
  managerId: string,
  pagination: PaginationParams,
  filter?: InterviewFilter
): Promise<PaginatedResponse<unknown>> {
  return listInterviews(companyId, pagination, { ...filter, managerId });
}

/**
 * Update interview
 */
export async function updateInterview(id: string, companyId: string, input: UpdateInterviewInput) {
  const data: Record<string, unknown> = {};

  if (input.candidateName !== undefined) data.candidateName = input.candidateName;
  if (input.candidateEmail !== undefined) data.candidateEmail = input.candidateEmail.toLowerCase();
  if (input.candidatePhone !== undefined) data.candidatePhone = input.candidatePhone;
  if (input.mode !== undefined) data.mode = input.mode;
  if (input.status !== undefined) data.status = input.status;
  if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt;
  if (input.duration !== undefined) data.duration = input.duration;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.jobRoleId !== undefined) data.jobRoleId = input.jobRoleId;

  return prisma.interview.update({
    where: { id, companyId },
    data,
    include: {
      jobRole: true,
      sessions: true,
    },
  });
}

/**
 * Cancel interview
 */
export async function cancelInterview(id: string, companyId: string) {
  return prisma.interview.update({
    where: { id, companyId },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Start interview session
 */
export async function startInterviewSession(interviewId: string, sessionId: string) {
  return prisma.$transaction([
    prisma.interview.update({
      where: { id: interviewId },
      data: { status: 'IN_PROGRESS' },
    }),
    prisma.interviewSession.update({
      where: { id: sessionId },
      data: { startedAt: new Date() },
    }),
  ]);
}

/**
 * End interview session
 */
export async function endInterviewSession(interviewId: string, sessionId: string) {
  return prisma.$transaction([
    prisma.interview.update({
      where: { id: interviewId },
      data: { status: 'COMPLETED' },
    }),
    prisma.interviewSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    }),
  ]);
}

/**
 * Add or update interview session with Teams meeting info
 */
export async function updateSessionTeamsInfo(
  sessionId: string,
  teamsMeetingId: string,
  teamsMeetingUrl: string,
  teamsJoinWebUrl: string
) {
  return prisma.interviewSession.update({
    where: { id: sessionId },
    data: {
      teamsMeetingId,
      teamsMeetingUrl,
      teamsJoinWebUrl,
    },
  });
}

/**
 * Save interview result
 */
export async function saveInterviewResult(
  interviewId: string,
  data: {
    transcript?: string;
    summary?: string;
    scorecard?: Record<string, unknown>;
    managerNotes?: string;
    overallScore?: number;
    recommendation?: string;
  }
) {
  const resultData = {
    ...data,
    scorecard: data.scorecard ? JSON.stringify(data.scorecard) : undefined,
  };

  return prisma.interviewResult.upsert({
    where: { interviewId },
    create: {
      interviewId,
      ...resultData,
    },
    update: resultData,
  });
}

/**
 * Get interview result
 */
export async function getInterviewResult(interviewId: string) {
  const result = await prisma.interviewResult.findUnique({
    where: { interviewId },
  });

  if (result) {
    return {
      ...result,
      scorecard: JSON.parse(result.scorecard),
    };
  }

  return null;
}

/**
 * Get upcoming interviews for a company
 */
export async function getUpcomingInterviews(companyId: string, limit = 10) {
  return prisma.interview.findMany({
    where: {
      companyId,
      status: 'SCHEDULED',
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    include: {
      jobRole: {
        select: { title: true },
      },
      sessions: {
        include: {
          manager: {
            select: { name: true },
          },
        },
      },
    },
  });
}

/**
 * Get interview statistics for a company
 */
export async function getInterviewStats(companyId: string, dateFrom?: Date, dateTo?: Date) {
  const where: Record<string, unknown> = { companyId };

  if (dateFrom || dateTo) {
    where.scheduledAt = {};
    if (dateFrom) (where.scheduledAt as Record<string, unknown>).gte = dateFrom;
    if (dateTo) (where.scheduledAt as Record<string, unknown>).lte = dateTo;
  }

  const [total, byStatus, byMode] = await Promise.all([
    prisma.interview.count({ where }),
    prisma.interview.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.interview.groupBy({
      by: ['mode'],
      where,
      _count: true,
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
    byMode: Object.fromEntries(byMode.map(m => [m.mode, m._count])),
  };
}

/**
 * Create a web interview session for an interview
 */
export async function createWebSession(
  interviewId: string,
  managerId?: string,
  expiresInHours: number = 72
) {
  // Check if session already exists
  const existing = await prisma.interviewSession.findFirst({
    where: { interviewId },
  });

  if (existing) {
    return existing;
  }

  // Calculate expiration time
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setHours(tokenExpiresAt.getHours() + expiresInHours);

  // Create new session
  const session = await prisma.interviewSession.create({
    data: {
      interviewId,
      managerId,
      tokenExpiresAt,
      webSessionState: 'PENDING',
    },
  });

  return session;
}

/**
 * Get comprehensive analytics dashboard data
 */
export async function getAnalyticsDashboard(companyId: string, dateFrom?: Date, dateTo?: Date) {
  const where: Record<string, unknown> = { companyId };

  if (dateFrom || dateTo) {
    where.scheduledAt = {};
    if (dateFrom) (where.scheduledAt as Record<string, unknown>).gte = dateFrom;
    if (dateTo) (where.scheduledAt as Record<string, unknown>).lte = dateTo;
  }

  const completedWhere = { ...where, status: 'COMPLETED' };

  const [
    totalInterviews,
    completedInterviews,
    byStatus,
    byMode,
    byJobRole,
    byRecommendation,
    recentInterviews,
    upcomingInterviews,
    averageScore,
  ] = await Promise.all([
    // Total interviews
    prisma.interview.count({ where }),

    // Completed interviews
    prisma.interview.count({ where: completedWhere }),

    // By status
    prisma.interview.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),

    // By mode
    prisma.interview.groupBy({
      by: ['mode'],
      where,
      _count: true,
    }),

    // By job role
    prisma.interview.groupBy({
      by: ['jobRoleId'],
      where,
      _count: true,
    }),

    // By recommendation (from results)
    prisma.interviewResult.groupBy({
      by: ['recommendation'],
      where: {
        interview: { companyId },
        recommendation: { not: null },
      },
      _count: true,
    }),

    // Recent completed interviews
    prisma.interview.findMany({
      where: { ...completedWhere },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        jobRole: { select: { title: true } },
        result: { select: { overallScore: true, recommendation: true } },
      },
    }),

    // Upcoming interviews
    prisma.interview.findMany({
      where: {
        companyId,
        status: 'SCHEDULED',
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      include: {
        jobRole: { select: { title: true } },
      },
    }),

    // Average score from completed interviews
    prisma.interviewResult.aggregate({
      where: {
        interview: { companyId },
        overallScore: { not: null },
      },
      _avg: { overallScore: true },
    }),
  ]);

  // Get job role names for the groupBy
  const jobRoleIds = byJobRole.map((j) => j.jobRoleId);
  const jobRoles = await prisma.jobRole.findMany({
    where: { id: { in: jobRoleIds } },
    select: { id: true, title: true },
  });
  const jobRoleMap = Object.fromEntries(jobRoles.map((j) => [j.id, j.title]));

  return {
    overview: {
      totalInterviews,
      completedInterviews,
      scheduledInterviews: byStatus.find((s) => s.status === 'SCHEDULED')?._count || 0,
      inProgressInterviews: byStatus.find((s) => s.status === 'IN_PROGRESS')?._count || 0,
      averageScore: averageScore._avg.overallScore || 0,
    },
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byMode: Object.fromEntries(byMode.map((m) => [m.mode, m._count])),
    byJobRole: byJobRole.map((j) => ({
      jobRoleId: j.jobRoleId,
      title: jobRoleMap[j.jobRoleId] || 'Unknown',
      count: j._count,
    })),
    byRecommendation: Object.fromEntries(
      byRecommendation.map((r) => [r.recommendation || 'NONE', r._count])
    ),
    recentInterviews: recentInterviews.map((i) => ({
      id: i.id,
      candidateName: i.candidateName,
      jobRole: i.jobRole.title,
      score: i.result?.overallScore,
      recommendation: i.result?.recommendation,
      updatedAt: i.updatedAt,
    })),
    upcomingInterviews: upcomingInterviews.map((i) => ({
      id: i.id,
      candidateName: i.candidateName,
      jobRole: i.jobRole.title,
      scheduledAt: i.scheduledAt,
    })),
  };
}

/**
 * Get score trends over time
 */
export async function getScoreTrends(companyId: string, days = 30) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const results = await prisma.interviewResult.findMany({
    where: {
      interview: {
        companyId,
        status: 'COMPLETED',
        updatedAt: { gte: dateFrom },
      },
      overallScore: { not: null },
    },
    select: {
      overallScore: true,
      interview: {
        select: { updatedAt: true },
      },
    },
    orderBy: {
      interview: { updatedAt: 'asc' },
    },
  });

  // Group by date
  const byDate: Record<string, { total: number; count: number }> = {};
  results.forEach((r) => {
    const date = r.interview.updatedAt.toISOString().split('T')[0];
    if (!byDate[date]) {
      byDate[date] = { total: 0, count: 0 };
    }
    byDate[date].total += r.overallScore || 0;
    byDate[date].count += 1;
  });

  return Object.entries(byDate).map(([date, data]) => ({
    date,
    averageScore: data.total / data.count,
    count: data.count,
  }));
}

/**
 * Get top performing candidates
 */
export async function getTopCandidates(companyId: string, limit = 10) {
  const results = await prisma.interviewResult.findMany({
    where: {
      interview: {
        companyId,
        status: 'COMPLETED',
      },
      overallScore: { gte: 4 },
      recommendation: { in: ['STRONG_YES', 'YES'] },
    },
    select: {
      overallScore: true,
      recommendation: true,
      summary: true,
      interview: {
        select: {
          id: true,
          candidateName: true,
          candidateEmail: true,
          jobRole: { select: { title: true } },
          updatedAt: true,
        },
      },
    },
    orderBy: { overallScore: 'desc' },
    take: limit,
  });

  return results.map((r) => ({
    interviewId: r.interview.id,
    candidateName: r.interview.candidateName,
    candidateEmail: r.interview.candidateEmail,
    jobRole: r.interview.jobRole.title,
    score: r.overallScore,
    recommendation: r.recommendation,
    summary: r.summary?.slice(0, 200) + (r.summary && r.summary.length > 200 ? '...' : ''),
    completedAt: r.interview.updatedAt,
  }));
}
