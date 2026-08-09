const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// تخزين الحسابات المتصلة حالياً: { username: socketId }
const users = {};

io.on("connection", (socket) => {
  // عند تسجيل دخول اسم جديد
  socket.on("register_user", (username) => {
    users[username] = socket.id;
    socket.username = username;
    
    // إرسال قائمة كل المستخدمين المتصلين حالياً للجميع
    io.emit("update_user_list", Object.keys(users));
  });

  // إرسال رسالة خاصة لشخص محدد
  socket.on("private_message", ({ recipient, text }) => {
    const recipientSocketId = users[recipient];
    if (recipientSocketId) {
      // إرسال الرسالة للطرف الآخر
      io.to(recipientSocketId).emit("receive_private_message", {
        sender: socket.username,
        text: text
      });
    }
  });

  // عند انقطاع الاتصال
  socket.on("disconnect", () => {
    if (socket.username) {
      delete users[socket.username];
      io.emit("update_user_list", Object.keys(users));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Private Chat Server running on port ${PORT}`);
});
