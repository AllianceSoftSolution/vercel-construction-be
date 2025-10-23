"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const demand_controller_1 = require("../controllers/demand.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, demand_controller_1.createDemand);
router.get("/", auth_middleware_1.default, demand_controller_1.getDemands);
router.get("/:id", auth_middleware_1.default, demand_controller_1.getDemandById);
router.put("/:id", auth_middleware_1.default, demand_controller_1.updateDemand);
router.delete("/:id", auth_middleware_1.default, demand_controller_1.deleteDemand);
router.patch("/:id/status", auth_middleware_1.default, demand_controller_1.updateDemandStatus);
router.post("/:id/approve", auth_middleware_1.default, demand_controller_1.approveDemand);
router.post("/:id/reject", auth_middleware_1.default, demand_controller_1.rejectDemand);
router.post("/:id/fulfill", auth_middleware_1.default, demand_controller_1.fulfillDemand);
exports.default = router;
//# sourceMappingURL=demand.js.map