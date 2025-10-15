import pool from "../models/db.js";

export async function getPublicProfile(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: "Thiếu userId hợp lệ." });

    const { rows: profRows } = await pool.query(
      `SELECT * FROM v_public_seller_profile WHERE user_id = $1`,
      [userId]
    );
    const profile = profRows[0] || null;

    const { rows: badgeRows } = await pool.query(
      `SELECT b.code, b.title, b.description, b.icon, ub.granted_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.granted_at DESC`,
      [userId]
    );

    return res.json({ profile, badges: badgeRows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy hồ sơ người dùng." });
  }
}
