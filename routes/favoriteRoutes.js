import express from "express";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Áp dụng middleware xác thực cho tất cả routes
router.use(authMiddleware);

// ✅ Lấy danh sách sản phẩm yêu thích của user
router.get("/", async (req, res) => {
  try {
    const { id: user_id } = req.user;

    const result = await pool.query(
      `SELECT 
         p.id, 
         p.name, 
         p.price, 
         p.image_url, 
         TRUE AS "isFavorite"
       FROM favorites f
       JOIN products p ON f.product_id = p.id
       WHERE f.user_id = $1`,
      [user_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi lấy favorites:", err);
    res.status(500).json({ error: "Không thể lấy danh sách yêu thích" });
  }
});

// ✅ Thêm sản phẩm vào yêu thích
router.post("/", async (req, res) => {
  try {
    const { id: user_id } = req.user; // 🛡 Lấy từ token
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Thiếu product_id" });
    }

    await pool.query(
      `INSERT INTO favorites (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [user_id, product_id]
    );

    res.json({ message: "Đã thêm vào yêu thích" });
  } catch (err) {
    console.error("❌ Lỗi thêm favorite:", err);
    res.status(500).json({ error: "Không thể thêm vào yêu thích" });
  }
});

// ✅ Xóa sản phẩm khỏi yêu thích
router.delete("/", async (req, res) => {
  try {
    const { id: user_id } = req.user; // 🛡 Lấy từ token
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Thiếu product_id" });
    }

    await pool.query(
      "DELETE FROM favorites WHERE user_id = $1 AND product_id = $2",
      [user_id, product_id]
    );

    res.json({ message: "Đã xóa khỏi yêu thích" });
  } catch (err) {
    console.error("❌ Lỗi xóa favorite:", err);
    res.status(500).json({ error: "Không thể xóa khỏi yêu thích" });
  }
});

export default router;
