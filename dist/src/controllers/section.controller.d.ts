declare const createSection: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const getSections: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const getSectionById: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const updateSection: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const deleteSection: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const activateSection: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const deactivateSection: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
export { createSection, getSections, getSectionById, updateSection, deleteSection, activateSection, deactivateSection, };
