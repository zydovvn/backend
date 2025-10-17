import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false, // ⚡ Bắt buộc trên Railway
  },
});

pool.connect()
  .then(client => {
    console.log("✅ Kết nối cơ sở dữ liệu thành công.");
    client.release();
  })
  .catch(err => {
    console.error("❌ Không thể kết nối cơ sở dữ liệu:", err.message);
  });

export default pool;
