var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

var VW = 800;
var VH = 600;
canvas.width = VW;
canvas.height = VH;

var socket = io();

var myId = null;
var worldW = 0;
var worldH = 0;
var players = {};
var zombies = [];
var screen = 'menu';
var backgroundCanvas = null;

var animFrame = null;
var inputInterval = null;

var hitFlash = 0;
var mouseX = 0;
var mouseY = 0;
var localAnim = null;
var debugHitbox = false;
var dmgNumbers = [];
var mergeSmokes = [];
var serverLevel = 0;

var bladeHistory = null;

var swordImg = new Image();
swordImg.src = '/images/woodensword.png';

var zombieHeadImg = new Image();
zombieHeadImg.src = '/images/zombiehead.png';

var zombieT2HeadImg = new Image();
zombieT2HeadImg.src = '/images/T2zombiehead.png';

var serverLevelImg = new Image();
serverLevelImg.src = '/images/ServerLevel.png';

var zombieLeftHandImg = new Image();
zombieLeftHandImg.src = '/images/zombielefthand.png';

var zombieRightHandImg = new Image();
zombieRightHandImg.src = '/images/zombierighthand.png';

var zombieT2LeftHandImg = new Image();
zombieT2LeftHandImg.src = '/images/T2zombielefthand.png';

var zombieT2RightHandImg = new Image();
zombieT2RightHandImg.src = '/images/T2zombierighthand.png';

var menu = document.getElementById('menu');
var eliminated = document.getElementById('eliminated');
var hud = document.getElementById('hud');
var lbEntries = document.getElementById('lbEntries');
var nameInput = document.getElementById('nameInput');
var joinBtn = document.getElementById('joinBtn');
var respawnBtn = document.getElementById('respawnBtn');
var elimKills = document.getElementById('elimKills');
var errorMsg = document.getElementById('errorMsg');
var hotbarEl = document.getElementById('hotbarInventory');

function generateBackground(w, h) {
  var bc = document.createElement('canvas');
  bc.width = w;
  bc.height = h;
  var bx = bc.getContext('2d');

  bx.fillStyle = '#ffffff';
  bx.fillRect(0, 0, w, h);

  bx.strokeStyle = 'rgba(0,0,0,0.06)';
  bx.lineWidth = 1;
  bx.beginPath();
  var gs = 80;
  for (var x = gs; x < w; x += gs) { bx.moveTo(x, 0); bx.lineTo(x, h); }
  for (var y = gs; y < h; y += gs) { bx.moveTo(0, y); bx.lineTo(w, y); }
  bx.stroke();

  bx.strokeStyle = 'rgba(0,0,0,0.25)';
  bx.lineWidth = 3;
  bx.strokeRect(1.5, 1.5, w - 3, h - 3);
  return bc;
}

function showScreen(id) {
  menu.classList.add('hidden');
  eliminated.classList.add('hidden');
  hud.classList.add('hidden');
  hotbarEl.classList.add('hidden');
  screen = id;
  if (id === 'menu') menu.classList.remove('hidden');
  if (id === 'eliminated') eliminated.classList.remove('hidden');
  if (id === 'playing') { hud.classList.remove('hidden'); hotbarEl.classList.remove('hidden'); }
}

function updateLeaderboard() {
  var sorted = Object.values(players).sort(function (a, b) { return b.kills - a.kills; });
  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    var cls = i === 0 ? 'lb-entry top' : 'lb-entry';
    html += '<div class="' + cls + '"><span>' + p.name + '</span><span class="lb-kills">' + p.kills + '</span></div>';
  }
  lbEntries.innerHTML = html;
}

function updateHotbar() {
  var me = players[myId];
  if (!me) { hotbarEl.innerHTML = ''; return; }
  var html = '';
  for (var i = 0; i < me.inventory.length; i++) {
    var itemKey = me.inventory[i];
    var item = window.ITEMS[itemKey];
    var active = itemKey === me.currentItem ? ' active' : '';
    html += '<div class="hot-slot' + active + '" data-slot="' + i + '"><span class="hot-key">' + (i + 1) + '</span><span class="hot-name">' + (item ? item.name : itemKey) + '</span></div>';
  }
  hotbarEl.innerHTML = html;
}

function startRender() {
  if (animFrame) return;
  if (inputInterval) clearInterval(inputInterval);
  inputInterval = setInterval(function () {
    if (screen === 'playing') {
      var input = getInput();
      var cam = getCamera();
      var me = players[myId];
      if (me) {
        input.angle = me.facingAngle || Math.atan2((mouseY + cam.y) - me.y, (mouseX + cam.x) - me.x);
      }
      socket.emit('input', input);
    }
  }, 50);

  function loop() {
    if (screen === 'playing') {
      render();
      animFrame = requestAnimationFrame(loop);
    }
  }
  loop();
}

function stopRender() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
}

showScreen('menu');

joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') joinGame();
});
respawnBtn.addEventListener('click', function () {
  socket.emit('respawn');
});

function joinGame() {
  var name = nameInput.value.trim() || 'Player';
  socket.emit('join', { name: name });
}
