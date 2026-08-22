"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pettyCashController = __importStar(require("../controllers/pettyCash.controller"));
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const s3UploadMiddleware_1 = require("../middlewares/s3UploadMiddleware");
const router = express_1.default.Router();
router.get("/summary", auth_middleware_1.default, pettyCashController.getSummary);
router.get("/summary/by-project", auth_middleware_1.default, pettyCashController.getSummaryByProject);
router.get("/summary/by-section", auth_middleware_1.default, pettyCashController.getSummaryBySection);
router.get("/projects/:projectId/balance", auth_middleware_1.default, pettyCashController.getProjectBalance);
router.get("/expense-heads", auth_middleware_1.default, pettyCashController.getExpenseHeads);
router.post("/expense-heads", auth_middleware_1.default, pettyCashController.createExpenseHead);
router.put("/expense-heads/:id", auth_middleware_1.default, pettyCashController.updateExpenseHead);
router.delete("/expense-heads/:id", auth_middleware_1.default, pettyCashController.deleteExpenseHead);
router.get("/transactions", auth_middleware_1.default, pettyCashController.getTransactions);
router.post("/pool", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfExpense", maxCount: 1 }]), pettyCashController.addPettyCashPool);
router.post("/funding", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfExpense", maxCount: 1 }]), pettyCashController.addFunding);
router.post("/internal-expense", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfExpense", maxCount: 1 }]), pettyCashController.addInternalExpense);
router.post("/distribution", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfExpense", maxCount: 1 }]), pettyCashController.addDistribution);
router.post("/section-expense", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfExpense", maxCount: 1 }]), pettyCashController.addSectionExpense);
router.get("/projects/:projectId/sections", auth_middleware_1.default, pettyCashController.getProjectSections);
router.get("/projects/:projectId/accountants", auth_middleware_1.default, pettyCashController.getProjectAccountants);
exports.default = router;
//# sourceMappingURL=pettyCash.js.map