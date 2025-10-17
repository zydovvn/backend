// backend/routes/categoryRoutes.js
import express from "express";
import pool from "../models/db.js";

const router = express.Router();

/* ================= GET ALL CATEGORIES ================= */
router.get("/all", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, slug FROM categories ORDER BY id ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/categories/all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= GET CATEGORY BY ID ================= */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, slug FROM categories WHERE id = $1",
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Không tìm thấy danh mục" });
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /api/categories/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
