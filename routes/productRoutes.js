import express from "express";
import path from "path";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { diskUploader } from "../utils/uploader.js";
import {
  validateProductCreate,
  validateProductUpdate,
} from "../middleware/validators.js";
import { redeemAfterCreatePost } from "../services/feeService.js";

const router = express.Router();

// /* =============== CATEGORIES tiện ích =============== */
// router.get("/categories/all", async (req, res) => {
//   try {
//     const { rows } = await pool.query(
//       "SELECT id, name, slug FROM categories ORDER BY id ASC"
//     );
//     res.json(rows);
//   } catch (err) {
//     console.error("GET /categories/all error:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

/* ================= Upload ================= */
const upload = diskUploader("products");

/* ================= Helpers ================= */
const ABS = process.env.BASE_URL || "http://localhost:5000";
const img = (filename) => {
  if (!filename) return null;
  let raw = String(filename).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(raw)) return raw;
  raw = raw.replace(/^\/?uploads\//i, "");
  if (!/^[^/]+\/[^/]+/.test(raw)) raw = `products/${raw}`;
  return `${ABS}/uploads/${raw}`;
};
const toProduct = (row) => ({ ...row, image_url: img(row.image_url) });

/* =============== CREATE (transaction + redeem) =============== */
router.post(
  "/",
  authMiddleware,
  upload.single("image"),
  validateProductCreate,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { name, price, description, category_id, voucher_code } = req.body;
      const imageFilename = req.file ? `products/${req.file.filename}` : null;

      if (!name || !price || !description || !category_id) {
        return res.status(400).json({ error: "Thiếu thông tin sản phẩm" });
      }

      await client.query("BEGIN");

      const ins = await client.query(
        `INSERT INTO products (name, price, description, image_url, user_id, category_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, price, description, imageFilename, req.user.id, category_id]
      );
      const post = ins.rows[0];

      const { fee } = await redeemAfterCreatePost({
        client,
        sellerId: req.user.id,
        categoryId: category_id,
        voucherCode: (voucher_code || "").trim() || null,
        postId: post.id,
      });

      await client.query("COMMIT");
      return res.status(201).json({ ...toProduct(post), fee });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("create product with fee:", e);
      return res.status(500).json({ error: "Server error" });
    } finally {
      client.release();
    }
  }
);



/* =============== COUNTER Myposts =============== */
router.get("/myposts/count", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count FROM products WHERE user_id=$1`,
      [req.user.id]
    );
    return res.json({ count: r.rows[0].count || 0 });
  } catch (e) {
    console.error("myposts count:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ======================= ✨ SELLER DASHBOARD ✨ ======================= */

/** 🧮 Thống kê tin đăng theo trạng thái */
router.get("/mine/stats", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT 
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE COALESCE(is_available, TRUE) = TRUE) AS active_count,
        COUNT(*) FILTER (WHERE COALESCE(is_available, FALSE) = FALSE) AS hidden_count,
        COUNT(*) FILTER (WHERE COALESCE(expires_at, NOW()) < NOW()) AS expired_count
      FROM products
      WHERE user_id = $1
      `,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error("mine stats error:", e);
    res.status(500).json({ error: "Server error: " + e.message });
  }
});


/** 🔁 Làm mới tin đăng (đẩy lên đầu) */
router.patch("/:id/refresh", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE products 
         SET updated_at = NOW()
       WHERE id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    res.json({ success: true, message: "Đã làm mới tin đăng" });
  } catch (e) {
    console.error("refresh:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/** ⏳ Gia hạn tin đăng thêm 7 ngày */
router.patch("/:id/extend", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE products
         SET expires_at = COALESCE(expires_at, NOW()) + interval '7 days'
       WHERE id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    res.json({ success: true, message: "Đã gia hạn tin thêm 7 ngày" });
  } catch (e) {
    console.error("extend:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/** 🗑️ Xóa tin đăng (dành cho người bán) */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM products WHERE id=$1 AND user_id=$2`, [
      id,
      req.user.id,
    ]);
    res.json({ success: true, message: "Đã xóa tin đăng" });
  } catch (e) {
    console.error("delete product:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* =================== END SELLER DASHBOARD =================== */

/* =============== MY PRODUCTS (for MyPosts page) =============== */
router.get("/mine", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
       SELECT
        p.id,
        p.name,
        p.price,
        CASE 
          WHEN expires_at < NOW() THEN 'expired'
          WHEN COALESCE(p.is_available, TRUE) THEN 'active'
          ELSE 'hidden'
        END AS status,
        p.updated_at,
        p.created_at,
        p.image_url
      FROM products p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      `,
      [req.user.id]
    );
    res.json(rows.map(toProduct));
  } catch (err) {
    console.error("GET /api/products/mine error:", err);
    res.status(500).json({ error: "Failed to fetch my products" });
  }
});

/* =============== FAVORITES =============== */
router.get("/favorites", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.name, p.price, p.description, p.image_url, p.created_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
              u.username AS seller_name, u.phone AS seller_phone
         FROM favorites f
         JOIN products p ON p.id = f.product_id
         JOIN categories c ON c.id = p.category_id
         JOIN users u ON u.id = p.user_id
        WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    return res.json(r.rows.map(toProduct));
  } catch (e) {
    console.error("favorites:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/favorites/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO favorites (user_id, product_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error("fav add:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/favorites/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM favorites WHERE user_id=$1 AND product_id=$2`,
      [req.user.id, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error("fav del:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =============== SEARCH (autocomplete) =============== */
router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").toLowerCase();
    const r = await pool.query(
      `SELECT id, name, price, image_url
         FROM products
        WHERE LOWER(name) LIKE $1
        LIMIT 10`,
      [`%${q}%`]
    );
    return res.json(r.rows.map(toProduct));
  } catch (e) {
    console.error("search:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =============== FEATURED =============== */
router.get("/featured", async (req, res) => {
  try {
    const lim = Math.min(20, Math.max(1, parseInt(req.query.limit || "10", 10)));
    const { rows } = await pool.query(
      `SELECT id, name, price, image_url
         FROM products
        WHERE COALESCE(is_available, TRUE) = TRUE
        ORDER BY RANDOM()
        LIMIT $1`,
      [lim]
    );
    return res.json(rows.map(toProduct));
  } catch (e) {
    console.error("featured:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =============== REVIEWS =============== */
// const reviewUpload = diskUploader("reviews");

// router.get("/:id/reviews", async (req, res) => {
//   try {
//     const r = await pool.query(
//       `SELECT pr.id, pr.rating, pr.content, pr.images, pr.created_at,
//               u.username, u.avatar_url
//          FROM product_reviews pr
//     LEFT JOIN users u ON u.id = pr.user_id
//         WHERE pr.product_id = $1
//      ORDER BY pr.created_at DESC
//         LIMIT 100`,
//       [req.params.id]
//     );
//     res.json(r.rows);
//   } catch (e) {
//     console.error("reviews list:", e);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// router.post(
//   "/:id/reviews",
//   authMiddleware,
//   reviewUpload.array("images", 6),
//   async (req, res) => {
//     try {
//       const productId = Number(req.params.id);
//       const { rating, content } = req.body;
//       const files = (req.files || []).map((f) => `reviews/${f.filename}`);
//       await pool.query(
//         `INSERT INTO product_reviews (product_id, user_id, rating, content, images)
//          VALUES ($1,$2,$3,$4,$5)`,
//         [productId, req.user.id, rating, content, JSON.stringify(files)]
//       );

//       const agg = await pool.query(
//         `SELECT AVG(rating)::numeric(10,2) AS avg, COUNT(*)::int AS count
//            FROM product_reviews
//           WHERE product_id = $1`,
//         [productId]
//       );
//       const rating_avg = Number(agg.rows[0].avg || 0);
//       const rating_count = Number(agg.rows[0].count || 0);

//       await pool.query(
//         `UPDATE products
//             SET rating_avg=$1, rating_count=$2, updated_at=NOW()
//           WHERE id=$3`,
//         [rating_avg, rating_count, productId]
//       );

//       res.status(201).json({ ok: true });
//     } catch (e) {
//       console.error("create review:", e);
//       res.status(500).json({ error: "Server error" });
//     }
//   }
// );

/* =============== LIST (pagination) =============== */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const offset = (page - 1) * limit;
    const { category = "", q = "" } = req.query;

    const conds = [];
    const params = [];
    let p = 1;

    if (category) {
      conds.push(`category_id = $${p++}`);
      params.push(Number(category));
    }
    if (q) {
      conds.push(`(LOWER(name) LIKE $${p} OR LOWER(description) LIKE $${p})`);
      params.push(`%${String(q).toLowerCase()}%`);
      p++;
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const listSql = `
      SELECT p.*, u.username AS seller_name, u.phone AS seller_phone
        FROM products p
   LEFT JOIN users u ON u.id = p.user_id
       ${where}
    ORDER BY p.updated_at DESC
       LIMIT $${p++} OFFSET $${p++}`;
    const countSql = `SELECT COUNT(*)::int AS total FROM products ${where}`;

    const [listRes, countRes] = await Promise.all([
      pool.query(listSql, [...params, limit, offset]),
      pool.query(countSql, params),
    ]);

    res.json({
      items: listRes.rows.map(toProduct),
      total: countRes.rows[0].total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(countRes.rows[0].total / limit)),
    });
  } catch (e) {
    console.error("list products:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* =============== MY PRODUCTS (for MyPosts page) =============== */
/**
 * ⚠️ Đặt TRƯỚC route "/:id" để tránh bắt nhầm "mine" thành id.
 */
router.get("/mine", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
       SELECT
        p.id,
        p.name,
        p.price,
        CASE WHEN COALESCE(p.is_available, TRUE) THEN 'active' ELSE 'hidden' END AS status,
        p.created_at,
        p.image_url AS image_url             -- ✅ chỉ dùng image_url
      FROM products p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      `,
      [req.user.id]
    );
    res.json(rows.map(toProduct));
  } catch (err) {
    console.error("GET /api/products/mine error:", err);
    res.status(500).json({ error: "Failed to fetch my products" });
  }
});

/* =============== DETAIL =============== */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
              u.id AS seller_id, u.username AS seller_name, u.phone AS seller_phone
         FROM products p
         JOIN categories c ON p.category_id = c.id
         JOIN users u ON p.user_id = u.id
        WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    res.json(toProduct(rows[0]));
  } catch (err) {
    console.error("detail product:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =============== UPDATE / DELETE =============== */
router.put(
  "/:id",
  validateProductUpdate,
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.id;

      const check = await pool.query(
        `SELECT id, user_id, image_url FROM products WHERE id=$1`,
        [productId]
      );
      if (!check.rowCount)
        return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
      if (Number(check.rows[0].user_id) !== Number(userId)) {
        return res.status(403).json({ error: "Không có quyền sửa sản phẩm này" });
      }

      const {
        name,
        price,
        description,
        category_id,
        quantity,
        is_available,
        attributes,
      } = req.body;
      const newImageFilename = req.file ? `products/${req.file.filename}` : null;

      const { rows } = await pool.query(
        `UPDATE products
            SET name         = COALESCE($1, name),
                price        = COALESCE($2, price),
                description  = COALESCE($3, description),
                image_url    = COALESCE($4, image_url),
                category_id  = COALESCE($5, category_id),
                quantity     = COALESCE($6, quantity),
                is_available = COALESCE($7, is_available),
                attributes   = COALESCE($8::jsonb, attributes),
                updated_at   = NOW()
          WHERE id = $9 AND user_id = $10
        RETURNING *`,
        [
          name ?? null,
          price ?? null,
          description ?? null,
          newImageFilename ?? null,
          category_id ?? null,
          quantity ?? null,
          typeof is_available === "boolean" ? is_available : null,
          attributes ? JSON.stringify(attributes) : null,
          productId,
          userId,
        ]
      );
      res.json(toProduct(rows[0]));
    } catch (e) {
      console.error("update product:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.delete("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const productId = Number(req.params.id);
    const isAdmin = (req.user?.role || "").toLowerCase() === "admin";
    const userId = req.user?.id;

    await client.query("BEGIN");

    const pre = await client.query(
      `SELECT id, user_id, image_url FROM products WHERE id = $1`,
      [productId]
    );
    if (pre.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    }
    const ownerId = pre.rows[0].user_id;

    if (!isAdmin && Number(ownerId) !== Number(userId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Bạn không có quyền xóa sản phẩm này" });
    }

    await client.query(`DELETE FROM product_reviews WHERE product_id = $1`, [productId]);
    await client.query(`DELETE FROM order_items WHERE product_id = $1`, [productId]);
    await client.query(`DELETE FROM favorites WHERE product_id = $1`, [productId]);

    const del = await client.query(
      `DELETE FROM products WHERE id = $1 RETURNING image_url`,
      [productId]
    );

    await client.query("COMMIT");

    const filename = del.rows[0]?.image_url;
    if (filename) {
      const filePath = path.join(process.cwd(), "uploads", filename);
      import("fs").then(({ unlink }) => unlink(filePath, () => {}));
    }

    res.json({ ok: true, message: isAdmin ? "Đã xóa (admin)" : "Đã xóa" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("delete product:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  } finally {
    client.release();
  }
});

/* =============== RENEW (gia hạn tin) =============== */
router.post("/:id/renew", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE products
         SET expires_at = NOW() + INTERVAL '30 days'
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ renewed: true });
  } catch (err) {
    console.error("POST /api/products/:id/renew error:", err);
    res.status(500).json({ error: "Failed to renew product" });
  }
});

// THÊM MỚI trong productRoutes.js
router.get("/:id/price-range", async (req, res) => {
  try {
    const months = Math.max(1, Math.min(12, parseInt(req.query.months || "3", 10)));
    // Tìm category của sản phẩm
    const one = await pool.query(`SELECT category_id FROM products WHERE id=$1`, [req.params.id]);
    if (!one.rowCount) return res.status(404).json({ error: "Not found" });
    const catId = one.rows[0].category_id;

    // Lấy giá từ các đơn hàng đã thanh toán thuộc category này trong N tháng
    const q = await pool.query(
      `
      SELECT oi.price
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE p.category_id = $1
        AND o.status IN ('paid','completed')
        AND o.created_at >= NOW() - ($2 || ' months')::interval
      `,
      [catId, months]
    );

    const prices = q.rows.map(r => Number(r.price || 0)).filter(x => x > 0).sort((a,b)=>a-b);
    if (prices.length === 0) return res.json({ min: 0, max: 0, median: 0, count: 0 });

    const min = prices[0];
    const max = prices[prices.length - 1];
    const median = prices[Math.floor(prices.length / 2)];
    res.json({ min, max, median, count: prices.length });
  } catch (e) {
    console.error("price-range:", e);
    res.status(500).json({ error: "Server error" });
  }
});




export default router;
