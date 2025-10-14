import { Router } from "express";
import pool from "../models/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { diskUploader, publicProductUrl } from "../utils/uploader.js";

const router = Router();

/** Tạo bài đăng */
router.post("/create", authMiddleware, diskUploader.array("images", 6), async (req,res)=>{
  const { title, description, price, category, quantity } = req.body;
  const client = await pool.connect();
  try{
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO posts (user_id, title, description, price, category, quantity, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id, created_at`,
      [req.user.id, title, description, price, category, quantity||1]
    );
    const postId = rows[0].id;

    for(const f of (req.files || [])){
      await client.query(
        `INSERT INTO post_images (post_id, url) VALUES ($1,$2)`,
        [postId, publicProductUrl(f.filename)]
      );
    }
    await client.query("COMMIT");
    res.json({ id: postId, created_at: rows[0].created_at });
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({message:"create failed"});
  }finally{
    client.release();
  }
});

/** Danh sách bài đăng của tôi */
router.get("/my", authMiddleware, async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT p.*,
            (SELECT url FROM post_images WHERE post_id=p.id LIMIT 1) AS thumbnail_url,
            COALESCE(p.views,0) as views,
            COALESCE(p.favorites,0) as favorites,
            (SELECT COUNT(*) FROM messages m WHERE m.post_id=p.id) as messages,
            (SELECT COUNT(*) FROM orders o WHERE o.post_id=p.id) as orders
     FROM posts p
     WHERE p.user_id=$1
     ORDER BY p.created_at DESC`,
     [req.user.id]
  );
  res.json(rows);
});

/** Chi tiết bài đăng */
router.get("/:id", async (req,res)=>{
  const { id } = req.params;
  const base = await pool.query(
    `SELECT p.*, u.full_name, u.phone
     FROM posts p JOIN users u ON u.id=p.user_id
     WHERE p.id=$1`, [id]
  );
  if (!base.rows[0]) return res.status(404).json({message:"Not found"});
  const images = await pool.query(`SELECT url FROM post_images WHERE post_id=$1`, [id]);
  res.json({ ...base.rows[0], images: images.rows.map(r=>r.url) });
});

/** Cập nhật bài đăng */
router.put("/:id", authMiddleware, async (req,res)=>{
  const { id } = req.params;
  const { title, description, price, category, quantity, status } = req.body;
  await pool.query(
    `UPDATE posts SET title=$1, description=$2, price=$3, category=$4, quantity=$5, status=$6
     WHERE id=$7 AND user_id=$8`,
    [title, description, price, category, quantity, status, id, req.user.id]
  );
  res.json({ updated: true });
});

/** Xoá bài đăng */
router.delete("/:id", authMiddleware, async (req,res)=>{
  const { id } = req.params;
  await pool.query(`DELETE FROM posts WHERE id=$1 AND user_id=$2`, [id, req.user.id]);
  res.json({ deleted: true });
});

/** Gia hạn bài đăng */
router.post("/:id/renew", authMiddleware, async (req,res)=>{
  const { id } = req.params;
  await pool.query(`UPDATE posts SET expires_at = NOW() + INTERVAL '30 days' WHERE id=$1 AND user_id=$2`, [id, req.user.id]);
  res.json({ renewed: true });
});

export default router;
