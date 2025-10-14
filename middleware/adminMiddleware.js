// backend/middleware/adminMiddleware.js
import pool from "../models/db.js";

export const adminMiddleware = async (req, res, next) => {
  try {
    // Cần có req.user.id từ authMiddleware
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { rows } = await pool.query(
      "SELECT role FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    const role = rows?.[0]?.role?.toLowerCase?.() || "buyer";
    if (role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  } catch (e) {
    console.error("adminMiddleware error:", e.message);
    return res.status(500).json({ error: "Server error" });
  }
};
