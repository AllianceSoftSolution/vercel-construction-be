import express from "express";
import dotenv from "dotenv";
import routes from "./routes";
import morgan from "morgan";
import { setupSwagger } from "./swagger";
import cors from "cors";
import globalErrorHandler from "./utils/globalErrorHandler";
import AppError from "./utils/appError";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(express.json());
app.use(cors());
app.options('*', cors());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
setupSwagger(app);
console.log("hi")

app.get("/", async (req, res) => {
    res.json({
        message: "API is working Now!",

    });
})


app.use("/api", routes);

app.all("*", (req, _res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});
app.use(globalErrorHandler);


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
