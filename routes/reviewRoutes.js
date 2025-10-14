// backend/routes/reviewRoutes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "..", "uploads", "reviews");

// ✅ Đảm bảo tồn tại thư mục uploads/reviews
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.mimetype);
  if (!ok) return cb(new Error("File không hợp lệ"));
  cb(null, true);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/* GET: /api/products/:productId/reviews */
router.get("/:productId/reviews", async (req, res) => {
  try {
    const { productId } = req.params;
    const { rows } = await pool.query(
      `SELECT r.id, r.product_id, r.user_id, r.rating, r.content, r.images, r.created_at,
              u.username
       FROM product_reviews r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [productId]
    );

    // images hiện là jsonb ⇒ luôn trả về mảng
    const normalized = rows.map((r) => ({
      ...r,
      images: Array.isArray(r.images)
        ? r.images
        : (typeof r.images === "string"
            ? (() => { try { return JSON.parse(r.images); } catch { return []; } })()
            : [])
    }));

    res.json(normalized);
  } catch (err) {
    console.error("❌ Lỗi khi lấy review:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

/* POST: /api/products/:productId/reviews  (multipart) */
router.post("/:productId/reviews", authMiddleware, upload.array("images", 5), async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, content } = req.body;
    if (!productId || !rating || !content) {
      return res.status(400).json({ message: "Thiếu dữ liệu" });
    }

    const imageUrls = (req.files || []).map((f) => `/uploads/reviews/${path.basename(f.path)}`);

    // ✅ Cách A: insert JSONB (images::jsonb) + JSON.stringify(imageUrls)
    await pool.query(
      `INSERT INTO product_reviews (product_id, user_id, rating, content, images)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [productId, req.user.id, Number(rating), content, JSON.stringify(imageUrls)]
    );

    res.json({ message: "Đã tạo review thành công!" });
  } catch (err) {
    console.error("❌ Lỗi khi tạo review:", err);
    res.status(500).json({ message: "Không thể tạo review." });
  }
});

/* Optional backward-compat: vẫn chấp nhận POST /api/reviews */
router.post("/", authMiddleware, upload.array("images", 5), async (req, res) => {
  try {
    const { product_id, rating, content } = req.body;
    if (!product_id || !rating || !content) {
      return res.status(400).json({ message: "Thiếu dữ liệu" });
    }
    const imageUrls = (req.files || []).map((f) => `/uploads/reviews/${path.basename(f.path)}`);

    // ✅ JSONB như trên
    await pool.query(
      `INSERT INTO product_reviews (product_id, user_id, rating, content, images)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [product_id, req.user.id, Number(rating), content, JSON.stringify(imageUrls)]
    );
    res.json({ message: "OK" });
  } catch (err) {
    console.error("❌ Lỗi khi tạo review (legacy):", err);
    res.status(500).json({ message: "Không thể tạo review." });
  }
});

export default router;
