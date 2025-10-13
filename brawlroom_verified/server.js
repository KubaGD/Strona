const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const upload = multer({ dest: 'uploads/' });

let queue = []; // sockets waiting to be matched
const rooms = {}; // rooms by code

function genPrivateCode() {
  return Math.floor(10000 + Math.random()*90000).toString();
}

function tryMatch() {
  while (queue.length >= 6) {
    const players = queue.splice(0,6);
    const code = genPrivateCode();
    rooms[code] = {
      players: players.map(s => ({ id: s.id, name: s.name, bp: 1000, confirmed: false, proof: null })),
      host: players[0].id,
      hostCode: null, // host will paste real game code here
      countdown: 60,
      started: false
    };
    // join sockets to room and notify each player individually
    players.forEach(s => {
      s.socket.join(code);
      io.to(s.id).emit('matched', { code, players: rooms[code].players });
    });
    io.to(code).emit('roomCreated', { code, players: rooms[code].players });
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
    const allConfirmed = room.players.length > 0 && room.players.every(p => p.confirmed);
    if (allConfirmed || room.countdown <= 0) {
      clearInterval(interval);
      room.started = true;
      io.to(code).emit('gameStarting', { code });
      // in this verified flow we DON'T auto-start the in-game match; we only notify server/clients
    }
  }, 1000);
}

io.on('connection', socket => {
  console.log('conn', socket.id);
  socket.on('joinQueue', ({ name }) => {
    if (!name) name = 'Player';
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

  // Host can paste a REAL game code into room
  socket.on('setHostCode', ({ code, hostCode })=>{
    const room = rooms[code];
    if (!room) return;
    room.hostCode = hostCode;
    io.to(code).emit('hostCodeSet', { hostCode });
  });

  // Players upload proof (screenshot) via REST endpoint; they send filename to server via socket to attach proof
  socket.on('attachProof', ({ code, filename })=>{
    const room = rooms[code];
    if (!room) return;
    const p = room.players.find(pp => pp.id === socket.id);
    if (p) {
      p.proof = filename;
      io.to(code).emit('playersUpdate', room.players);
    }
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
    const code = genPrivateCode();
    rooms[code] = { players: [{ id: socket.id, name, bp:1000, confirmed:false, proof:null }], host: socket.id, hostCode: null, countdown:60, started:false };
    socket.join(code);
    io.to(socket.id).emit('roomCreated', { code, players: rooms[code].players });
    startCountdown(code);
  });

  socket.on('joinRoomManual', ({ code, name })=>{
    const room = rooms[code];
    if (!room) return socket.emit('joinError', 'Pokój nie istnieje');
    room.players.push({ id: socket.id, name, bp:1000, confirmed:false, proof:null });
    socket.join(code);
    io.to(code).emit('playersUpdate', room.players);
  });

  socket.on('disconnect', ()=>{
    queue = queue.filter(q => q.id !== socket.id);
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

// REST endpoint for uploading proof (screenshot)
// Uses multer for file uploads
const upload = multer({ dest: 'uploads/' });
app.post('/uploadProof', upload.single('proof'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  // return filename for client to attach via socket
  res.json({ filename: req.file.filename });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
