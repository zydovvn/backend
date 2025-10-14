// backend/routes/orderRoutes.js
import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getBuyerOrders,
  getSellerOrders,
  getOrderById,
  getOrderStats,
  createOrder,
  updateOrderStatus,
} from "../controllers/orderController.js";

const router = express.Router();

// Áp dụng xác thực cho tất cả routes dưới đây
router.use(authMiddleware);

// Buyer xem đơn của mình
// GET /api/orders/buyer
router.get("/buyer", getBuyerOrders);

// Seller xem đơn liên quan sản phẩm của mình
// GET /api/orders/seller
router.get("/seller", getSellerOrders);

// Thống kê cho seller
// GET /api/orders/stats
router.get("/stats", getOrderStats);

// Xem chi tiết đơn
// GET /api/orders/:id
router.get("/:id", getOrderById);

// Tạo đơn hàng (buyer)
// POST /api/orders
router.post("/", createOrder);

// ✅ Alias để tương thích FE hiện đang gọi POST /api/orders/create
// POST /api/orders/create
router.post("/create", createOrder);

// Cập nhật trạng thái đơn (seller/admin)
// PUT /api/orders/:id/status
router.put("/:id/status", updateOrderStatus);

export default router;
