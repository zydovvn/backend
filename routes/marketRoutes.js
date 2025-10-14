// backend/routes/marketRoutes.js
import express from "express";
import pool from "../models/db.js";

const router = express.Router();

/**
 * GET /api/market/price-range?name=iphone%2013&days=90
 * → Trả về min, max, avg giá sản phẩm theo tên (3 tháng gần nhất)
 */
router.get("/price-range", async (req, res) => {
  try {
    const name = String(req.query.name || "").trim();
    const days = Math.max(1, Math.min(365, parseInt(req.query.days || "90", 10)));
    if (!name) return res.status(400).json({ error: "Thiếu tên sản phẩm" });

    const q = await pool.query(
      `SELECT 
         MIN(price)::numeric(12,2) AS min,
         MAX(price)::numeric(12,2) AS max,
         AVG(price)::numeric(12,2) AS avg
       FROM products
       WHERE LOWER(name) LIKE LOWER($1)
         AND created_at >= NOW() - ($2 || ' days')::interval`,
      [`%${name}%`, String(days)]
    );

    const row = q.rows[0] || {};
    res.json({
      name,
      days,
      min: Number(row.min || 0),
      max: Number(row.max || 0),
      avg: Number(row.avg || 0),
    });
  } catch (e) {
    console.error("❌ market/price-range:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
