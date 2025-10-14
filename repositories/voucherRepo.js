// backend/repositories/voucherRepo.js
import pool from "../models/db.js";

export async function adminCreateVoucher(payload) {
  const {
    code, name, type, value = 0, free_count = 0,
    max_uses_global = 0, max_uses_per_seller = 1,
    min_fee_amount = 0, applicable_categories = null,
    starts_at = null, ends_at = null, is_active = true, is_global = true,
    created_by = null,
  } = payload;

  const r = await pool.query(
    `INSERT INTO vouchers
     (code, name, type, value, free_count, max_uses_global, max_uses_per_seller,
      min_fee_amount, applicable_categories, starts_at, ends_at, is_active, is_global, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [code, name, type, value, free_count, max_uses_global, max_uses_per_seller,
     min_fee_amount, applicable_categories, starts_at, ends_at, is_active, is_global, created_by]
  );
  return r.rows[0];
}

export async function adminUpdateVoucher(id, payload) {
  // build dynamic set
  const fields = [];
  const vals = [];
  let idx = 1;
  for (const [k, v] of Object.entries(payload)) {
    fields.push(`${k} = $${idx++}`);
    vals.push(v);
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE vouchers SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    vals
  );
  return r.rows[0];
}

export async function adminDeleteVoucher(id) {
  await pool.query(`UPDATE vouchers SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
  return true;
}

export async function assignVoucher(voucher_id, seller_id, issued_count = 1) {
  await pool.query(
    `INSERT INTO voucher_issuance (voucher_id, seller_id, issued_count)
     VALUES ($1,$2,$3)
     ON CONFLICT (voucher_id, seller_id)
     DO UPDATE SET issued_count = EXCLUDED.issued_count`,
    [voucher_id, seller_id, issued_count]
  );
  return true;
}

export async function listVouchersAdmin({ q = "", active, type, date_from, date_to }) {
  const wh = [];
  const vals = [];
  let i = 1;
  if (q) { wh.push(`(code ILIKE $${i} OR name ILIKE $${i})`); vals.push(`%${q}%`); i++; }
  if (typeof active === "boolean") { wh.push(`is_active = $${i}`); vals.push(active); i++; }
  if (type) { wh.push(`type = $${i}`); vals.push(type); i++; }
  if (date_from) { wh.push(`(starts_at IS NULL OR starts_at >= $${i})`); vals.push(date_from); i++; }
  if (date_to) { wh.push(`(ends_at IS NULL OR ends_at <= $${i})`); vals.push(date_to); i++; }

  const r = await pool.query(
    `SELECT * FROM vouchers ${wh.length ? "WHERE " + wh.join(" AND ") : ""} ORDER BY id DESC LIMIT 200`,
    vals
  );
  return r.rows;
}

export async function getVoucherRedemptions(id) {
  const r = await pool.query(
    `SELECT vr.*, u.username AS seller_name, p.name AS post_name
     FROM voucher_redemptions vr
     LEFT JOIN users u ON u.id = vr.seller_id
     LEFT JOIN products p ON p.id = vr.post_id
     WHERE vr.voucher_id = $1
     ORDER BY vr.created_at DESC
     LIMIT 500`,
    [id]
  );
  return r.rows;
}

export async function listMyVouchers(sellerId) {
  // Global & active & within time window
  const r1 = await pool.query(
    `SELECT * FROM vouchers v
     WHERE v.is_active = TRUE AND v.is_global = TRUE
       AND (v.starts_at IS NULL OR v.starts_at <= NOW())
       AND (v.ends_at IS NULL OR v.ends_at >= NOW())
     ORDER BY id DESC LIMIT 200`
  );

  // Issued to seller
  const r2 = await pool.query(
    `SELECT v.*
     FROM voucher_issuance vi
     JOIN vouchers v ON v.id = vi.voucher_id
     WHERE vi.seller_id = $1
       AND v.is_active = TRUE
       AND (v.starts_at IS NULL OR v.starts_at <= NOW())
       AND (v.ends_at IS NULL OR v.ends_at >= NOW())
     ORDER BY v.id DESC LIMIT 200`,
    [sellerId]
  );

  // unify by code uniqueness
  const merged = new Map();
  for (const row of [...r1.rows, ...r2.rows]) merged.set(row.code, row);
  return [...merged.values()];
}
