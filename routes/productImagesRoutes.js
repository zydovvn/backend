// backend/routes/productImagesRoutes.js
import express from "express";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { diskUploader } from "../utils/uploader.js";

const router = express.Router();
const upload = diskUploader("products");

/**
 * GET /api/products/:id/images
 */
router.get("/:id/images", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, image_url, sort 
         FROM product_images 
        WHERE product_id=$1 
     ORDER BY sort, id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ get images:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/products/:id/images  (multipart/form-data)
 */
router.post("/:id/images", authMiddleware, upload.array("images", 8), async (req, res) => {
  try {
    const pid = Number(req.params.id);
    const files = (req.files || []).map((f) => `products/${f.filename}`);
    if (!files.length) return res.status(400).json({ error: "Không có file" });

    const values = files.map((u, i) => `(${pid}, '${u.replace(/'/g, "''")}', ${i})`).join(",");
    const q = await pool.query(
      `INSERT INTO product_images (product_id, image_url, sort)
       VALUES ${values}
       RETURNING id, image_url, sort`
    );
    res.status(201).json(q.rows);
  } catch (err) {
    console.error("❌ post images:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * DELETE /api/products/:id/images/:imageId
 */
router.delete("/:id/images/:imgId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM product_images WHERE id=$1 AND product_id=$2", [
      req.params.imgId,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ delete image:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
