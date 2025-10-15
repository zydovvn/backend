// backend/routes/adRoutes.js
import express from "express";
import { getAds, getAd, postAd } from "../controllers/adController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getAds);
router.get("/:id", getAd);

// ✅ chỉ cho phép user đã đăng nhập mới tạo tin
router.post("/", protect, postAd);

export default router;
