import express from "express";
import {
  getCart,
  addToCart,
  updateCart,
  deleteCartItem,
} from "../controllers/cartController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cần xác thực user
router.get("/", authMiddleware, getCart);
router.post("/", authMiddleware, addToCart);
router.put("/:id", authMiddleware, updateCart);
router.delete("/:id", authMiddleware, deleteCartItem);

export default router;
