import pool from "../models/db.js";

const getImageUrl = (filename) => {
  if (!filename) return null;
  return `${process.env.BASE_URL || "http://localhost:5000"}/uploads/${filename}`;
};

// 🟠 Tạo sản phẩm mới
export const createProduct = async (req, res) => {
  try {
    const { name, price, description, category } = req.body;
    const image_url = req.file ? req.file.filename : null;
    const userId = req.user.id;

    const newProduct = await pool.query(
      `INSERT INTO products (name, price, description, image_url, category_id, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, price, description, image_url, category, userId]
    );

    const row = newProduct.rows[0];
    res.json({
      ...row,
      image_url: getImageUrl(row.image_url),
    });
  } catch (err) {
    console.error("❌ Error creating product:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟠 Lấy danh sách sản phẩm
export const getProducts = async (req, res) => {
  try {
    const { category } = req.query;
    const params = [];
    let query = `
      SELECT p.*, u.username AS seller_name, u.phone AS seller_phone
      FROM products p
      JOIN users u ON p.user_id = u.id
    `;

    if (category) {
      query += " WHERE p.category_id = $1";
      params.push(category);
    }

    query += " ORDER BY p.created_at DESC";
    const result = await pool.query(query, params);
    const products = result.rows;

    let favoriteIds = new Set();

    if (req.user && req.user.id) {
      const favRes = await pool.query(
        "SELECT product_id FROM favorites WHERE user_id = $1",
        [req.user.id]
      );
      favoriteIds = new Set(favRes.rows.map((f) => f.product_id));
    }

    const productsWithFav = products.map((p) => ({
      ...p,
      image_url: getImageUrl(p.image_url),
      isFavorite: favoriteIds.has(p.id),
    }));

    res.json(productsWithFav);
  } catch (err) {
    console.error("❌ Lỗi khi lấy sản phẩm:", err.message);
    res.status(500).json({ error: "Lỗi server khi lấy sản phẩm" });
  }
};

// 🟠 Lấy danh sách sản phẩm do user đã đăng
export const getMyPosts = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT p.*, 
              CASE WHEN f.product_id IS NOT NULL THEN true ELSE false END AS "isFavorite"
       FROM products p
       LEFT JOIN favorites f 
         ON p.id = f.product_id AND f.user_id = $1
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const products = result.rows.map((p) => ({
      ...p,
      image_url: getImageUrl(p.image_url),
    }));

    res.json(products);
  } catch (err) {
    console.error("❌ Lỗi khi lấy myposts:", err);
    res.status(500).json({ error: "Không thể lấy tin đã đăng" });
  }
};

// 🟠 Cập nhật sản phẩm (sử dụng nếu muốn route gọi controller)
export const updateProduct = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.id;
    const { name, price, description, category_id } = req.body;
    const newImage = req.file ? req.file.filename : null;

    const check = await pool.query(
      "SELECT id, user_id FROM products WHERE id = $1",
      [productId]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }
    if (check.rows[0].user_id !== userId) {
      return res.status(403).json({ message: "Bạn không có quyền sửa sản phẩm này" });
    }

    const { rows } = await pool.query(
      `UPDATE products
       SET name = COALESCE($1, name),
           price = COALESCE($2, price),
           description = COALESCE($3, description),
           image_url = COALESCE($4, image_url),
           category_id = COALESCE($5, category_id)
       WHERE id = $6
       RETURNING *`,
      [name ?? null, price ?? null, description ?? null, newImage ?? null, category_id ?? null, productId]
    );

    const row = rows[0];
    res.json({ ...row, image_url: getImageUrl(row.image_url) });
  } catch (err) {
    console.error("❌ updateProduct error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
