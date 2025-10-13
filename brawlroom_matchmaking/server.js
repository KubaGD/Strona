const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

app.use(express.static(path.join(__dirname, 'public')));

let queue = []; // sockets waiting to be matched
const rooms = {}; // rooms by code

function genCode() {
  return Math.floor(10000 + Math.random()*90000).toString();
}

function tryMatch() {
  while (queue.length >= 6) {
    const players = queue.splice(0,6);
    const code = genCode();
    rooms[code] = {
      players: players.map(s => ({ id: s.id, name: s.name, bp: 1000, confirmed: false })),
      host: players[0].id,
      countdown: 60,
      started: false
    };
    // join sockets to room and notify
    players.forEach(s => {
      s.socket.join(code);
      io.to(s.id).emit('matched', { code, players: rooms[code].players });
    });
    io.to(code).emit('roomCreated', { code, players: rooms[code].players });
    // start countdown loop for this room
    startCountdown(code);
  }
}

function startCountdown(code) {
  const room = rooms[code];
  if (!room) return;
  const interval = setInterval(()=>{
    if (!rooms[code]) { clearInterval(interval); return; }
    room.countdown -= 1;
    io.to(code).emit('countdown', { countdown: room.countdown });
    // if all confirmed or countdown 0, start game (simulate start signal)
    const allConfirmed = room.players.length > 0 && room.players.every(p => p.confirmed);
    if (allConfirmed || room.countdown <= 0) {
      clearInterval(interval);
      room.started = true;
      io.to(code).emit('gameStarting', { code });
      // Optionally simulate match result or just mark started
      // Here we will simulate result after 5 seconds
      setTimeout(()=>{
        // simulate simple team split and BP change
        const players = room.players;
        const teamA = players.filter((_,i)=>i%2===0);
        const teamB = players.filter((_,i)=>i%2===1);
        const scoreA = teamA.reduce((s,p)=>s + p.bp * (0.8 + Math.random()*0.8),0);
        const scoreB = teamB.reduce((s,p)=>s + p.bp * (0.8 + Math.random()*0.8),0);
        const winner = scoreA > scoreB ? 'A' : 'B';
        const changes = [];
        players.forEach((p, idx)=>{
          const isWinner = (winner === 'A' && idx%2===0) || (winner === 'B' && idx%2===1);
          const delta = isWinner ? 25 : -15;
          p.bp += delta;
          changes.push({ id: p.id, delta, newBP: p.bp });
        });
        io.to(code).emit('matchResult', { winner, players, changes });
      }, 5000);
    }
  }, 1000);
}

io.on('connection', socket => {
  console.log('conn', socket.id);
  socket.on('joinQueue', ({ name }) => {
    if (!name) name = 'Player';
    // avoid duplicate entries
    if (queue.find(q => q.id === socket.id)) return;
    queue.push({ id: socket.id, socket, name });
    socket.name = name;
    io.to(socket.id).emit('queued');
    tryMatch();
  });

  socket.on('leaveQueue', ()=>{
    queue = queue.filter(q => q.id !== socket.id);
    io.to(socket.id).emit('leftQueue');
  });

  socket.on('confirmJoined', ({ code })=>{
    const room = rooms[code];
    if (!room) return;
    const p = room.players.find(pp => pp.id === socket.id);
    if (p) {
      p.confirmed = true;
      io.to(code).emit('playersUpdate', room.players);
    }
  });

  socket.on('createRoomManual', ({ name })=>{
    // host manually creates a room and joins it immediately
    const code = genCode();
    rooms[code] = { players: [{ id: socket.id, name, bp:1000, confirmed:false }], host: socket.id, countdown:60, started:false };
    socket.join(code);
    io.to(socket.id).emit('roomCreated', { code, players: rooms[code].players });
    startCountdown(code);
  });

  socket.on('joinRoomManual', ({ code, name })=>{
    const room = rooms[code];
    if (!room) return socket.emit('joinError', 'Pokój nie istnieje');
    room.players.push({ id: socket.id, name, bp:1000, confirmed:false });
    socket.join(code);
    io.to(code).emit('playersUpdate', room.players);
  });

  socket.on('disconnect', ()=>{
    queue = queue.filter(q => q.id !== socket.id);
    // remove from rooms
    for (const code of Object.keys(rooms)) {
      const r = rooms[code];
      const idx = r.players.findIndex(p=>p.id === socket.id);
      if (idx !== -1) {
        r.players.splice(idx,1);
        io.to(code).emit('playersUpdate', r.players);
        if (r.players.length === 0) delete rooms[code];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
