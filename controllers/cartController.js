import db from "../models/db.js";

// Lấy giỏ hàng của user
export const getCart = async (req, res) => {
  try {
    const userId = req.user.id; // lấy từ middleware auth
    const result = await db.query(
      `SELECT c.id, c.quantity, p.name, p.price, p.image
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Lỗi getCart:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

// Thêm sản phẩm vào giỏ
export const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity } = req.body;

    // check nếu đã có thì update
    const existing = await db.query(
      "SELECT * FROM cart WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );

    if (existing.rows.length > 0) {
      const updated = await db.query(
        "UPDATE cart SET quantity = quantity + $1 WHERE id = $2 RETURNING *",
        [quantity, existing.rows[0].id]
      );
      return res.json(updated.rows[0]);
    }

    const result = await db.query(
      "INSERT INTO cart (user_id, product_id, quantity) VALUES ($1,$2,$3) RETURNING *",
      [userId, productId, quantity]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Lỗi addToCart:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

// Cập nhật số lượng
export const updateCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity } = req.body;

    const result = await db.query(
      "UPDATE cart SET quantity = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [quantity, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Lỗi updateCart:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};

// Xóa sản phẩm
export const deleteCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await db.query("DELETE FROM cart WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);

    res.json({ message: "Đã xóa sản phẩm khỏi giỏ" });
  } catch (err) {
    console.error("Lỗi deleteCartItem:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
};
