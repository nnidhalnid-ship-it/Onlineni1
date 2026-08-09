// Onlineni Real-time Backend Server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ŞæÇÚÏ ÇáÈíÇäÇÊ İí ÇáĞÇßÑÉ (ááÊæÖíÍ)
const users = {}; // { socketId: username }
const registeredUsers = new Set(); // ÇáãØæÑíä æÇáãÓÌáíä
const messages = {}; // ÃÑÔíİ ÇáãÍÇÏËÇÊ

// ãİÊÇÍ API ÇáÎÇÕ ÈÇáĞßÇÁ ÇáÇÕØäÇÚí (ÖÚ ãİÊÇÍß åäÇ)
const AI_API_KEY = "YOUR_OPENAI_OR_GEMINI_API_KEY";

io.on('connection', (socket) => {
  console.log('ãÓÊÎÏã ÌÏíÏ ÇÊÕá:', socket.id);

  // 1. ÊÓÌíá ÇáÍÓÇÈ ÚäÏ ÇáÏÎæá
  socket.on('register_user', (username) => {
    users[socket.id] = username;
    registeredUsers.add(username);
    socket.join(username); // ÇáÇäÖãÇã áÛÑİÉ ÎÇÕÉ ÈÇÓã ÇáãÓÊÎÏã
    console.log(`Êã ÊÓÌíá ÇáãÓÊÎÏã: ${username}`);
    
    // ÅÑÓÇá ŞÇÆãÉ ÌãíÚ ÇáãÓÊÎÏãíä ááÈÍË
    io.emit('update_users_list', Array.from(registeredUsers));
  });

  // 2. ÇáÈÍË Úä ãÓÊÎÏã
  socket.on('search_user', (searchTerm) => {
    const results = Array.from(registeredUsers).filter(u => 
      u.toLowerCase().includes(searchTerm.toLowerCase())
    );
    socket.emit('search_results', results);
  });

  // 3. ÅÑÓÇá ÑÓÇáÉ ÍŞíŞíÉ ãä ÔÎÕ áÂÎÑ
  socket.on('send_private_message', async ({ to, text, file }) => {
    const sender = users[socket.id];
    const msgData = {
      sender,
      to,
      text,
      file,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };

    // ÅÑÓÇá ÇáÑÓÇáÉ ááãÓÊáã İæÑÇğ ÅĞÇ ßÇä ãÊÕáÇğ
    io.to(to).emit('receive_message', msgData);
    // ÅÑÌÇÚ äÓÎÉ ááãÑÓá ááÊÃßíÏ
    socket.emit('message_sent_confirm', msgData);

    // ÅĞÇ ßÇäÊ ÇáÑÓÇáÉ ãæÌåÉ ááãÓÇÚÏ ÇáĞßí AI
    if (to === 'Onlineni_AI') {
      try {
        // åäÇ íÊã ØáÈ ÇáÑÏ ãä ÇáĞßÇÁ ÇáÇÕØäÇÚí ÍŞíŞÉ
        const aiReply = await fetchAIResponse(text);
        socket.emit('receive_message', {
          sender: 'Onlineni_AI',
          to: sender,
          text: aiReply,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        });
      } catch (err) {
        socket.emit('receive_message', {
          sender: 'Onlineni_AI',
          to: sender,
          text: "ÚĞÑÇğ íÇ äÖÇá¡ ÊÚĞÑ ÇáÇÊÕÇá ÈãÍÑß ÇáĞßÇÁ ÇáÇÕØäÇÚí ÍÇáíÇğ.",
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        });
      }
    }
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
  });
});

// ÏÇáÉ ãÍÇßÇÉ ÇáÇÊÕÇá ÈÜ ChatGPT / Gemini API
async function fetchAIResponse(prompt) {
  // íãßäß ÑÈØåÇ ÈÜ OpenAI API ãÈÇÔÑÉ åäÇ
  return `ÑÏ Ğßí ÍŞíŞí ãä ÇáãÓÇÚÏ Íæá: "${prompt}"`;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ÎÇÏã Onlineni íÚãá ÈäÌÇÍ Úáì ÇáãäİĞ ${PORT}`);
});