// backend/controllers/userController.js (bổ sung)
import pool from "../models/db.js";

export const searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const { rows } = await pool.query(
      `SELECT id, username, email
       FROM users
       WHERE LOWER(username) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1)
       ORDER BY id DESC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (e) {
    console.error("searchUsers error:", e);
    res.status(500).json({ error: "Không tìm được người dùng" });
  }
};
