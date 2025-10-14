// backend/routes/profileRoutes.js
import express from "express";
import bcrypt from "bcrypt";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/** ============================================================
    PUBLIC PROFILE (cho ProductDetail hiển thị seller)
============================================================ */
router.get("/:userId/public", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0)
      return res.status(400).json({ error: "userId không hợp lệ" });

    const r = await pool.query(
      `SELECT 
         id AS user_id,
         COALESCE(full_name, username) AS name,
         phone,
         address,
         avatar_url,
         NULL::text AS student_code,
         NULL::text AS university,
         NULL::text AS bank_account,
         NULL::text AS bank_name,
         created_at AS member_since
       FROM users
      WHERE id = $1`,
      [userId]
    );

    if (r.rowCount === 0)
      return res.status(404).json({ error: "Không tìm thấy user" });

    const u = r.rows[0];
    res.json({
      profile: {
        user_id: u.user_id,
        name: u.name,
        phone: u.phone ?? null,
        student_code: u.student_code ?? null,
        university: u.university ?? null,
        bank_account: u.bank_account ?? null,
        bank_name: u.bank_name ?? null,
        address: u.address ?? null,
        avatar_url: u.avatar_url ?? null,
        member_since: u.member_since,
      },
    });
  } catch (err) {
    console.error("❌ Lỗi lấy public profile:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** ============================================================
    PRIVATE PROFILE /me
============================================================ */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, username, email, phone, address, avatar_url
         FROM users
        WHERE id = $1`,
      [req.user.id]
    );
    if (r.rowCount === 0)
      return res.status(404).json({ error: "Không tìm thấy user" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("❌ Lỗi lấy profile:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/** ============================================================
    ĐỔI MẬT KHẨU
============================================================ */
router.put("/me/password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password)
      return res.status(400).json({ error: "Thiếu old_password hoặc new_password" });

    const r = await pool.query("SELECT password FROM users WHERE id=$1", [userId]);
    if (r.rowCount === 0)
      return res.status(404).json({ error: "Không tìm thấy user" });

    const ok = await bcrypt.compare(old_password, r.rows[0].password);
    if (!ok) return res.status(400).json({ error: "Mật khẩu cũ không đúng" });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2", [hashed, userId]);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Lỗi đổi mật khẩu (profile):", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
