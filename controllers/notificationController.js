// backend/controllers/notificationController.js
import pool from "../models/db.js";

export const getMyNotifications = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, body, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    const unread = rows.filter(n => !n.is_read).length;
    res.json({ items: rows, unread });
  } catch (e) {
    console.error("getMyNotifications error:", e);
    res.status(500).json({ error: "Không lấy được thông báo" });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("markAllRead error:", e);
    res.status(500).json({ error: "Không cập nhật được" });
  }
};

export const clearAll = async (req, res) => {
  try {
    await pool.query(`DELETE FROM notifications WHERE user_id = $1`, [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("clearAll error:", e);
    res.status(500).json({ error: "Không xóa được" });
  }
};

/**
 * Admin gửi thông báo:
 * - body: { title, body, user_id?, user_ids?[] }
 *   - Nếu có user_ids (mảng số): gửi đến danh sách đó
 *   - Nếu có user_id (số): gửi 1 người
 *   - Nếu không truyền cả 2: broadcast (gửi tất cả user active)
 */
export const adminCreateNotification = async (req, res) => {
  try {
    const me = req.user;
    if (!me || (me.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ error: "Chỉ admin được gửi thông báo" });
    }

    const { title, body, user_id, user_ids } = req.body || {};
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Thiếu tiêu đề" });
    }

    const io = req.app.get("io");
    const client = await pool.connect();
    try {
      // 1) Gửi theo danh sách user_ids (ưu tiên nếu có)
      if (Array.isArray(user_ids) && user_ids.length > 0) {
        const uniq = [...new Set(user_ids.map(Number).filter(Boolean))];
        if (uniq.length === 0) {
          return res.json({ ok: true, sent: 0 });
        }
        const values = uniq.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
        const binds = uniq.flatMap(uid => [uid, title, body || ""]);
        await client.query(
          `INSERT INTO notifications (user_id, title, body) VALUES ${values}`,
          binds
        );
        if (io) uniq.forEach(uid => io.emit(`notification:new:${uid}`, { title, body }));
        return res.json({ ok: true, sent: uniq.length });
      }

      // 2) Gửi 1 người
      if (user_id) {
        await client.query(
          `INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)`,
          [Number(user_id), title, body || ""]
        );
        if (io) io.emit(`notification:new:${Number(user_id)}`, { title, body });
        return res.json({ ok: true, sent: 1 });
      }

      // 3) Broadcast
      const { rows: users } = await client.query(`SELECT id FROM users WHERE active = TRUE`);
      if (users.length) {
        const values = users.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
        const binds = users.flatMap(u => [u.id, title, body || ""]);
        await client.query(
          `INSERT INTO notifications (user_id, title, body) VALUES ${values}`,
          binds
        );
        if (io) users.forEach(u => io.emit(`notification:new:${u.id}`, { title, body }));
      }
      return res.json({ ok: true, sent: users.length });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("adminCreateNotification error:", e);
    res.status(500).json({ error: "Không gửi được thông báo" });
  }
};
