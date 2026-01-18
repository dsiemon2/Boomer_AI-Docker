// Boomer AI Type Definitions

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// User for authenticated requests
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
}
