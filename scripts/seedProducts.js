import pool from "../models/db.js";

const N = 60;

async function main() {
  for (let i = 1; i <= N; i++) {
    await pool.query(
      `INSERT INTO products (name, price, description, image_url, user_id, category_id, stock, is_available)
       VALUES ($1,$2,$3,$4,
               (SELECT id FROM users ORDER BY random() LIMIT 1),
               (SELECT id FROM categories ORDER BY random() LIMIT 1),
               $5, TRUE)`,
      [
        `Sản phẩm ${i}`,
        Math.round(100000 + Math.random() * 900000),
        `Mô tả ngắn cho sản phẩm ${i}`,
        null, // hoặc '/uploads/demo.jpg'
        5 + Math.floor(Math.random() * 20),
      ]
    );
  }
  console.log("✅ Seed xong", N, "sản phẩm");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
