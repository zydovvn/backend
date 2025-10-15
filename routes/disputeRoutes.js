import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createDispute,
  listMyDisputes,
  getDisputeDetail,
  addEvidence,
  adminSetStatus,
  adminSetResolution,
} from "../controllers/disputeController.js";

const router = Router();

router.post("/", authMiddleware, createDispute);
router.get("/", authMiddleware, listMyDisputes);
router.get("/:id", authMiddleware, getDisputeDetail);
router.post("/:id/evidences", authMiddleware, addEvidence);

router.patch("/:id/status", authMiddleware, adminSetStatus);
router.post("/:id/resolution", authMiddleware, adminSetResolution);

export default router;
