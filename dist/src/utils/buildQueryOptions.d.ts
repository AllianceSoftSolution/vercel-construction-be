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
export declare const buildQueryOptions: (filterOptions: FilterOptions, defaultFilters?: Record<string, any>, searchableFields?: string[]) => QueryOptions;
export declare const extractQueryParams: (req: any) => FilterOptions;
export declare const buildPaginationMeta: (total: number, page: number, limit: number) => {
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
};
