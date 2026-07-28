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
const PORT = Number(process.env.PORT) || 5000;
const isVercel = Boolean(process.env.VERCEL);

// Middlewares
app.use(express.json());
app.use(cors());
app.options("*", cors());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
setupSwagger(app);

// On AWS/Docker, optionally serve the Vite build from fe-dist.
// On Vercel the frontend is a separate project — API only.
if (!isVercel) {
  const distPath = path.resolve(process.cwd(), "fe-dist");
  app.use(express.static(distPath));

  app.use("/api", routes);

  app.get(/^\/(?!api).*/, (req, res, next) => {
    if (req.accepts("html")) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      next();
    }
  });
} else {
  app.use("/api", routes);
}

app.all("*", (req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});
app.use(globalErrorHandler);

// Long-running server for local/Docker/AWS. Vercel uses the exported app.
if (!isVercel) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
