// backend/routes/productExtraRoutes.js
import express from "express";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/products/:id/reveal-phone
 * Yêu cầu đăng nhập, log lại ai xem số, trả về số điện thoại đầy đủ
 */
router.post("/:id/reveal-phone", authMiddleware, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const viewerId = req.user.id;

    // Ghi log
    await pool.query(
      "INSERT INTO phone_reveals (product_id, viewer_id) VALUES ($1, $2)",
      [productId, viewerId]
    );

    // Lấy số điện thoại seller
    const r = await pool.query(
      `SELECT u.phone
         FROM products p
         JOIN users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [productId]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    const phone = r.rows[0].phone || "";
    res.json({ phone });
  } catch (err) {
    console.error("❌ reveal-phone:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
