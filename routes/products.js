const { validateProductCreate } = require('../middleware/validators');
import express from "express";
import multer from "multer";
import pool from "../db.js"; // file kết nối PostgreSQL
import path from "path";

const router = express.Router();

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // tên file duy nhất
  },
});
const upload = multer({ storage });

// Lấy tất cả sản phẩm
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi lấy sản phẩm:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Đăng sản phẩm mới
router.post("/", validateProductCreate, async (req, res) => {
  try {
    const { name, description, price, user_id } = req.body;
    const image_url = req.file ? req.file.filename : null;

    if (!name || !price || !image_url) {
      return res.status(400).json({ error: "Thiếu dữ liệu sản phẩm" });
    }

    const result = await pool.query(
      "INSERT INTO products (name, description, price, image_url, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, description, price, image_url, user_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Lỗi đăng sản phẩm:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
