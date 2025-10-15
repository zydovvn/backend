import express from "express";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
// ⬇️ THÊM
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = express.Router();

/* ========= List/Get ========= */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, body, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    const unread = rows.filter((r) => !r.is_read).length;
    res.json({ items: rows, unread });
  } catch (e) {
    console.error("notif list error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* ========= Admin send ========= */
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { target, title, body } = req.body; // target: 'all' | array userIds | 'byEmail' | 'byUsername'
    if (!title) return res.status(400).json({ error: "Thiếu title" });

    let ids = [];

    if (target === "all") {
      const { rows } = await pool.query("SELECT id FROM users");
      ids = rows.map((r) => r.id);
    } else if (Array.isArray(target)) {
      // array userIds
      ids = target.map((x) => Number(x)).filter(Boolean);
    } else if (target?.type === "byEmail" && target.value) {
      const { rows } = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [target.value]
      );
      ids = rows.map((r) => r.id);
    } else if (target?.type === "byUsername" && target.value) {
      const { rows } = await pool.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        [target.value]
      );
      ids = rows.map((r) => r.id);
    }

    if (ids.length === 0) return res.json({ inserted: 0 });

    // insert & emit socket
    const values = [];
    const params = [];
    let p = 1;
    ids.forEach((uid) => {
      params.push(uid, title, body || "");
      values.push(`($${p++}, $${p++}, $${p++})`);
    });

    await pool.query(
      `INSERT INTO notifications (user_id, title, body) VALUES ${values.join(",")}`,
      params
    );

    // socket.io
    const io = req.app.get("io");
    ids.forEach((uid) => {
      io?.emit(`notification:new:${uid}`, { title, body: body || "" });
    });

    res.json({ ok: true, inserted: ids.length });
  } catch (e) {
    console.error("notif post error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* ========= Mark all read ========= */
router.patch("/read-all", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = $1",
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("notif read-all error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* ========= Clear all ========= */
router.delete("/", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM notifications WHERE user_id = $1", [
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error("notif clear error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
