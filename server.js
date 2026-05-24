// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

// CORS ayarı: Farklı portlardan (9090 ve mobilden) gelen isteklere izin ver
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 Yeni bir cihaz bağlandı! ID:", socket.id);

  // 1. Mobilden 'new_log' sinyali geldiğinde bunu yakala
  socket.on("new_log", (logData) => {
    // 2. Gelen bu logu, bağlı olan TÜM cihazlara (Dashboard'a) anında fırlat!
    io.emit("new_log", logData);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cihaz ayrıldı:", socket.id);
  });
});

// Sunucuyu 3000 portunda ayağa kaldır
const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(
    `🚀 Merkez Telsiz Kulesi (Socket Server) ${PORT} portunda yayında!`,
  );
});
