// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";

/** Xác thực JWT: gán req.user = { id, role } */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "secret");
    // Giữ nguyên cấu trúc user bạn đang dùng, chỉ cần chắc có role
    req.user = {
      id: payload.id,
      role: payload.role || payload?.user?.role || "user",
      ...(payload.user || {}), // nếu bạn nhúng nguyên user trong payload
    };
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/** Kiểm tra vai trò: requireRole("admin") / requireRole("seller","admin") */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "No auth" });
    // Một số dự án lưu role theo hoa/thường lẫn lộn → normalize
    const role = String(req.user.role || "").toLowerCase();
    const allow = roles.map(r => String(r).toLowerCase());
    if (!allow.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}
