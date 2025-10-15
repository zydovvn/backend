import express from "express";
import bcrypt from "bcrypt";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

/** PUT /api/users/profile */
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, phone, address, name, school, student_id, age } = req.body;

    const { rows } = await pool.query(
      `UPDATE users
         SET username = COALESCE($1, username),
             phone    = COALESCE($2, phone),
             address  = COALESCE($3, address),
             name     = COALESCE($4, name),
             school   = COALESCE($5, school),
             student_id = COALESCE($6, student_id),
             age      = COALESCE($7, age)
       WHERE id=$8
       RETURNING id, username, email, phone, address, name, school, student_id, age, avatar_url, role`,
      [username ?? name ?? null, phone ?? null, address ?? null, name ?? null, school ?? null, student_id ?? null, age ?? null, userId]
    );

    res.json({ user: rows[0] });
  } catch (err) {
    console.error("users/profile:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/** PUT /api/users/password */
router.put("/password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const oldPassword = req.body.oldPassword ?? req.body.old_password;
    const newPassword = req.body.newPassword ?? req.body.new_password;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Thiếu oldPassword/newPassword" });
    }

    const r = await pool.query("SELECT password FROM users WHERE id=$1", [userId]);
    if (!r.rowCount) return res.status(404).json({ error: "Không tìm thấy user" });

    const ok = await bcrypt.compare(oldPassword, r.rows[0].password);
    if (!ok) return res.status(400).json({ error: "Mật khẩu cũ không đúng" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashed, userId]);

    res.json({ ok: true });
  } catch (err) {
    console.error("users/password:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/** PUT /api/users/avatar  (field: 'avatar') */
router.put("/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Thiếu file avatar" });
    const rel = `uploads/${req.file.filename}`;
    await pool.query("UPDATE users SET avatar_url=$1 WHERE id=$2", [rel, req.user.id]);

    const { rows } = await pool.query(
      "SELECT id, username, email, phone, address, avatar_url, role FROM users WHERE id=$1",
      [req.user.id]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    console.error("users/avatar:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* --- Cập nhật thông tin cá nhân (bao gồm ngân hàng + STK) --- */
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      address,
      school,
      student_id,
      bank_account,
      bank_name,
    } = req.body;

    const result = await pool.query(
      `UPDATE users
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             address = COALESCE($3, address),
             school = COALESCE($4, school),
             student_id = COALESCE($5, student_id),
             bank_account = COALESCE($6, bank_account),
             bank_name = COALESCE($7, bank_name)
       WHERE id = $8
       RETURNING id, username, email, role, name, phone, address, school, student_id, bank_account, bank_name, avatar_url`,
      [name, phone, address, school, student_id, bank_account, bank_name, userId]
    );

    return res.json({
      message: "Cập nhật hồ sơ thành công",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật người dùng:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/me/password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: "Thiếu old_password hoặc new_password" });
    }

    const r = await pool.query("SELECT password FROM users WHERE id=$1", [userId]);
    if (!r.rowCount) return res.status(404).json({ error: "Không tìm thấy user" });

    const ok = await bcrypt.compare(old_password, r.rows[0].password);
    if (!ok) return res.status(400).json({ error: "Mật khẩu cũ không đúng" });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashed, userId]);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Lỗi đổi mật khẩu:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/** Admin: GET /api/users/admin/find?email=... */
router.get("/admin/find", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const email = (req.query.email || "").trim();
    if (!email) return res.status(400).json({ error: "Thiếu email" });

    const { rows } = await pool.query(
      "SELECT id, username, email, role, avatar_url FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Không tìm thấy người dùng" });
    return res.json(rows[0]);
  } catch (e) {
    console.error("admin/find:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

/** Admin: PUT /api/users/role/:id  body { role } */
router.put("/role/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = String(req.body.role || "").toLowerCase();
    if (!["buyer", "seller", "admin", "user"].includes(role))
      return res.status(400).json({ error: "role không hợp lệ" });

    await pool.query("UPDATE users SET role=$1 WHERE id=$2", [role, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("update role:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
