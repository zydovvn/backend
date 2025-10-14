// backend/routes/voucherRoutes.js
import { Router } from "express";
import pool from "../models/db.js";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// Admin list
router.get("/", authMiddleware, requireRole("admin"), async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT v.*, COALESCE(u.used_count,0) used_count
     FROM vouchers v
     LEFT JOIN (SELECT voucher_id, COUNT(*)::int used_count FROM voucher_usages GROUP BY voucher_id) u
     ON u.voucher_id = v.id
     ORDER BY v.created_at DESC`
  );
  res.json(rows);
});

// Admin create
router.post("/", authMiddleware, requireRole("admin"), async (req,res)=>{
  const { code, description, type, value, max_uses, expires_at } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO vouchers (code, description, type, value, max_uses, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code, description, type, value, max_uses||null, expires_at||null]
  );
  res.json(rows[0]);
});

// Seller: voucher của tôi
router.get("/mine", authMiddleware, async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT v.*, COALESCE(u.used_count,0) used_count
     FROM vouchers v
     LEFT JOIN voucher_targets t ON t.voucher_id=v.id
     LEFT JOIN (SELECT voucher_id, COUNT(*)::int used_count FROM voucher_usages WHERE user_id=$1 GROUP BY voucher_id) u
        ON u.voucher_id=v.id
     WHERE t.user_id=$1 OR t.user_id IS NULL
     ORDER BY v.created_at DESC`,
     [req.user.id]
  );
  res.json(rows);
});

// Preview (không trừ lượt) + Apply (trừ lượt)
router.post("/check", authMiddleware, async (req,res)=>{
  const { code, base_fee=0, context="post_fee" } = req.body;
  const q = await pool.query(`SELECT * FROM vouchers WHERE code=$1`, [code]);
  const v = q.rows[0];
  if (!v) return res.status(404).json({ message:"Voucher không tồn tại" });
  if (v.expires_at && new Date(v.expires_at) < new Date()) return res.status(400).json({ message:"Voucher đã hết hạn" });
  if (v.max_uses) {
    const used = await pool.query(`SELECT COUNT(*)::int c FROM voucher_usages WHERE voucher_id=$1`, [v.id]);
    if (used.rows[0].c >= v.max_uses) return res.status(400).json({ message:"Voucher đã hết lượt" });
  }
  const forUser = await pool.query(
    `SELECT COUNT(*)::int c FROM voucher_usages WHERE voucher_id=$1 AND user_id=$2 AND context=$3`,
    [v.id, req.user.id, context]
  );
  let final_fee = Number(base_fee)||0;
  if (v.type==="percent") final_fee = Math.max(0, Math.round(final_fee*(1-Number(v.value)/100)));
  else if (v.type==="amount") final_fee = Math.max(0, final_fee-Number(v.value));
  else if (v.type==="free_quota") if (forUser.rows[0].c < Number(v.value)) final_fee = 0;
  res.json({ valid:true, final_fee, voucher:v });
});

router.post("/apply", authMiddleware, async (req,res)=>{
  const { code, context="post_fee" } = req.body;
  const { rows } = await pool.query(`SELECT * FROM vouchers WHERE code=$1`, [code]);
  const v = rows[0];
  if(!v) return res.status(404).json({ message:"Voucher không tồn tại" });
  if (v.expires_at && new Date(v.expires_at) < new Date()) return res.status(400).json({ message:"Voucher đã hết hạn" });
  if (v.max_uses) {
    const used = await pool.query(`SELECT COUNT(*)::int c FROM voucher_usages WHERE voucher_id=$1`, [v.id]);
    if (used.rows[0].c >= v.max_uses) return res.status(400).json({ message:"Voucher đã hết lượt" });
  }
  await pool.query(`INSERT INTO voucher_usages (voucher_id, user_id, context) VALUES ($1,$2,$3)`,
                   [v.id, req.user.id, context]);
  res.json({ ok:true, voucher:v });
});

export default router;
