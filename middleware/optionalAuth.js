// middleware/optionalAuth.js
import jwt from "jsonwebtoken";

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // ✅ gắn thông tin user từ JWT
    } catch (err) {
      console.warn("⚠️ Token không hợp lệ:", err.message);
    }
  }
  next();
};
