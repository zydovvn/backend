// backend/routes/categoryRoutes.js
import express from "express";
import pool from "../models/db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, slug FROM categories ORDER BY id ASC"
    );
    res.json(rows);
  } catch (e) {
    console.error("categories:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
