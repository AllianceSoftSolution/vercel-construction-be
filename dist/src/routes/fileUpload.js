"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const fileUpload_controller_1 = require("../controllers/fileUpload.controller");
const router = express_1.default.Router();
router.post("/presign", auth_middleware_1.default, fileUpload_controller_1.presignUploads);
exports.default = router;
//# sourceMappingURL=fileUpload.js.map