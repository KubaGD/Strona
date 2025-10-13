
// app.js for verified flow
const socket = io();
const nameInput = document.getElementById('name');
const joinQueueBtn = document.getElementById('joinQueue');
const leaveQueueBtn = document.getElementById('leaveQueue');
const createManualBtn = document.getElementById('createManual');
const hostCodeInput = document.getElementById('hostCodeInput');
const setHostCodeBtn = document.getElementById('setHostCode');
const proofFile = document.getElementById('proofFile');
const uploadProofBtn = document.getElementById('uploadProof');
const confirmBtn = document.getElementById('confirm');
const queueInfo = document.getElementById('queueInfo');
const roomInfo = document.getElementById('roomInfo');
const qrDiv = document.getElementById('qr');
const playersList = document.getElementById('playersList');
const countdownDiv = document.getElementById('countdown');
const resultDiv = document.getElementById('result');

let currentCode = null;

joinQueueBtn.addEventListener('click', ()=>{
  const name = nameInput.value.trim() || 'Player';
  socket.emit('joinQueue', { name });
  queueInfo.textContent = 'Dołączyłeś do kolejki...';
});
leaveQueueBtn.addEventListener('click', ()=>{ socket.emit('leaveQueue'); queueInfo.textContent=''; });
createManualBtn.addEventListener('click', ()=>{ const name = nameInput.value.trim()||'Host'; socket.emit('createRoomManual',{name}); });

setHostCodeBtn.addEventListener('click', ()=>{
  if (!currentCode) return alert('Nie jesteś w pokoju');
  const hostCode = hostCodeInput.value.trim();
  if (!hostCode) return alert('Wklej kod z Brawl Stars');
  socket.emit('setHostCode', { code: currentCode, hostCode });
});

uploadProofBtn.addEventListener('click', async ()=>{
  if (!proofFile.files[0]) return alert('Wybierz plik');
  if (!currentCode) return alert('Nie jesteś w pokoju');
  const fd = new FormData();
  fd.append('proof', proofFile.files[0]);
  const res = await fetch('/uploadProof', { method: 'POST', body: fd });
  const j = await res.json();
  if (j.filename) {
    socket.emit('attachProof', { code: currentCode, filename: j.filename });
    alert('Screenshot przesłany jako dowód');
  }
});

confirmBtn.addEventListener('click', ()=>{
  if (!currentCode) return alert('Nie jesteś w pokoju');
  socket.emit('confirmJoined', { code: currentCode });
  resultDiv.textContent = 'Potwierdzono dołączenie (lokalne)';
});

socket.on('queued', ()=>{ queueInfo.textContent = 'Jesteś w kolejce...'; });
socket.on('leftQueue', ()=>{ queueInfo.textContent = ''; });

socket.on('matched', ({ code, players })=>{ currentCode = code; roomInfo.textContent = `Znaleziono match - kod wew.: ${code}. Host wkleja teraz prawdziwy kod z gry.`; generateQR('-----'); renderPlayers(players); });

socket.on('roomCreated', ({ code, players })=>{ currentCode = code; roomInfo.textContent = `Pokój: ${code}`; renderPlayers(players); });

socket.on('hostCodeSet', ({ hostCode })=>{ roomInfo.textContent = `Host ustawił kod gry: ${hostCode}`; generateQR(hostCode); });

socket.on('playersUpdate', players=>{ renderPlayers(players); });
socket.on('countdown', ({ countdown })=>{ countdownDiv.textContent = `Czas na dołączenie: ${countdown}s`; });
socket.on('gameStarting', ({ code })=>{ resultDiv.textContent = 'Czas minął lub wszyscy potwierdzili — rozpocznijcie mecz w aplikacji'; });
socket.on('joinError', msg=> alert(msg));

function renderPlayers(players){ playersList.innerHTML=''; players.forEach((p,idx)=>{ const div=document.createElement('div'); div.className='playerCard'; div.setAttribute('data-id',p.id); div.innerHTML = `<div><strong>${escapeHtml(p.name)}</strong><div style="font-size:12px;color:var(--muted)">ID:${p.id.slice(0,6)}</div></div><div><div class="bp" style="font-family:monospace">${p.bp} BP</div>${p.proof?`<div style="font-size:12px;color:var(--muted);margin-top:6px"><a href="/uploads/${p.proof}" target="_blank">Zobacz screenshot</a></div>`:''}${p.confirmed?'<div style="color:var(--accent);font-weight:700;margin-top:6px">Potwierdzono</div>':''}</div>`; playersList.appendChild(div); }); }

function generateQR(code){ if(!code) { qrDiv.innerHTML=''; return; } const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(code)}`; qrDiv.innerHTML = `<img src="${qrUrl}" alt="QR kod" />`; }

function escapeHtml(text){ const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}; return String(text).replace(/[&<>\"]/g,m=>map[m]); }

