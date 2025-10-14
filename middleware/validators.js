// backend/middleware/validators.js  (ESM + named exports)
import { body, validationResult } from "express-validator";

// Gom và trả lỗi theo dạng { errors: [{field, msg}] }
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res
    .status(400)
    .json({ errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })) });
};

/* ========== AUTH ========== */
export const validateRegister = [
  body("email").isEmail().withMessage("Email không hợp lệ"),
  body("password").isString().isLength({ min: 6 }).withMessage("Password tối thiểu 6 ký tự"),
  body("username").isString().isLength({ min: 2 }).withMessage("Username quá ngắn"),
  body("phone").isString().notEmpty().withMessage("Thiếu số điện thoại"),
  handleValidationErrors,
];

export const validateLogin = [
  body("email").isEmail().withMessage("Email không hợp lệ"),
  body("password").isString().notEmpty().withMessage("Password bắt buộc"),
  handleValidationErrors,
];

/* ========== PRODUCT ========== */
export const validateProductCreate = [
  body("name").isString().isLength({ min: 2 }).withMessage("Tên sản phẩm quá ngắn"),
  body("price").isFloat({ min: 0 }).withMessage("Giá không hợp lệ"),
  body("category_id").isInt({ min: 1 }).withMessage("category_id không hợp lệ"),
  body("description").isString().notEmpty().withMessage("Thiếu mô tả"),
  handleValidationErrors,
];

export const validateProductUpdate = [
  body("name").optional().isString().isLength({ min: 2 }),
  body("price").optional().isFloat({ min: 0 }),
  body("category_id").optional().isInt({ min: 1 }),
  body("description").optional().isString().isLength({ max: 2000 }),
  handleValidationErrors,
];

/* ========== ORDER ========== */
export const validateOrderCreate = [
  body("items").isArray({ min: 1 }),
  body("items.*.product_id").isInt({ min: 1 }),
  body("items.*.quantity").isInt({ min: 1 }),
  body("address").isString().isLength({ min: 5 }),
  handleValidationErrors,
];

export const validateOrderUpdate = [
  body("status").optional().isIn(["pending", "paid", "shipped", "completed", "canceled"]),
  body("address").optional().isString().isLength({ min: 5 }),
  handleValidationErrors,
];

/* ========== MESSAGE ========== */
export const validateMessageSend = [
  body("to_user_id").isInt({ min: 1 }),
  body("content").isString().isLength({ min: 1, max: 2000 }),
  handleValidationErrors,
];
