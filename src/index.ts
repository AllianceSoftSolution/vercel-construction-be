import express from "express";
import dotenv from "dotenv";
import routes from "./routes";
import morgan from "morgan";
import { setupSwagger } from "./swagger";
import cors from "cors";
import globalErrorHandler from "./utils/globalErrorHandler";
import AppError from "./utils/appError";
import path from "path";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(express.json());
app.use(cors());
app.options("*", cors());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
setupSwagger(app);
console.log("hi");

// Serve static files from Vite React build (dist)
const distPath = path.join(__dirname, "../fe-dist");
app.use(express.static(distPath));

app.use("/api", routes);

// Serve React app for all non-API routes
app.get(/^\/(?!api).*/, (req, res, next) => {
  // If the request accepts HTML, serve index.html
  if (req.accepts("html")) {
    res.sendFile(path.join(distPath, "index.html"));
  } else {
    next();
  }
});

app.all("*", (req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
