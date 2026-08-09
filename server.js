const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("مستخدم جديد اتصل:", socket.id);

  // دعم حدث message
  socket.on("message", (data) => {
    io.emit("message", data);
  });

  // دعم حدث chatMessage
  socket.on("chatMessage", (data) => {
    io.emit("chatMessage", data);
  });

  // دعم حدث send_message
  socket.on("send_message", (data) => {
    io.emit("receive_message", data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
