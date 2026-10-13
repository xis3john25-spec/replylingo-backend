import express from "express";
import multer from "multer";

import auth from "../middleware/auth.js";
import deviceId from "../middleware/deviceId.js";
import requireSignedIn from "../middleware/requireSignedIn.js";
import usageLimit from "../middleware/usageLimit.js";
import { translateMessage } from "../controllers/translate.controller.js";

const router = express.Router();

// Store uploaded audio temporarily in uploads/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // ~15MB hard ceiling, well above a real 3-min clip
  },
});

router.post(
  "/message",
  deviceId,
  auth,
  requireSignedIn,
  usageLimit,
  upload.single("audio"),
  translateMessage
);

export default router;