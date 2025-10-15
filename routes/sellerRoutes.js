// backend/routes/sellerRoutes.js
import { Router } from "express";
import pool from "../models/db.js";

const router = Router();

/**
 * GET /api/sellers/:id/metrics
 * Trả về:
 *  - Profile: username, avatar_url, phone, address, school, student_id, bank_account, bank_name
 *  - Metrics: response_rate, response_time_sec
 *  - Review: avg_rating, reviews_count
 */
router.get("/:id/metrics", async (req, res) => {
  try {
    const { id } = req.params;

    // Lấy profile cơ bản
    const u = await pool.query(
      `SELECT id, username, avatar_url, phone, address, school, student_id, bank_account, bank_name
       FROM users
       WHERE id = $1`,
      [id]
    );
    if (u.rowCount === 0) return res.status(404).json({ message: "Seller not found" });
    const user = u.rows[0];

    // (Tùy bạn đã có bảng/log tính sẵn)
    // Ở đây demo: tính rating theo reviews của các product mà seller đăng
    const r = await pool.query(
      `SELECT
          COALESCE(AVG(pr.rating), 0)       AS avg_rating,
          COALESCE(COUNT(pr.*), 0)          AS reviews_count
       FROM products p
       LEFT JOIN product_reviews pr ON pr.product_id = p.id
       WHERE p.user_id = $1`,
      [id]
    );
    const review = r.rows[0];

    // Demo metrics (nếu bạn đã có bảng metrics riêng thì SELECT tại đó)
    // Ở đây trả về default hoặc join bảng của bạn
    const metrics = {
      response_rate: 95,          // %
      response_time_sec: 20 * 60, // 20 phút
    };

    res.json({
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url,
      phone: user.phone,
      address: user.address,
      school: user.school,
      student_id: user.student_id,
      bank_account: user.bank_account,
      bank_name: user.bank_name,
      ...metrics,
      avg_rating: Number(review.avg_rating || 0),
      reviews_count: Number(review.reviews_count || 0),
    });
  } catch (e) {
    console.error("GET /api/sellers/:id/metrics error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
