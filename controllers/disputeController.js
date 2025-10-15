import pool from "../models/db.js";

async function getOrderParties(orderId) {
  const q = `
    SELECT o.id AS order_id, o.buyer_id, p.user_id AS seller_id
    FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.id = $1
    LIMIT 1;
  `;
  const { rows } = await pool.query(q, [orderId]);
  return rows[0] || null;
}

export async function createDispute(req, res) {
  const { order_id, title, reason, evidence_urls } = req.body || {};
  const userId = req.user?.id;
  if (!order_id || !title || !reason)
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc." });

  const parties = await getOrderParties(order_id);
  if (!parties) return res.status(404).json({ message: "Không tìm thấy đơn hàng." });

  if (userId !== parties.buyer_id && userId !== parties.seller_id) {
    return res.status(403).json({ message: "Bạn không có quyền mở khiếu nại." });
  }

  const againstId = userId === parties.buyer_id ? parties.seller_id : parties.buyer_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ins = await client.query(
      `INSERT INTO disputes (order_id, opener_id, against_id, title, reason)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [order_id, userId, againstId, title, reason]
    );
    const disputeId = ins.rows[0].id;

    await client.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_user_id, event)
       VALUES ($1, $2, $3, $4)`,
      [disputeId, userId === parties.buyer_id ? "BUYER" : "SELLER", userId, "OPENED"]
    );

    if (Array.isArray(evidence_urls) && evidence_urls.length) {
      for (const url of evidence_urls) {
        await client.query(
          `INSERT INTO dispute_evidences (dispute_id, owner_id, type, url)
           VALUES ($1,$2,'IMAGE',$3)`,
          [disputeId, userId, url]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ id: disputeId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ message: "Lỗi máy chủ khi tạo khiếu nại." });
  } finally {
    client.release();
  }
}

export async function listMyDisputes(req, res) {
  const userId = req.user?.id;
  const { status } = req.query;
  const params = [userId, userId];
  let sql = `
    SELECT d.*, 
           u1.username AS opener_name, 
           u2.username AS against_name
    FROM disputes d
    JOIN users u1 ON u1.id = d.opener_id
    JOIN users u2 ON u2.id = d.against_id
    WHERE d.opener_id = $1 OR d.against_id = $2
  `;
  if (status) {
    params.push(status);
    sql += ` AND d.status = $3`;
  }
  sql += ` ORDER BY d.created_at DESC`;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
}

export async function getDisputeDetail(req, res) {
  const id = Number(req.params.id);
  const userId = req.user?.id;

  const { rows } = await pool.query(`SELECT * FROM disputes WHERE id = $1`, [id]);
  const dispute = rows[0];
  if (!dispute) return res.status(404).json({ message: "Không tìm thấy khiếu nại." });

  if (![dispute.opener_id, dispute.against_id].includes(userId) && req.user?.role !== "admin") {
    return res.status(403).json({ message: "Không có quyền xem khiếu nại này." });
  }

  const { rows: evs } = await pool.query(
    `SELECT * FROM dispute_events WHERE dispute_id=$1 ORDER BY created_at ASC`,
    [id]
  );
  const { rows: evidences } = await pool.query(
    `SELECT * FROM dispute_evidences WHERE dispute_id=$1 ORDER BY created_at ASC`,
    [id]
  );
  res.json({ dispute, events: evs, evidences });
}

export async function addEvidence(req, res) {
  const id = Number(req.params.id);
  const userId = req.user?.id;
  const { type = "IMAGE", url, caption } = req.body || {};
  if (!url) return res.status(400).json({ message: "Thiếu URL minh chứng." });

  const { rows } = await pool.query(`SELECT opener_id, against_id FROM disputes WHERE id=$1`, [id]);
  const d = rows[0];
  if (!d) return res.status(404).json({ message: "Không tìm thấy khiếu nại." });
  if (![d.opener_id, d.against_id].includes(userId) && req.user?.role !== "admin") {
    return res.status(403).json({ message: "Không có quyền thêm minh chứng." });
  }

  await pool.query(
    `INSERT INTO dispute_evidences (dispute_id, owner_id, type, url, caption)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, type, url, caption || null]
  );
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_user_id, event)
     VALUES ($1,'BUYER',$2,'ADD_EVIDENCE')`,
    [id, userId]
  );
  res.json({ ok: true });
}

export async function adminSetStatus(req, res) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Chỉ admin mới được cập nhật." });
  const id = Number(req.params.id);
  const { status, note } = req.body || {};
  await pool.query(`UPDATE disputes SET status=$1 WHERE id=$2`, [status, id]);
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_user_id, event, note)
     VALUES ($1,'ADMIN',$2,'STATUS_CHANGE',$3)`,
    [id, req.user.id, note || status]
  );
  res.json({ ok: true });
}

export async function adminSetResolution(req, res) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Chỉ admin mới được cập nhật." });
  const id = Number(req.params.id);
  const { resolution, note } = req.body || {};
  await pool.query(
    `UPDATE disputes SET status='RESOLVED', resolution=$1, resolution_note=$2 WHERE id=$3`,
    [resolution || "NONE", note || null, id]
  );
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_user_id, event, note)
     VALUES ($1,'ADMIN',$2,'RESOLVED',$3)`,
    [id, req.user.id, note || resolution || "RESOLVED"]
  );
  res.json({ ok: true });
}
