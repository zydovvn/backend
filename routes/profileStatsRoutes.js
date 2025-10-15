// backend/routes/profileStatsRoutes.js
import express from "express";
import pool from "../models/db.js";

const router = express.Router();

/* --- Gốc: /api/sellers/:id/metrics --- */
router.get("/:id/metrics", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Thiếu user id" });

    // Lấy thông tin seller
    const infoQ = await pool.query(
      `SELECT id, username, phone, address, school, student_id, bank_name, bank_account, avatar_url
         FROM users
        WHERE id = $1`,
      [userId]
    );
    const info = infoQ.rows[0];

    // Số sản phẩm đã bán
    const soldQ = await pool.query(
      `SELECT COUNT(*)::int AS sold_count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE p.user_id = $1
          AND COALESCE(o.status, '') ILIKE ANY (ARRAY['completed','delivered','done'])`,
      [userId]
    );

    // Đánh giá trung bình & lượt đánh giá
    const rateQ = await pool.query(
      `SELECT AVG(pr.rating)::numeric(3,2) AS rating_avg, COUNT(pr.id)::int AS rating_count
         FROM product_reviews pr
         JOIN products p ON p.id = pr.product_id
        WHERE p.user_id = $1`,
      [userId]
    );

    return res.json({
      ...info,
      sold_count: soldQ.rows[0]?.sold_count || 0,
      avg_rating: Number(rateQ.rows[0]?.rating_avg || 0),
      reviews_count: Number(rateQ.rows[0]?.rating_count || 0),
    });
  } catch (e) {
    console.error("❌ seller metrics:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* --- Giữ nguyên route /stats cũ --- */
router.get("/:id/stats", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Thiếu user id" });

    const soldQ = await pool.query(
      `SELECT COUNT(*)::int AS sold_count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE p.user_id = $1
          AND COALESCE(o.status, '') ILIKE ANY (ARRAY['completed','delivered','done'])`,
      [userId]
    );

    const rateQ = await pool.query(
      `SELECT AVG(pr.rating)::numeric(3,2) AS rating_avg, COUNT(pr.id)::int AS rating_count
         FROM product_reviews pr
         JOIN products p ON p.id = pr.product_id
        WHERE p.user_id = $1`,
      [userId]
    );

    return res.json({
      user_id: userId,
      sold_count: soldQ.rows[0]?.sold_count || 0,
      rating_avg: Number(rateQ.rows[0]?.rating_avg || 0),
      rating_count: Number(rateQ.rows[0]?.rating_count || 0),
    });
  } catch (e) {
    console.error("❌ profile stats:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
