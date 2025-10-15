// backend/server.js  (ESM)
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import { Server } from "socket.io";

// Routes
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import favoriteRoutes from "./routes/favoriteRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import disputeRoutes from "./routes/disputeRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import voucherRoutes from "./routes/voucherRoutes.js";
import marketRoutes from "./routes/marketRoutes.js";
import productExtraRoutes from "./routes/productExtraRoutes.js";
import productImagesRoutes from "./routes/productImagesRoutes.js";
import profileStatsRoutes from "./routes/profileStatsRoutes.js";
import sellerRoutes from "./routes/sellerRoutes.js";

dotenv.config();

const app = express();

/* -------------------- CORS -------------------- */
/** ALLOWED_ORIGINS: chuỗi CSV trong .env
 *  Ví dụ (Railway Backend):
 *  ALLOWED_ORIGINS=https://frontend-production-fe496.up.railway.app,http://localhost:5173
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Cho phép Postman/SSR (origin null) hoặc domain trong whitelist
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // preflight
app.use((req, res, next) => {
  // giúp CDN/browser cache theo Origin chính xác
  res.header("Vary", "Origin");
  next();
});

/* ------------- security & parsers ------------- */
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ------------- __dirname (ESM) ------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------- ensure uploads dirs ------------- */
const uploadDir = path.join(__dirname, "uploads");
const avatarDir = path.join(uploadDir, "avatars");
const reviewDir = path.join(uploadDir, "reviews");
[uploadDir, avatarDir, reviewDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ------------- static ------------- */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/* ------------- mount routes ------------- */
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);

app.use("/api/cart", cartRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/disputes", disputeRoutes);

app.use("/api/products", reviewRoutes);         // /api/products/:id/reviews
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);

app.use("/api/profile", profileRoutes);         // hồ sơ (CRUD)
app.use("/api/profile", profileStatsRoutes);    // thống kê hồ sơ (khác prefix nhưng chung /api/profile)
app.use("/api/sellers", sellerRoutes);          // ✅ đúng router cho seller

// Voucher routes tự có prefix bên trong (giữ nguyên)
app.use(voucherRoutes);

app.use("/api/market", marketRoutes);
app.use("/api/products", productExtraRoutes);
app.use("/api/products", productImagesRoutes);

/* ------------- socket.io ------------- */
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions, // dùng cùng corsOptions cho thống nhất
});
app.set("io", io);

// Namespace chat
const chat = io.of("/chat");
chat.on("connection", (socket) => {
  const { userId } = socket.handshake.auth || {};
  socket.data.userId = userId;

  socket.on("join", ({ conversationId }) => {
    if (conversationId) socket.join(`c:${conversationId}`);
  });
  socket.on("typing", ({ conversationId, isTyping }) => {
    if (conversationId) socket.to(`c:${conversationId}`).emit("typing", { userId: socket.data.userId, isTyping });
  });
  socket.on("message:send", ({ conversationId, message }) => {
    if (conversationId && message) socket.to(`c:${conversationId}`).emit("message:new", { message });
  });
  socket.on("read", ({ conversationId, lastMessageId }) => {
    if (conversationId) socket.to(`c:${conversationId}`).emit("read", { lastMessageId });
  });
});

// Kênh sản phẩm (ví dụ)
io.on("connection", (socket) => {
  socket.on("product:join", ({ productId }) => {
    if (productId) socket.join(`product:${productId}`);
  });
  socket.on("product:leave", ({ productId }) => {
    if (productId) socket.leave(`product:${productId}`);
  });
});

/* ------------- start ------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on ${PORT}`);
  console.log("✅ CORS allow:", ALLOWED_ORIGINS);
});
