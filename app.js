/* ===== Configuración ===== */
const CONFIG = {
  // Servidores STUN gratuitos. Si alguna red no conecta, agrega un servidor TURN aquí:
  // { urls: 'turn:tu-servidor:3478', username: 'usuario', credential: 'clave' }
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  bitrates: { 1080: 6000000, 720: 3500000, 480: 1500000 }
};

const $ = id => document.getElementById(id);
const show = id => ['home', 'hostView', 'guestView'].forEach(s => $(s).classList.toggle('hidden', s !== id));
const setText = (id, html) => { $(id).innerHTML = html; };

let peer = null, stream = null, wakeLock = null, fileUrl = null;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const conns = new Map();   // anfitrión: espectadores conectados
const calls = new Map();   // anfitrión: llamadas activas por espectador

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (stream || !$('guestView').classList.contains('hidden'))) keepAwake();
});

function newCode() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = 'cine-';
  for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/* ===== Anfitrión ===== */
function createRoom(retry = 0) {
  show('hostView');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    $('btnShare').disabled = true;
    setText('hostStatus', 'Este dispositivo no puede compartir pantalla. Usa un computador (Chrome, Edge o Firefox).');
  }
  const code = newCode();
  peer = new Peer(code, { config: { iceServers: CONFIG.iceServers } });

  peer.on('open', id => {
    $('myCode').textContent = id;
    setText('hostStatus', 'Sala lista. Esperando a que entre la otra persona.');
  });
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && retry < 5) { peer.destroy(); createRoom(retry + 1); return; }
    if (e.type === 'network' || e.type === 'server-error') { setText('hostStatus', 'Sin conexión con el servidor. Reintentando…'); return; }
    setText('hostStatus', 'Error: ' + e.type + '. Recarga la página para crear otra sala.');
  });
  peer.on('connection', conn => {
    conn.on('open', () => {
      // Solo una persona a la vez: si entra otra, reemplaza a la anterior.
      conns.forEach((c, id) => { if (id !== conn.peer) { c.close(); conns.delete(id); } });
      conns.set(conn.peer, conn);
      refreshHostStatus();
      if (stream) callGuest(conn.peer);
    });
    conn.on('close', () => {
      conns.delete(conn.peer);
      const c = calls.get(conn.peer); if (c) c.close();
      calls.delete(conn.peer);
      refreshHostStatus();
    });
  });
}

function refreshHostStatus() {
  if (!conns.size) { setText('hostStatus', stream ? '<b>Transmitiendo.</b> Esperando a que entre la otra persona.' + (fileUrl ? ' Usa los controles del reproductor.' : '') : 'Sala lista. Esperando a que entre la otra persona.'); return; }
  setText('hostStatus', stream ? '<b>Transmitiendo.</b> La otra persona está viendo' + (fileUrl ? ' tu archivo. Usa los controles del reproductor.' : ' tu pantalla.') : '<b>La otra persona entró.</b> Pulsa «Compartir pantalla» o «Reproducir un archivo».');
}

function callGuest(id) {
  const old = calls.get(id); if (old) old.close();
  const call = peer.call(id, stream);
  calls.set(id, call);
  call.on('close', () => { if (calls.get(id) === call) calls.delete(id); });
  [800, 2500].forEach(ms => setTimeout(() => tuneSender(call), ms));
}

function tuneSender(call) {
  const pc = call.peerConnection; if (!pc) return;
  const fps = parseInt($('fps').value, 10);
  const bitrate = (CONFIG.bitrates[$('quality').value] || 3500000) * (fps > 30 ? 1.5 : 1);
  pc.getSenders().forEach(s => {
    if (!s.track || s.track.kind !== 'video') return;
    const p = s.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = bitrate;
    if (!fileUrl) p.encodings[0].maxFramerate = fps;
    p.degradationPreference = 'maintain-framerate';
    s.setParameters(p).catch(() => {});
  });
}

$('btnHost').onclick = () => createRoom();

async function copy(text, btn, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copiado'; }
  catch (e) { btn.textContent = 'Selecciona y copia a mano'; }
  setTimeout(() => { btn.textContent = label; }, 1800);
}
$('btnCopy').onclick = () => copy($('myCode').textContent, $('btnCopy'), 'Copiar código');
$('btnLink').onclick = () => copy(location.origin + location.pathname + '?sala=' + $('myCode').textContent, $('btnLink'), 'Copiar enlace');

$('btnShare').onclick = async () => {
  const h = parseInt($('quality').value, 10);
  const fps = parseInt($('fps').value, 10);
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: h * 16 / 9 }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
  } catch (e) {
    stream = null;
    setText('hostStatus', e.name === 'NotAllowedError' ? 'Cancelaste la selección. Pulsa «Compartir pantalla» para intentarlo de nuevo.' : 'No se pudo compartir: ' + e.message);
    return;
  }
  const pv = $('preview');
  pv.autoplay = true; pv.muted = true; pv.controls = false;
  pv.srcObject = stream;
  beginBroadcast(stream);
  if (!stream.getAudioTracks().length) {
    setText('hostStatus', $('hostStatus').innerHTML + ' <b>Sin audio:</b> deja de compartir y vuelve a elegir marcando «compartir audio».');
  }
};

function beginBroadcast(s) {
  const vt = s.getVideoTracks()[0];
  if (vt && 'contentHint' in vt) vt.contentHint = 'motion';
  if (!fileUrl && vt) vt.onended = () => stopShare();
  stream = s;
  $('btnShare').classList.add('hidden');
  $('btnFile').classList.add('hidden');
  $('btnStop').classList.remove('hidden');
  keepAwake();
  conns.forEach((c, id) => callGuest(id));
  refreshHostStatus();
}

function stopShare(silent) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  const pv = $('preview');
  pv.pause(); pv.srcObject = null; pv.removeAttribute('src'); pv.load();
  pv.controls = false; pv.muted = true; pv.autoplay = true;
  if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
  calls.forEach(c => c.close());
  calls.clear();
  $('btnStop').classList.add('hidden');
  $('btnShare').classList.remove('hidden');
  $('btnFile').classList.remove('hidden');
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (silent !== true) setText('hostStatus', 'Dejaste de transmitir. Elige pantalla o archivo para volver a empezar.');
}
$('btnStop').onclick = () => stopShare();

/* ----- Archivo local ----- */
$('btnFile').onclick = () => $('fileIn').click();
$('fileIn').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  stopShare(true);
  const v = $('preview');
  fileUrl = URL.createObjectURL(f);
  v.autoplay = false; v.muted = false; v.controls = true; v.srcObject = null; v.src = fileUrl;
  setText('hostStatus', 'Cargando «' + esc(f.name) + '»…');
  const fail = msg => { stopShare(true); setText('hostStatus', msg); };
  try {
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('formato no compatible')); });
  } catch (err) { fail('No se pudo abrir ese archivo (' + err.message + '). Prueba con MP4 (H.264) o WebM.'); return; }
  const cap = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
  if (!cap) { fail('Este navegador no permite transmitir archivos. Usa Chrome o Edge.'); return; }
  if (!cap.getVideoTracks().length) {
    await new Promise(ok => { cap.onaddtrack = ok; setTimeout(ok, 3000); });
  }
  if (!cap.getVideoTracks().length) { fail('No pude leer el video de ese archivo. Prueba con otro MP4 o usa Chrome o Edge.'); return; }
  beginBroadcast(cap);
  setText('hostStatus', $('hostStatus').innerHTML + ' Cuando la otra persona esté lista, pulsa play.');
};


/* ===== Espectador ===== */
function join(code) {
  code = (code || $('codeIn').value).trim().toLowerCase();
  if (!code) { $('codeIn').focus(); return; }
  show('guestView');
  keepAwake();
  peer = new Peer({ config: { iceServers: CONFIG.iceServers } });
  let retryTimer = null;

  const connect = () => {
    if (peer.destroyed) return;
    setText('guestStatus', 'Buscando la sala…');
    const conn = peer.connect(code, { reliable: true });
    conn.on('open', () => setText('guestStatus', 'Conectado. Esperando que empiece la transmisión…'));
    conn.on('close', () => { setText('guestStatus', 'Se perdió la conexión. Reintentando…'); clearTimeout(retryTimer); retryTimer = setTimeout(connect, 2500); });
  };

  peer.on('open', connect);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') {
      setText('guestStatus', 'No encuentro esa sala. Revisa el código; sigo intentando…');
      clearTimeout(retryTimer); retryTimer = setTimeout(connect, 3000);
    } else if (e.type !== 'disconnected') {
      setText('guestStatus', 'Error: ' + e.type);
    }
  });
  peer.on('call', call => {
    call.answer();
    call.on('stream', s => attach(s));
    call.on('close', () => setText('guestStatus', 'La transmisión terminó. Esperando a que vuelva a empezar…'));
  });
}

function attach(s) {
  const v = $('remote');
  v.srcObject = s;
  v.muted = false;
  $('btnUnmute').classList.add('hidden');
  v.play().catch(() => {
    v.muted = true;                      // el navegador exige un gesto para el sonido
    v.play().catch(() => {});
    $('btnUnmute').classList.remove('hidden');
  });
  setText('guestStatus', '<b>Viendo en directo.</b>');
}

$('btnUnmute').onclick = () => { $('remote').muted = false; $('remote').play(); $('btnUnmute').classList.add('hidden'); };
$('btnJoin').onclick = () => join();
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
$('btnFull').onclick = () => { const v = $('remote'); (v.requestFullscreen || v.webkitRequestFullscreen || v.webkitEnterFullscreen).call(v); };
$('btnLeave').onclick = () => location.href = location.pathname;

// Enlace directo: ?sala=cine-xxxxx
const roomParam = new URLSearchParams(location.search).get('sala');
if (roomParam) { $('codeIn').value = roomParam; join(roomParam); }
