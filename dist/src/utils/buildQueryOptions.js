"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPaginationMeta = exports.extractQueryParams = exports.buildQueryOptions = void 0;
const buildQueryOptions = (filterOptions, defaultFilters = {}, searchableFields = []) => {
    const { search, searchFields = searchableFields, filters = {}, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 50 } = filterOptions;
    const where = { ...defaultFilters };
    if (search && searchFields.length > 0) {
        const searchConditions = searchFields.map(field => ({
            [field]: {
                contains: search,
                mode: 'insensitive'
            }
        }));
        where.OR = searchConditions;
    }
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            if (typeof value === 'string' && value.includes(',')) {
                where[key] = { in: value.split(',').map(v => v.trim()) };
            }
            else if (typeof value === 'string' && value.startsWith('!')) {
                where[key] = { not: value.substring(1) };
            }
            else if (typeof value === 'string' && value.includes('..')) {
                const [start, end] = value.split('..');
                where[key] = {
                    gte: start,
                    lte: end
                };
            }
            else if (typeof value === 'string' && value.startsWith('>')) {
                where[key] = { gt: value.substring(1) };
            }
            else if (typeof value === 'string' && value.startsWith('<')) {
                where[key] = { lt: value.substring(1) };
            }
            else if (typeof value === 'string' && value.startsWith('>=')) {
                where[key] = { gte: value.substring(2) };
            }
            else if (typeof value === 'string' && value.startsWith('<=')) {
                where[key] = { lte: value.substring(2) };
            }
            else {
                where[key] = value;
            }
        }
    });
    const orderBy = {};
    if (sortBy) {
        orderBy[sortBy] = sortOrder;
    }
    const skip = (page - 1) * limit;
    const take = limit;
    return {
        where,
        orderBy,
        skip,
        take
    };
};
exports.buildQueryOptions = buildQueryOptions;
const extractQueryParams = (req) => {
    const { search, sortBy, sortOrder, page, limit, ...filters } = req.query;
    return {
        search: search,
        filters,
        sortBy: sortBy,
        sortOrder: sortOrder,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50
    };
};
exports.extractQueryParams = extractQueryParams;
const buildPaginationMeta = (total, page, limit) => {
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
exports.buildPaginationMeta = buildPaginationMeta;
//# sourceMappingURL=buildQueryOptions.js.map