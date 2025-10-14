// backend/services/feeService.js (ESM)
import pool from "../models/db.js";

/** Helpers */
const now = () => new Date();

const parseCategoryList = (txt) => {
  if (!txt) return null;
  try {
    const arr = JSON.parse(txt);
    if (Array.isArray(arr)) return arr.map(String);
    return null;
  } catch {
    return null;
  }
};

export async function getCurrentListingFee(client = pool) {
  const r = await client.query(
    `SELECT amount_vnd FROM listing_fees WHERE is_active = TRUE LIMIT 1`
  );
  const amt = Number(r.rows?.[0]?.amount_vnd || 0);
  return Math.max(0, amt);
}

export async function getSellerCounters(sellerId, client = pool) {
  const r = await client.query(
    `SELECT seller_id, total_posts, free_quota_used
     FROM seller_post_counters WHERE seller_id = $1`,
    [sellerId]
  );
  if (r.rowCount) return r.rows[0];
  // upsert (insert default)
  await client.query(
    `INSERT INTO seller_post_counters (seller_id, total_posts, free_quota_used)
     VALUES ($1, 0, 0)
     ON CONFLICT (seller_id) DO NOTHING`,
    [sellerId]
  );
  return { seller_id: sellerId, total_posts: 0, free_quota_used: 0 };
}

export async function bumpCountersOnPost({ sellerId, usedFreeQuota }, client) {
  await client.query(
    `UPDATE seller_post_counters
     SET total_posts = total_posts + 1,
         free_quota_used = free_quota_used + $2,
         updated_at = NOW()
     WHERE seller_id = $1`,
    [sellerId, usedFreeQuota ? 1 : 0]
  );
}

async function getVoucherByCode(code, client = pool) {
  const r = await client.query(`SELECT * FROM vouchers WHERE code = $1`, [code]);
  return r.rows[0] || null;
}

async function countVoucherGlobalUsed(voucherId, client = pool) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS used FROM voucher_redemptions WHERE voucher_id = $1`,
    [voucherId]
  );
  return r.rows[0].used || 0;
}

async function countVoucherSellerUsed(voucherId, sellerId, client = pool) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS used
     FROM voucher_redemptions
     WHERE voucher_id = $1 AND seller_id = $2`,
    [voucherId, sellerId]
  );
  return r.rows[0].used || 0;
}

async function getIssuance(voucherId, sellerId, client = pool) {
  const r = await client.query(
    `SELECT issued_count FROM voucher_issuance WHERE voucher_id = $1 AND seller_id = $2`,
    [voucherId, sellerId]
  );
  return r.rows[0]?.issued_count ?? 0;
}

function applyDiscountByType(type, { feeBefore, value, freeCount }) {
  let discount = 0;
  if (type === "PERCENT") {
    discount = (feeBefore * Number(value || 0)) / 100;
  } else if (type === "AMOUNT") {
    discount = Number(value || 0);
  } else if (type === "FREE_LISTING") {
    discount = feeBefore; // miễn toàn bộ
  }
  discount = Math.max(0, Math.min(discount, feeBefore));
  const feeAfter = Math.max(0, feeBefore - discount);
  return { discount, feeAfter };
}

/**
 * Tính phí cho seller (preview)
 * - Ưu tiên quota miễn phí 5 bài đầu.
 * - Nếu vượt quota: áp listing fee hiện hành và voucher (nếu hợp lệ).
 */
export async function computeFeeForSeller(
  { sellerId, categoryId = null, voucherCode = null },
  client = pool
) {
  const FREE_LIMIT = 5;
  const cnt = await getSellerCounters(sellerId, client);
  const listingFee = await getCurrentListingFee(client);

  // Còn quota miễn phí?
  if (cnt.free_quota_used < FREE_LIMIT) {
    return {
      feeBefore: 0,
      discount: 0,
      feeAfter: 0,
      source: "FREE_QUOTA",
      appliedVoucher: null,
      freeLeft: FREE_LIMIT - cnt.free_quota_used,
      listingFee,
    };
  }

  // Hết quota -> xét voucher
  let feeBefore = listingFee;
  let source = "NONE";
  let appliedVoucher = null;
  let discount = 0;
  let feeAfter = feeBefore;

  if (voucherCode) {
    const v = await getVoucherByCode(voucherCode, client);
    if (!v) {
      return {
        feeBefore,
        discount: 0,
        feeAfter,
        source: "NONE",
        appliedVoucher: null,
        error: "Mã voucher không tồn tại",
        listingFee,
      };
    }

    // Validate: trạng thái, thời gian
    const nowTs = now();
    if (!v.is_active) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Voucher không hoạt động", listingFee };
    }
    if (v.starts_at && nowTs < new Date(v.starts_at)) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Voucher chưa đến thời gian hiệu lực", listingFee };
    }
    if (v.ends_at && nowTs > new Date(v.ends_at)) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Voucher đã hết hạn", listingFee };
    }
    if (Number(v.min_fee_amount || 0) > 0 && feeBefore < Number(v.min_fee_amount)) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Phí không đạt mức tối thiểu của voucher", listingFee };
    }

    // Danh mục
    const cats = parseCategoryList(v.applicable_categories);
    if (cats && categoryId && !cats.includes(String(categoryId))) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Voucher không áp dụng cho danh mục này", listingFee };
    }

    // Global/Issued
    if (!v.is_global) {
      const issued = await getIssuance(v.id, sellerId, client);
      if (issued <= 0) {
        return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Bạn không được cấp voucher này", listingFee };
      }
    }

    // Giới hạn lượt dùng
    const usedGlobal = await countVoucherGlobalUsed(v.id, client);
    if (Number(v.max_uses_global || 0) > 0 && usedGlobal >= v.max_uses_global) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Voucher đã hết lượt dùng toàn hệ thống", listingFee };
    }
    const usedSeller = await countVoucherSellerUsed(v.id, sellerId, client);
    if (Number(v.max_uses_per_seller || 0) > 0 && usedSeller >= v.max_uses_per_seller) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Bạn đã dùng tối đa số lần cho voucher này", listingFee };
    }

    // FREE_LISTING cần free_count > 0 tại thời điểm dùng (diễn giải: mỗi redemption trừ 1)
    if (v.type === "FREE_LISTING" && Number(v.free_count || 0) <= 0) {
      return { feeBefore, discount: 0, feeAfter, source: "NONE", appliedVoucher: null, error: "Voucher miễn phí không còn lượt khả dụng", listingFee };
    }

    const r = applyDiscountByType(v.type, { feeBefore, value: v.value, freeCount: v.free_count });
    discount = r.discount;
    feeAfter = r.feeAfter;
    source = "VOUCHER";
    appliedVoucher = { id: v.id, code: v.code, type: v.type };
  }

  return { feeBefore, discount, feeAfter, source, appliedVoucher, listingFee, freeLeft: 0 };
}

/**
 * Redeem thật sự trong transaction sau khi đã tạo post
 */
export async function redeemAfterCreatePost({
  client, sellerId, categoryId, voucherCode, postId,
}) {
  // Kiểm tra quota lần nữa trong transaction
  const FREE_LIMIT = 5;

  // lock row counters
  await client.query(`SELECT * FROM seller_post_counters WHERE seller_id = $1 FOR UPDATE`, [sellerId]);
  const cnt = await getSellerCounters(sellerId, client);

  if (cnt.free_quota_used < FREE_LIMIT) {
    await bumpCountersOnPost({ sellerId, usedFreeQuota: true }, client);
    return {
      fee: { before: 0, discount: 0, after: 0, source: "FREE_QUOTA", voucher_code: null },
    };
  }

  const preview = await computeFeeForSeller({ sellerId, categoryId, voucherCode }, client);
  const { feeBefore, discount, feeAfter, source, appliedVoucher } = preview;

  // Ghi redemption nếu có voucher
  if (source === "VOUCHER" && appliedVoucher?.id) {
    await client.query(
      `INSERT INTO voucher_redemptions (voucher_id, seller_id, post_id, fee_before, discount_applied, fee_after)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (voucher_id, seller_id, post_id) DO NOTHING`,
      [appliedVoucher.id, sellerId, postId, feeBefore, discount, feeAfter]
    );
  }
  // Cập nhật counters
  await bumpCountersOnPost({ sellerId, usedFreeQuota: false }, client);

  return {
    fee: {
      before: feeBefore,
      discount,
      after: feeAfter,
      source,
      voucher_code: appliedVoucher?.code || null,
    },
  };
}
