import express from "express";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * 🔹 Lấy danh sách đơn hàng của người bán
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { id: sellerId } = req.user;
    const q = await pool.query(
      `
      SELECT 
        o.id, o.status, o.created_at, o.updated_at,
        u.username AS buyer_name, u.phone AS buyer_phone,
        SUM(oi.price * oi.quantity)::numeric(12,2) AS total_amount,
        COUNT(oi.id)::int AS item_count
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN users u ON u.id = o.user_id
      WHERE p.user_id = $1
      GROUP BY o.id, u.username, u.phone
      ORDER BY o.created_at DESC
      `,
      [sellerId]
    );
    res.json(q.rows);
  } catch (err) {
    console.error("GET /seller/orders error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 Lấy chi tiết 1 đơn hàng
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const q = await pool.query(
      `
      SELECT o.id, o.status, o.created_at, u.username AS buyer_name, u.phone AS buyer_phone,
             oi.product_id, p.name AS product_name, oi.price, oi.quantity,
             (oi.price * oi.quantity)::numeric(12,2) AS subtotal
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN users u ON u.id = o.user_id
      WHERE o.id = $1
      `,
      [orderId]
    );
    res.json(q.rows);
  } catch (err) {
    console.error("GET /seller/orders/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 Cập nhật trạng thái đơn hàng
 */
router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    const valid = ["pending", "confirmed", "shipped", "completed", "canceled"];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    }

    await pool.query(
      `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, orderId]
    );

    res.json({ ok: true, status });
  } catch (err) {
    console.error("PATCH /seller/orders/:id/status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================================
   👁️❤️ THÊM VIEW_COUNT & LIKE_COUNT TỰ ĐỘNG CHO DASHBOARD
   ============================================================ */

/**
 * 🔹 Tăng lượt xem (khi người mua mở trang chi tiết sản phẩm)
 * Gọi ở frontend:  POST /api/seller/orders/view/:productId
 */
router.post("/view/:productId", async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ error: "Thiếu productId" });

    await pool.query(
      `
      UPDATE products
      SET view_count = COALESCE(view_count, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
      `,
      [productId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /seller/orders/view/:productId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 Thêm hoặc gỡ lượt thích
 * Gọi ở frontend:  POST /api/seller/orders/like/:productId
 * Body: { liked: true } hoặc { liked: false }
 */
router.post("/like/:productId", authMiddleware, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const userId = req.user.id;
    const { liked } = req.body;

    if (!productId) return res.status(400).json({ error: "Thiếu productId" });

    if (liked) {
      // Thêm lượt thích nếu chưa có
      await pool.query(
        `
        INSERT INTO favorites (user_id, product_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [userId, productId]
      );
    } else {
      // Xóa lượt thích
      await pool.query(
        `
        DELETE FROM favorites
        WHERE user_id = $1 AND product_id = $2
        `,
        [userId, productId]
      );
    }

    // Cập nhật tổng lượt thích
    await pool.query(
      `
      UPDATE products
      SET like_count = (
        SELECT COUNT(*) FROM favorites WHERE product_id = $1
      )
      WHERE id = $1
      `,
      [productId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /seller/orders/like/:productId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 Lấy danh sách đơn hàng chứa 1 sản phẩm cụ thể
 * GET /api/seller/orders/product/:productId
 */
router.get("/product/:productId", authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const { id: sellerId } = req.user;

    const q = await pool.query(
      `
      SELECT 
        o.id, o.status, o.created_at, u.username AS buyer_name, u.phone AS buyer_phone,
        SUM(oi.price * oi.quantity)::numeric(12,2) AS total_amount,
        COUNT(oi.id)::int AS item_count
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN users u ON u.id = o.user_id
      WHERE p.id = $1 AND p.user_id = $2
      GROUP BY o.id, u.username, u.phone
      ORDER BY o.created_at DESC
      `,
      [productId, sellerId]
    );

    res.json(q.rows);
  } catch (err) {
    console.error("GET /seller/orders/product/:productId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


export default router;
