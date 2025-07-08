// import { Prisma } from '@prisma/client';

export interface QueryOptions {
  where?: any;
  orderBy?: any;
  skip?: number;
  take?: number;
  include?: any;
  select?: any;
}

export interface FilterOptions {
  search?: string;
  searchFields?: string[];
  filters?: Record<string, any>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export const buildQueryOptions = (
  filterOptions: FilterOptions,
  defaultFilters: Record<string, any> = {},
  searchableFields: string[] = []
): QueryOptions => {
  const {
    search,
    searchFields = searchableFields,
    filters = {},
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 50
  } = filterOptions;

  // Build where clause
  const where: any = { ...defaultFilters };

  // Add search functionality
  if (search && searchFields.length > 0) {
    const searchConditions = searchFields.map(field => ({
      [field]: {
        contains: search,
        mode: 'insensitive' as const
      }
    }));
    where.OR = searchConditions;
  }

  // Add filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'string' && value.includes(',')) {
        // Handle array values (comma-separated)
        where[key] = { in: value.split(',').map(v => v.trim()) };
      } else if (typeof value === 'string' && value.startsWith('!')) {
        // Handle negation
        where[key] = { not: value.substring(1) };
      } else if (typeof value === 'string' && value.includes('..')) {
        // Handle range queries (e.g., "2024-01-01..2024-12-31")
        const [start, end] = value.split('..');
        where[key] = {
          gte: start,
          lte: end
        };
      } else if (typeof value === 'string' && value.startsWith('>')) {
        // Handle greater than
        where[key] = { gt: value.substring(1) };
      } else if (typeof value === 'string' && value.startsWith('<')) {
        // Handle less than
        where[key] = { lt: value.substring(1) };
      } else if (typeof value === 'string' && value.startsWith('>=')) {
        // Handle greater than or equal
        where[key] = { gte: value.substring(2) };
      } else if (typeof value === 'string' && value.startsWith('<=')) {
        // Handle less than or equal
        where[key] = { lte: value.substring(2) };
      } else {
        // Handle exact match
        where[key] = value;
      }
    }
  });

  // Build orderBy clause
  const orderBy: any = {};
  if (sortBy) {
    orderBy[sortBy] = sortOrder;
  }

  // Build pagination
  const skip = (page - 1) * limit;
  const take = limit;

  return {
    where,
    orderBy,
    skip,
    take
  };
};

// Helper function to extract query parameters from request
export const extractQueryParams = (req: any): FilterOptions => {
  const {
    search,
    sortBy,
    sortOrder,
    page,
    limit,
    ...filters
  } = req.query;

  return {
    search: search as string,
    filters,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 50
  };
};

// Helper function to build pagination metadata
export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number
) => {
  const totalPages = Math.ceil(total / limit);
  return {
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};
