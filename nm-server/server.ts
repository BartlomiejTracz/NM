// nm-server/server.ts

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Pamięć pokoi poszerzona o układ wysp na mapie (board)
const rooms: Record<string, { 
  players: string[], 
  fleets: { a?: any[], b?: any[] },
  board?: any 
}> = {};

io.on('connection', (socket) => {
  console.log(`[+] Zgłasza się nowy oficer (ID: ${socket.id})`);

  // 1. ZAKŁADANIE GRY (Gracz A wysyła swoją wygenerowaną mapę)
  socket.on('create_room', (data) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = { players: [socket.id], fleets: {}, board: data.board };
    socket.join(roomId);
    console.log(`[BAZA] Utworzono nowy obszar operacyjny: ${roomId}`);
    socket.emit('room_created', { roomId, playerId: 'a' });
  });

  // 2. DOŁĄCZANIE (Serwer wysyła Graczowi B mapę Gracza A)
  socket.on('join_room', (roomId) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Taki kod operacyjny nie istnieje!');
    if (room.players.length >= 2) return socket.emit('error', 'Ten obszar operacyjny jest już pełny!');

    room.players.push(socket.id);
    socket.join(roomId);
    console.log(`[BAZA] Oficer dołączył do operacji ${roomId}`);
    
    // Gracz B dostaje mapę, by obaj grali na tym samym ułożeniu wysp!
    socket.emit('room_joined', { roomId, playerId: 'b', board: room.board });
    io.to(roomId).emit('game_ready');
  });

  // 3. ZATWIERDZANIE FLOTY
  socket.on('submit_fleet', (data) => {
    const { roomId, role, fleet } = data;
    const room = rooms[roomId];
    if (!room) return;

    room.fleets[role as 'a' | 'b'] = fleet;
    console.log(`[BAZA] Oficer ${role.toUpperCase()} zameldował gotowość w sektorze ${roomId}`);

    if (room.fleets.a && room.fleets.b) {
      console.log(`[BAZA] Obie floty w strefie ${roomId} gotowe. Start bitwy!`);
      const combinedUnits = [...room.fleets.a, ...room.fleets.b];
      io.to(roomId).emit('game_start', combinedUnits);
    }
  });

  // 4. SYNCHRONIZACJA RUCHÓW (NOWE)
  socket.on('game_action', (data) => {
    // Kiedy jeden gracz się ruszy, wysyłamy ten ruch TYLKO do przeciwnika
    socket.to(data.roomId).emit('sync_action', data.action);
  });

  socket.on('disconnect', () => {
    console.log(`[-] Utracono łączność (ID: ${socket.id})`);
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`[START] Serwer dowodzenia nasłuchuje na porcie ${PORT}...`);
});