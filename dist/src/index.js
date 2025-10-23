"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const morgan_1 = __importDefault(require("morgan"));
const swagger_1 = require("./swagger");
const cors_1 = __importDefault(require("cors"));
const globalErrorHandler_1 = __importDefault(require("./utils/globalErrorHandler"));
const appError_1 = __importDefault(require("./utils/appError"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.options("*", (0, cors_1.default)());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)("dev"));
(0, swagger_1.setupSwagger)(app);
console.log("hi");
const distPath = path_1.default.resolve(process.cwd(), "fe-dist");
app.use(express_1.default.static(distPath));
app.use("/api", routes_1.default);
app.get(/^\/(?!api).*/, (req, res, next) => {
    if (req.accepts("html")) {
        res.sendFile(path_1.default.join(distPath, "index.html"));
    }
    else {
        next();
    }
});
app.all("*", (req, _res, next) => {
    next(new appError_1.default(`Can't find ${req.originalUrl} on this server`, 404));
});
app.use(globalErrorHandler_1.default);
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map