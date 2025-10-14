// src/models/db.js (hoặc nơi bạn tạo pool)
import pg from "pg";
import dotenv from "dotenv";

// Chỉ load .env khi chạy local (trên Railway không có file .env)
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const { Pool } = pg;

// Ưu tiên DATABASE_URL (Railway cấp). Fallback sang bộ biến rời cho local.
const useConnStr = Boolean(process.env.DATABASE_URL);

const pool = useConnStr
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Với host nội bộ *.railway.internal thường KHÔNG cần SSL.
      // Nếu sau này dùng public host và bị lỗi SSL, set PGSSLMODE=require trong Variables.
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME,
      password: process.env.DB_PASS,
      port: Number(process.env.DB_PORT || 5432),
    });

// Kiểm tra kết nối (log an toàn, không lộ secret)
(async () => {
  try {
    if (process.env.DATABASE_URL) {
      const u = new URL(process.env.DATABASE_URL);
      console.log("✅ DB connected (via DATABASE_URL) host:", u.hostname);
    } else {
      console.log("✅ DB connected (via discrete env) host:", process.env.DB_HOST);
    }
    await pool.query("SELECT 1");
  } catch (err) {
    console.error("❌ DB connect error:", err.message);
  }
})();

export default pool;
