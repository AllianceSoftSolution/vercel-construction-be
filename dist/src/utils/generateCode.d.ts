export declare const generateProjectCode: () => Promise<string>;
export declare const generateSectionCode: (projectId: string) => Promise<string>;
export declare const generateDemandCode: (projectId: string) => Promise<string>;
export declare const generatePOReferenceNumber: (demandId: string) => Promise<string>;
export declare const generateEmployeeId: (role: string) => Promise<string>;
