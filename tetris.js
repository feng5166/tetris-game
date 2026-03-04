// ─── Constants ───────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const BLOCK = 30; // px per cell

const COLORS = [
  null,
  '#00d4ff', // I - cyan
  '#f59e0b', // O - amber
  '#a855f7', // T - purple
  '#22c55e', // S - green
  '#ef4444', // Z - red
  '#3b82f6', // J - blue
  '#f97316', // L - orange
];

// Tetromino shapes: each piece is an array of rotations, each rotation is a 2D matrix
const TETROMINOES = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[0,0,0,0],[0,2,2,0],[0,2,2,0],[0,0,0,0]],
  ],
  T: [
    [[0,0,0],[3,3,3],[0,3,0]],
    [[0,3,0],[3,3,0],[0,3,0]],
    [[0,3,0],[3,3,3],[0,0,0]],
    [[0,3,0],[0,3,3],[0,3,0]],
  ],
  S: [
    [[0,0,0],[0,4,4],[4,4,0]],
    [[0,4,0],[0,4,4],[0,0,4]],
    [[0,0,0],[0,4,4],[4,4,0]],
    [[0,4,0],[0,4,4],[0,0,4]],
  ],
  Z: [
    [[0,0,0],[5,5,0],[0,5,5]],
    [[0,0,5],[0,5,5],[0,5,0]],
    [[0,0,0],[5,5,0],[0,5,5]],
    [[0,0,5],[0,5,5],[0,5,0]],
  ],
  J: [
    [[0,0,0],[6,6,6],[0,0,6]],
    [[0,6,0],[0,6,0],[6,6,0]],
    [[6,0,0],[6,6,6],[0,0,0]],
    [[0,6,6],[0,6,0],[0,6,0]],
  ],
  L: [
    [[0,0,0],[7,7,7],[7,0,0]],
    [[7,7,0],[0,7,0],[0,7,0]],
    [[0,0,7],[7,7,7],[0,0,0]],
    [[0,7,0],[0,7,0],[0,7,7]],
  ],
};

const PIECE_KEYS = Object.keys(TETROMINOES);

// Score table for lines cleared at once
const LINE_SCORES = [0, 100, 300, 500, 800];

// ─── Canvas Setup ────────────────────────────────────────────────────────────
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');

// ─── Game State ──────────────────────────────────────────────────────────────
let board, piece, nextPiece;
let score, level, lines;
let gameRunning, gamePaused, gameOver;
let dropInterval, lastTime, dropCounter;
let animFrameId;

// ─── DOM ─────────────────────────────────────────────────────────────────────
const scoreEl   = document.getElementById('score');
const levelEl   = document.getElementById('level');
const linesEl   = document.getElementById('lines');
const startBtn  = document.getElementById('startBtn');
const overlay   = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayScore = document.getElementById('overlayScore');
const overlayBtn   = document.getElementById('overlayBtn');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const key = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
  return {
    key,
    rotIdx: 0,
    matrix: TETROMINOES[key][0],
    x: Math.floor(COLS / 2) - Math.floor(TETROMINOES[key][0][0].length / 2),
    y: 0,
  };
}

function getMatrix(key, rotIdx) {
  const rots = TETROMINOES[key];
  return rots[rotIdx % rots.length];
}

// ─── Collision ───────────────────────────────────────────────────────────────
function isValid(matrix, offsetX, offsetY) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const nx = offsetX + c;
      const ny = offsetY + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

// ─── Lock & Clear ────────────────────────────────────────────────────────────
function lockPiece() {
  const { matrix, x, y } = piece;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const ny = y + r;
      const nx = x + c;
      if (ny < 0) {
        endGame();
        return;
      }
      board[ny][nx] = matrix[r][c];
    }
  }
  clearLines();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++; // re-check same index
    }
  }
  if (cleared > 0) {
    lines += cleared;
    score += LINE_SCORES[cleared] * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateUI();
  }
}

function updateUI() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = lines;
}

// ─── Piece Spawn ─────────────────────────────────────────────────────────────
function spawnPiece() {
  piece = {
    key: nextPiece.key,
    rotIdx: nextPiece.rotIdx,
    matrix: nextPiece.matrix,
    x: Math.floor(COLS / 2) - Math.floor(nextPiece.matrix[0].length / 2),
    y: 0,
  };
  nextPiece = randomPiece();
  drawNext();

  if (!isValid(piece.matrix, piece.x, piece.y)) {
    endGame();
  }
}

// ─── Ghost Piece ─────────────────────────────────────────────────────────────
function getGhostY() {
  let gy = piece.y;
  while (isValid(piece.matrix, piece.x, gy + 1)) gy++;
  return gy;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawBlock(context, x, y, colorIdx, alpha = 1) {
  const color = COLORS[colorIdx];
  context.globalAlpha = alpha;
  // Fill
  context.fillStyle = color;
  context.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, BLOCK - 2);
  // Highlight (top-left)
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, 4);
  context.fillRect(x * BLOCK + 1, y * BLOCK + 1, 4, BLOCK - 2);
  // Shadow (bottom-right)
  context.fillStyle = 'rgba(0,0,0,0.3)';
  context.fillRect(x * BLOCK + 1, y * BLOCK + BLOCK - 5, BLOCK - 2, 4);
  context.fillRect(x * BLOCK + BLOCK - 5, y * BLOCK + 1, 4, BLOCK - 2);
  context.globalAlpha = 1;
}

function drawBoard() {
  // Background
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }

  // Locked cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawBlock(ctx, c, r, board[r][c]);
    }
  }
}

function drawPiece() {
  if (!piece) return;

  // Ghost
  const gy = getGhostY();
  if (gy !== piece.y) {
    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[r].length; c++) {
        if (!piece.matrix[r][c]) continue;
        drawBlock(ctx, piece.x + c, gy + r, piece.matrix[r][c], 0.18);
      }
    }
  }

  // Active piece
  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (!piece.matrix[r][c]) continue;
      drawBlock(ctx, piece.x + c, piece.y + r, piece.matrix[r][c]);
    }
  }
}

function drawNext() {
  nctx.fillStyle = '#0a0a14';
  nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;
  const m = nextPiece.matrix;
  const rows = m.length;
  const cols = m[0].length;
  const offsetX = Math.floor((4 - cols) / 2);
  const offsetY = Math.floor((4 - rows) / 2);
  const cellSize = 24;
  nctx.save();
  nctx.translate(
    (nextCanvas.width - cols * cellSize) / 2,
    (nextCanvas.height - rows * cellSize) / 2
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!m[r][c]) continue;
      const color = COLORS[m[r][c]];
      nctx.globalAlpha = 1;
      nctx.fillStyle = color;
      nctx.fillRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
      nctx.fillStyle = 'rgba(255,255,255,0.25)';
      nctx.fillRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, 4);
      nctx.fillRect(c * cellSize + 1, r * cellSize + 1, 4, cellSize - 2);
    }
  }
  nctx.restore();
}

// ─── Game Loop ───────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!gameRunning || gamePaused) return;

  const delta = timestamp - lastTime;
  lastTime = timestamp;
  dropCounter += delta;

  if (dropCounter >= dropInterval) {
    moveDown();
    dropCounter = 0;
  }

  drawBoard();
  drawPiece();
  animFrameId = requestAnimationFrame(gameLoop);
}

// ─── Movement ────────────────────────────────────────────────────────────────
function moveLeft() {
  if (isValid(piece.matrix, piece.x - 1, piece.y)) piece.x--;
}

function moveRight() {
  if (isValid(piece.matrix, piece.x + 1, piece.y)) piece.x++;
}

function moveDown() {
  if (isValid(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
  } else {
    lockPiece();
  }
}

function rotate() {
  const nextRotIdx = (piece.rotIdx + 1) % TETROMINOES[piece.key].length;
  const nextMatrix = getMatrix(piece.key, nextRotIdx);

  // Wall kick: try offsets [0, -1, 1, -2, 2]
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (isValid(nextMatrix, piece.x + kick, piece.y)) {
      piece.x += kick;
      piece.rotIdx = nextRotIdx;
      piece.matrix = nextMatrix;
      return;
    }
  }
}

function hardDrop() {
  piece.y = getGhostY();
  lockPiece();
  dropCounter = 0;
}

// ─── Game Control ─────────────────────────────────────────────────────────────
function startGame() {
  board = createBoard();
  score = 0;
  level = 1;
  lines = 0;
  dropInterval = 1000;
  dropCounter = 0;
  lastTime = performance.now();
  gameRunning = true;
  gamePaused = false;
  gameOver = false;

  updateUI();
  nextPiece = randomPiece();
  spawnPiece();

  overlay.classList.add('hidden');
  startBtn.textContent = '重新开始';

  cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (!gameRunning || gameOver) return;
  gamePaused = !gamePaused;
  if (!gamePaused) {
    lastTime = performance.now();
    animFrameId = requestAnimationFrame(gameLoop);
  } else {
    // Draw "paused" over the board
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂停', boardCanvas.width / 2, boardCanvas.height / 2);
  }
}

function endGame() {
  gameRunning = false;
  gameOver = true;
  cancelAnimationFrame(animFrameId);
  overlayTitle.textContent = '游戏结束';
  overlayScore.textContent = `得分：${score}　等级：${level}　行数：${lines}`;
  overlayBtn.textContent = '再来一局';
  overlay.classList.remove('hidden');
}

// ─── Input ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!gameRunning || gamePaused) {
    if (e.key === 'p' || e.key === 'P') togglePause();
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      moveLeft();
      break;
    case 'ArrowRight':
      e.preventDefault();
      moveRight();
      break;
    case 'ArrowDown':
      e.preventDefault();
      moveDown();
      dropCounter = 0;
      break;
    case 'ArrowUp':
      e.preventDefault();
      rotate();
      break;
    case ' ':
      e.preventDefault();
      hardDrop();
      break;
    case 'p':
    case 'P':
      togglePause();
      break;
  }
  // Redraw immediately for responsiveness
  if (gameRunning && !gamePaused) {
    drawBoard();
    drawPiece();
  }
});

// ─── Buttons ─────────────────────────────────────────────────────────────────
startBtn.addEventListener('click', startGame);
overlayBtn.addEventListener('click', startGame);

// ─── Initial Render ──────────────────────────────────────────────────────────
(function init() {
  board = createBoard();
  drawBoard();
  overlayTitle.textContent = '俄罗斯方块';
  overlayScore.textContent = '准备好了吗？';
  overlayBtn.textContent = '开始游戏';
})();
