import express from "express";
import protect from "../middlewares/auth.middleware";
import { presignUploads } from "../controllers/fileUpload.controller";

const router = express.Router();

router.post("/presign", protect, presignUploads);

export default router;
