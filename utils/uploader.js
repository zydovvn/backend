// backend/utils/uploader.js  (ESM)
import path from "path";
import fs from "fs";
import multer from "multer";

// Đảm bảo thư mục tồn tại
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Chỉ cho phép ảnh phổ biến
const fileFilter = (req, file, cb) => {
  const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
  if (!ok) {
    // báo lỗi đúng kiểu Multer nhưng không crash server
    return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  }
  cb(null, true);
};

// Uploader theo subdir: 'products', 'reviews', ...
export const diskUploader = (subdir = "") => {
  const dest = path.join(process.cwd(), "uploads", subdir);
  ensureDir(dest);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const safe = Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, safe);
    },
  });

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  });
};
