const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;

const app = express();
const server = http.createServer(app);

// إعدادات Socket.io مع رفع سعة الحجم إلى 100 ميجابايت
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // 100 Megabytes
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 1. إعدادات Cloudinary بمفاتيحك الخاصة
cloudinary.config({ 
  cloud_name: 'yerbm3xu', 
  api_key: '556822354784538', 
  api_secret: 'D_dtbz6U-DBOu3z6G3ijoFxXxZU' 
});

// 2. الاتصال بقاعدة البيانات MongoDB Atlas عبر رابط الخوادم المباشرة لتفادي خطأ DNS
const MONGO_URI = process.env.MONGO_URI || "mongodb://nnidhalnid:123456789nidhal@cluster0-shard-00-00.o5s2i.mongodb.net:27017,cluster0-shard-00-01.o5s2i.mongodb.net:27017,cluster0-shard-00-02.o5s2i.mongodb.net:27017/onlineni_db?ssl=true&replicaSet=atlas-13c5sk-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.log("DB Connection Error:", err));

// 3. هيكل مخطط الرسائل (Message Schema)
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  text: { type: String, default: "" },
  fileUrl: { type: String, default: null }, // حفظ رابط Cloudinary فقط
  fileName: { type: String, default: "" },
  type: { type: String, default: "text" }, // text, image, audio, video, file
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// 4. مسار API لجلب الرسائل القديمة
app.get("/api/messages/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: user1, recipient: user2 },
        { sender: user2, recipient: user1 }
      ]
    }).sort({ timestamp: 1 });
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "فشل في جلب الرسائل" });
  }
});

// 5. إدارة اتصالات Socket.io اللحظية
io.on("connection", (socket) => {
  console.log("مستخدم جديد متصل:", socket.id);

  // الانضمام لغرفة باسم المستخدم لتلقي الرسائل الخاصة
  socket.on("join_room", (username) => {
    socket.join(username);
    console.log(`المستخدم ${username} انضم للغرفة الخاصة به`);
  });

  // استقبال وإرسال الرسائل الخاصة
  socket.on("private_message", async (data) => {
    try {
      let uploadedFileUrl = null;

      // إذا كانت الرسالة تحتوي على ملف (صورة، صوت، فيديو) نرفعه لـ Cloudinary أولاً
      if (data.fileData) {
        const uploadResponse = await cloudinary.uploader.upload(data.fileData, {
          resource_type: "auto", // يحدد نوع الملف تلقائياً
          folder: "chat_app_media"
        });
        uploadedFileUrl = uploadResponse.secure_url;
      }

      // حفظ بيانات الرسالة بالرابط فقط في MongoDB
      const newMessage = new Message({
        sender: data.sender,
        recipient: data.recipient,
        text: data.text || "",
        fileUrl: uploadedFileUrl,
        fileName: data.fileName || "",
        type: data.type || "text",
        timestamp: new Date()
      });

      await newMessage.save();

      // إرسال الرسالة فوراً للطرفين (المستلم والراسل)
      io.to(data.recipient).emit("receive_message", newMessage);
      io.to(data.sender).emit("receive_message", newMessage);

    } catch (error) {
      console.error("خطأ أثناء معالجة أو رفع الرسالة:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("انقطع اتصال مستخدم:", socket.id);
  });
});

// تشغيل السيرفر على المنفذ المخصص
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`);
});
