import pool from "../models/db.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Tạo đơn hàng (buyer) — FIX: thêm ghi order_items + transaction
export const createOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const buyerId = req.user.id;
    const { product_id, quantity } = req.body;

    if (!product_id || !quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: "product_id và quantity không hợp lệ" });
    }

    // Lấy thông tin sản phẩm (giá tại thời điểm đặt)
    const prodRes = await client.query(
      "SELECT id, price, user_id AS seller_id FROM products WHERE id = $1",
      [product_id]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    const product = prodRes.rows[0];
    const itemPrice = Number(product.price);
    const qty = Number(quantity);
    const total_price = itemPrice * qty;

    await client.query("BEGIN");

    // 1) Tạo orders
    const oRes = await client.query(
      `INSERT INTO orders (buyer_id, product_id, quantity, status, total_price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [buyerId, product_id, qty, "pending", total_price]
    );
    const order = oRes.rows[0];

    // 2) Ghi order_items (đơn hiện tại là 1 sản phẩm; sau này có thể mở rộng nhiều sản phẩm)
    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, price)
       VALUES ($1, $2, $3, $4)`,
      [order.id, product_id, qty, itemPrice]
    );

    await client.query("COMMIT");

    // Trả về chi tiết đơn tóm tắt
    res.status(201).json(order);
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("❌ createOrder error:", err.message);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};

// =====================================
// 🧠 Cập nhật getBuyerOrders
// =====================================
export const getBuyerOrders = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const result = await pool.query(
      `SELECT 
          o.id AS order_id,
          o.status,
          o.created_at,
          o.total_price,
          p.id AS product_id,
          p.name AS product_name,
          p.price AS product_price,
          p.description,
          p.image_url,
          u.username AS seller_name,
          u.phone AS seller_phone
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [buyerId]
    );

    const orders = result.rows.map((r) => ({
      order_id: r.order_id,
      status: r.status,
      created_at: r.created_at,
      total_price: r.total_price,
      product: {
        id: r.product_id,
        name: r.product_name,
        description: r.description,
        price: r.product_price,
        image_url: r.image_url
          ? `${BASE_URL}/uploads/${r.image_url}`
          : null,
      },
      seller: {
        name: r.seller_name,
        phone: r.seller_phone,
      },
    }));

    res.json(orders);
  } catch (err) {
    console.error("getBuyerOrders error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// =====================================
// 🧠 Cập nhật getSellerOrders
// =====================================
export const getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const result = await pool.query(
      `SELECT 
          o.id AS order_id,
          o.status,
          o.created_at,
          o.total_price,
          o.quantity,
          u_b.username AS buyer_name,
          u_b.phone AS buyer_phone,
          p.id AS product_id,
          p.name AS product_name,
          p.image_url,
          p.price AS product_price
       FROM orders o
       JOIN users u_b ON o.buyer_id = u_b.id
       JOIN products p ON o.product_id = p.id
       WHERE p.user_id = $1
       ORDER BY o.created_at DESC`,
      [sellerId]
    );

    const orders = result.rows.map((r) => ({
      order_id: r.order_id,
      status: r.status,
      created_at: r.created_at,
      total_price: r.total_price,
      quantity: r.quantity,
      buyer: {
        name: r.buyer_name,
        phone: r.buyer_phone,
      },
      product: {
        id: r.product_id,
        name: r.product_name,
        price: r.product_price,
        image_url: r.image_url
          ? `${BASE_URL}/uploads/${r.image_url}`
          : null,
      },
    }));

    res.json(orders);
  } catch (err) {
    console.error("getSellerOrders error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


// Xem chi tiết đơn hàng
export const getOrderById = async (req, res) => {
  try {
    const orderId = req.params.id;
    const oRes = await pool.query(
      `SELECT o.id, o.status, o.created_at, o.updated_at,
              u_b.username AS buyer_name, u_b.phone AS buyer_phone
       FROM orders o
       JOIN users u_b ON o.buyer_id = u_b.id
       WHERE o.id = $1`,
      [orderId]
    );
    if (oRes.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const oInfo = oRes.rows[0];
    const itemsRes = await pool.query(
      `SELECT oi.product_id, oi.quantity, oi.price AS item_price,
              p.name AS product_name, p.description, p.image_url AS image_filename,
              p.user_id AS seller_id
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );
    const items = itemsRes.rows.map((it) => ({
      product_id: it.product_id,
      quantity: it.quantity,
      price: it.item_price,
      product_name: it.product_name,
      description: it.description,
      image_url: it.image_filename ? `${BASE_URL}/uploads/${it.image_filename}` : null,
    }));

    const total_price = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

    res.json({
      id: oInfo.id,
      status: oInfo.status,
      created_at: oInfo.created_at,
      updated_at: oInfo.updated_at,
      buyer_name: oInfo.buyer_name,
      buyer_phone: oInfo.buyer_phone,
      items,
      total_price,
    });
  } catch (err) {
    console.error("getOrderById error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Cập nhật trạng thái đơn hàng (seller / admin)
// controllers/orderController.js
export const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status`,
      [status, orderId]
    );

    // nếu completed ⇒ cộng số lượng vào sold_count sản phẩm tương ứng
    if (result.rows.length && status === "completed") {
      const items = await pool.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [orderId]
      );

      for (const it of items.rows) {
        await pool.query(
          `UPDATE products
           SET sold_count = COALESCE(sold_count,0) + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [Number(it.quantity || 0), it.product_id]
        );

        // emit realtime tới phòng product
        const io = req.app.get("io");
        io?.to(`product:${it.product_id}`).emit("order:completed", {
          product_id: Number(it.product_id),
          delta: Number(it.quantity || 1),
        });
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ updateOrderStatus error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};


// Thống kê seller
export const getOrderStats = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // ✅ Doanh thu chỉ tính đơn đã HOÀN TẤT (completed)
    // Sử dụng bảng orders (đã có total_price) + join products để lọc theo seller
    const revRes = await pool.query(
      `SELECT COALESCE(SUM(o.total_price), 0) AS total_revenue
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE p.user_id = $1
         AND o.status = 'completed'`,
      [sellerId]
    );
    const total_revenue = Number(revRes.rows[0].total_revenue) || 0;

    // ✅ Đếm số đơn theo trạng thái (giữ nguyên logic hiện tại)
    const countRes = await pool.query(
      `SELECT o.status, COUNT(o.id) AS count
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE p.user_id = $1
       GROUP BY o.status`,
      [sellerId]
    );

    const status_counts = countRes.rows.map((r) => ({
      status: r.status,
      count: parseInt(r.count, 10),
    }));

    res.json({ total_revenue, status_counts });
  } catch (err) {
    console.error("getOrderStats error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
