export type PurchaseOrderPdfApproval = {
    role?: string | null;
    name?: string | null;
    status?: string | null;
};
export type PurchaseOrderPdfData = {
    referenceNumber: string;
    createdAt: Date | string;
    projectName: string;
    vendorName: string;
    sectionName: string;
    deliverTo: string;
    itemName: string;
    unit: string;
    unitPrice?: number | string | null;
    quantity: number | string;
    createdByName?: string | null;
    approvals?: PurchaseOrderPdfApproval[];
};
export declare const generatePurchaseOrderPdf: (data: PurchaseOrderPdfData) => Promise<Buffer>;
