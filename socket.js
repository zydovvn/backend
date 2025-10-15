// backend/socket.js
// Thuần ESM, KHÔNG dùng require()
/**
 * setupSockets(io): đăng ký tất cả namespace và event lắng nghe
 * emitUserNotification/io, emitAdminNotify: helpers để controller gọi emit về FE
 */

export function setupSockets(io) {
  // ===== Root namespace: dùng cho thông báo Topbar =====
  io.on("connection", (socket) => {
    // Nếu FE truyền auth.userId thì lưu lại (không bắt buộc)
    const { userId } = socket.handshake.auth || {};
    if (userId) socket.data.userId = Number(userId);

    // Có thể debug:
    // console.log("socket connected:", socket.id, "uid:", socket.data.userId);
  });

  // ===== Chat namespace =====
  const chat = io.of("/chat");

  chat.on("connection", (socket) => {
    // FE bắt buộc gửi auth.userId cho chat
    const { userId } = socket.handshake.auth || {};
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    socket.data.userId = Number(userId);

    // Join 1 cuộc trò chuyện
    socket.on("join", ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conv:${conversationId}`);
    });

    // Gửi tin nhắn: broadcast cho phòng
    socket.on("message:send", (payload = {}) => {
      const { conversationId, message } = payload;
      if (!conversationId || !message) return;
      chat.to(`conv:${conversationId}`).emit("message:new", message);
    });

    // Đang gõ
    socket.on("typing", ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket
        .to(`conv:${conversationId}`)
        .emit("typing", { userId: socket.data.userId, isTyping: !!isTyping });
    });

    // Đã đọc
    socket.on("read", ({ conversationId, lastMessageId }) => {
      if (!conversationId) return;
      socket
        .to(`conv:${conversationId}`)
        .emit("read", { userId: socket.data.userId, lastMessageId });
    });
  });
}

/** Emit thông báo người dùng (khớp FE: `notification:new:<userId>`) */
export function emitUserNotification(io, userId, payload) {
  io.emit(`notification:new:${userId}`, {
    title: payload?.title || "Thông báo",
    body: payload?.body || "",
    created_at: new Date().toISOString(),
    is_read: false,
  });
}

/** Emit thông báo admin (khớp FE: `admin:notify:<userId>`) */
export function emitAdminNotify(io, userId, payload) {
  io.emit(`admin:notify:${userId}`, {
    title: payload?.title || "Thông báo từ Admin",
    body: payload?.body || "",
    created_at: new Date().toISOString(),
    is_read: false,
  });
}
