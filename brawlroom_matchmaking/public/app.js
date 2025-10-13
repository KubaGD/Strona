
// app.js
const socket = io();
const nameInput = document.getElementById('name');
const joinQueueBtn = document.getElementById('joinQueue');
const leaveQueueBtn = document.getElementById('leaveQueue');
const createManualBtn = document.getElementById('createManual');
const codeInput = document.getElementById('codeInput');
const roomInfo = document.getElementById('roomInfo');
const qrDiv = document.getElementById('qr');
const playersList = document.getElementById('playersList');
const startBtn = document.getElementById('start');
const confirmBtn = document.getElementById('confirm');
const resultDiv = document.getElementById('result');
const queueInfo = document.getElementById('queueInfo');
const countdownDiv = document.getElementById('countdown');

let currentCode = null;

joinQueueBtn.addEventListener('click', ()=>{
  const name = nameInput.value.trim() || 'Player';
  socket.emit('joinQueue', { name });
  queueInfo.textContent = 'Dołączyłeś do kolejki. Czekamy na 6 graczy...';
});

leaveQueueBtn.addEventListener('click', ()=>{
  socket.emit('leaveQueue');
  queueInfo.textContent = '';
});

createManualBtn.addEventListener('click', ()=>{
  const name = nameInput.value.trim() || 'Host';
  socket.emit('createRoomManual', { name });
});

confirmBtn.addEventListener('click', ()=>{
  if (!currentCode) return alert('Nie jesteś w pokoju');
  socket.emit('confirmJoined', { code: currentCode });
  resultDiv.textContent = 'Potwierdzono dołączenie w aplikacji.';
});

socket.on('queued', ()=>{
  queueInfo.textContent = 'Jesteś w kolejce...';
});

socket.on('leftQueue', ()=>{
  queueInfo.textContent = '';
});

socket.on('matched', ({ code, players })=>{
  currentCode = code;
  roomInfo.textContent = `Znaleziono match! Kod pokoju: ${code}`;
  generateQR(code);
  renderPlayers(players);
});

socket.on('roomCreated', ({ code, players })=>{
  currentCode = code;
  roomInfo.textContent = `Pokój: ${code}. Gracze:`;
  generateQR(code);
  renderPlayers(players);
});

socket.on('playersUpdate', players=>{
  renderPlayers(players);
});

socket.on('countdown', ({ countdown })=>{
  countdownDiv.textContent = `Czas na dołączenie: ${countdown}s`;
});

socket.on('gameStarting', ({ code })=>{
  resultDiv.textContent = 'Rozpoczynamy mecz! (start w grze)';
});

socket.on('matchResult', ({ winner, players, changes })=>{
  resultDiv.textContent = `Wygrała drużyna ${winner}!`;
  renderPlayers(players, winner);
  changes.forEach(ch=>{
    const el = document.querySelector(`[data-id="${ch.id}"] .bp`);
    if (el) {
      el.textContent = ch.newBP;
      el.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 350 });
    }
  });
});

socket.on('joinError', msg=> alert(msg));

function renderPlayers(players, winner){
  playersList.innerHTML = '';
  players.forEach((p, idx)=>{
    const div = document.createElement('div');
    div.className = 'playerCard';
    div.setAttribute('data-id', p.id);
    if (winner) {
      const isWinner = (winner === 'A' && idx%2===0) || (winner==='B' && idx%2===1);
      if (isWinner) div.classList.add('win');
    }
    div.innerHTML = `<div><strong>${escapeHtml(p.name)}</strong> <div style="font-size:12px;color:var(--muted)">ID:${p.id.slice(0,6)}</div></div><div class="bp" style="font-family:monospace">${p.bp} BP</div>`;
    playersList.appendChild(div);
  });
}

function generateQR(code){
  const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(code)}`;
  qrDiv.innerHTML = `<img src="${qrUrl}" alt="QR kod" />`;
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>\"]/g, m => map[m]);
}

