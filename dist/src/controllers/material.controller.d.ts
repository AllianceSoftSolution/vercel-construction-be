declare const createMaterial: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const getMaterials: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const getMaterialById: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const updateMaterial: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const deleteMaterial: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const activateMaterial: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const deactivateMaterial: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
export { createMaterial, getMaterials, getMaterialById, updateMaterial, deleteMaterial, activateMaterial, deactivateMaterial, };
