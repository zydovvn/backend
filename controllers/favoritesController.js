// controllers/favoritesController.js
import pool from "../models/db.js";

// ✅ Lấy danh sách sản phẩm yêu thích của user
export const getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT p.*, f.id AS favorite_id
       FROM favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi khi lấy favorites:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ Thêm sản phẩm vào danh sách yêu thích
export const addFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Thiếu product_id" });
    }

    // check đã tồn tại chưa
    const existing = await pool.query(
      "SELECT * FROM favorites WHERE user_id = $1 AND product_id = $2",
      [userId, product_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Đã yêu thích sản phẩm này" });
    }

    const result = await pool.query(
      "INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) RETURNING *",
      [userId, product_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Lỗi khi thêm favorite:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ Xóa sản phẩm khỏi danh sách yêu thích
export const removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Thiếu product_id" });
    }

    await pool.query(
      "DELETE FROM favorites WHERE user_id = $1 AND product_id = $2",
      [userId, product_id]
    );

    res.json({ message: "Đã bỏ yêu thích" });
  } catch (err) {
    console.error("❌ Lỗi khi xóa favorite:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};
