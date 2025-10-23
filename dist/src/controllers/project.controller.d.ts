declare const createProject: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const getProjects: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const getProjectById: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const updateProject: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const deleteProject: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const activateProject: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
declare const deactivateProject: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void;
export { createProject, getProjects, getProjectById, updateProject, deleteProject, activateProject, deactivateProject, };
