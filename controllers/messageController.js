import pool from "../models/db.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// helper: kiểm tra thành viên
async function isMember(conversationId, userId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",
    [conversationId, userId]
  );
  return rows.length > 0;
}

// (1) Đảm bảo có conversation 1-1
export const ensureDMConversation = async (req, res) => {
  const me = req.user.id;
  const { other_user_id } = req.body;
  if (!other_user_id || Number(other_user_id) === Number(me)) {
    return res.status(400).json({ error: "other_user_id không hợp lệ" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT get_or_create_conversation($1, $2) AS id",
      [me, other_user_id]
    );
    res.json({ conversation_id: rows[0].id });
  } catch (err) {
    console.error("ensureDMConversation:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// (2) Danh sách hội thoại của tôi (lastMessage + unreadCount)
export const listConversations = async (req, res) => {
  const me = req.user.id;
  try {
    // bạn lấy participant + last message + unread
    const { rows } = await pool.query(`
      WITH my_convs AS (
        SELECT cm.conversation_id
        FROM conversation_members cm
        WHERE cm.user_id = $1
      ),
      last_msg AS (
        SELECT DISTINCT ON (conversation_id)
               conversation_id, id AS message_id, content, image_url, sender_id, created_at
        FROM chat_messages
        WHERE conversation_id IN (SELECT conversation_id FROM my_convs)
        ORDER BY conversation_id, created_at DESC
      ),
      unread AS (
        -- đếm tin nhắn chưa đọc của tôi
        SELECT m.conversation_id, COUNT(*) AS unread_count
        FROM chat_messages m
        LEFT JOIN message_reads r
          ON r.message_id = m.id AND r.user_id = $1
        WHERE m.conversation_id IN (SELECT conversation_id FROM my_convs)
          AND m.sender_id <> $1
          AND r.message_id IS NULL
        GROUP BY m.conversation_id
      )
      SELECT c.id AS conversation_id,
             -- lấy đối tác (1-1)
             (SELECT u.id FROM conversation_members cm2 JOIN users u ON u.id=cm2.user_id
               WHERE cm2.conversation_id=c.id AND cm2.user_id <> $1 LIMIT 1) AS other_user_id,
             (SELECT u.username FROM conversation_members cm2 JOIN users u ON u.id=cm2.user_id
               WHERE cm2.conversation_id=c.id AND cm2.user_id <> $1 LIMIT 1) AS other_user_name,
             COALESCE(u.unread_count, 0) AS unread_count,
             lm.message_id, lm.content, lm.image_url, lm.sender_id, lm.created_at
      FROM conversations c
      LEFT JOIN last_msg lm ON lm.conversation_id = c.id
      LEFT JOIN unread u ON u.conversation_id = c.id
      WHERE c.id IN (SELECT conversation_id FROM my_convs)
      ORDER BY lm.created_at DESC NULLS LAST;
    `, [me]);

    // map image url
    const convs = rows.map(r => ({
      conversation_id: r.conversation_id,
      other_user_id: r.other_user_id,
      other_user_name: r.other_user_name,
      unread_count: Number(r.unread_count || 0),
      last_message: r.message_id ? {
        id: r.message_id,
        sender_id: r.sender_id,
        content: r.content,
        image_url: r.image_url ? `${BASE_URL}/uploads/${r.image_url}` : null,
        created_at: r.created_at,
      } : null
    }));
    res.json(convs);
  } catch (err) {
    console.error("listConversations:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// (3) Lấy messages (cursor = before_id) + limit
export const listMessages = async (req, res) => {
  const me = req.user.id;
  const conversationId = Number(req.params.id);
  const { before_id, limit = 30 } = req.query;
  try {
    if (!(await isMember(conversationId, me))) {
      return res.status(403).json({ error: "Không có quyền truy cập hội thoại" });
    }
    const params = [conversationId];
    let sql = `
      SELECT id, sender_id, content, image_url, created_at
      FROM chat_messages
      WHERE conversation_id = $1
    `;
    if (before_id) {
      params.push(before_id);
      sql += ` AND id < $2 `;
    }
    params.push(limit);
    sql += ` ORDER BY id DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    const msgs = rows.map(m => ({
      ...m,
      image_url: m.image_url ? `${BASE_URL}/uploads/${m.image_url}` : null
    })).reverse(); // trả về theo tăng dần

    res.json(msgs);
  } catch (err) {
    console.error("listMessages:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// (4) Gửi tin nhắn (text hoặc ảnh URL đã upload ở nơi khác)
export const sendMessage = async (req, res) => {
  const me = req.user.id;
  const conversationId = Number(req.params.id);
  const { content, image_url } = req.body; // image_url = filename nếu dùng multer ở endpoint upload riêng
  try {
    if (!(await isMember(conversationId, me))) {
      return res.status(403).json({ error: "Không có quyền gửi tin nhắn" });
    }
    if ((!content || !content.trim()) && !image_url) {
      return res.status(400).json({ error: "Thiếu nội dung hoặc ảnh" });
    }

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, content, image_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, me, content ?? null, image_url ?? null]
    );

    const m = rows[0];
    res.status(201).json({
      ...m,
      image_url: m.image_url ? `${BASE_URL}/uploads/${m.image_url}` : null
    });
  } catch (err) {
    console.error("sendMessage:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// (5) Đánh dấu đọc đến last_message_id
export const markRead = async (req, res) => {
  const me = req.user.id;
  const conversationId = Number(req.params.id);
  const { last_message_id } = req.body;
  try {
    if (!(await isMember(conversationId, me))) {
      return res.status(403).json({ error: "Không có quyền" });
    }
    // chèn read cho tất cả tin nhắn của hội thoại mà chưa có read bởi tôi, id <= last_message_id
    await pool.query(
      `INSERT INTO message_reads (message_id, user_id)
       SELECT m.id, $2
       FROM chat_messages m
       LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = $2
       WHERE m.conversation_id = $1 AND m.id <= $3 AND r.message_id IS NULL`,
      [conversationId, me, last_message_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("markRead:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};
