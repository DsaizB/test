/* Tetris Implementation - Canvas based */

const BOARD_COLS = 10;
const BOARD_ROWS = 20;
const CELL_SIZE = 30; // matches canvas 300x600

const EMPTY = 0;
const PIECES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0],[1, 1, 1]],
  L: [[0, 0, 1],[1, 1, 1]],
  O: [[1, 1],[1, 1]],
  S: [[0, 1, 1],[1, 1, 0]],
  T: [[0, 1, 0],[1, 1, 1]],
  Z: [[1, 1, 0],[0, 1, 1]],
};
const PIECE_ORDER = Object.keys(PIECES);

const COLOR_MAP = {
  I: getCssVar('--I'),
  J: getCssVar('--J'),
  L: getCssVar('--L'),
  O: getCssVar('--O'),
  S: getCssVar('--S'),
  T: getCssVar('--T'),
  Z: getCssVar('--Z'),
  ghost: getCssVar('--ghost'),
};

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
}

function rotateMatrix(matrix, clockwise = true) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const out = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (clockwise) {
        out[c][rows - 1 - r] = matrix[r][c];
      } else {
        out[cols - 1 - c][r] = matrix[r][c];
      }
    }
  }
  return out;
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(EMPTY));
}

function randomBagGenerator() {
  let bag = [];
  const refill = () => {
    bag = [...PIECE_ORDER];
    // shuffle
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };
  refill();
  return () => {
    if (bag.length === 0) refill();
    return bag.pop();
  };
}

class Piece {
  constructor(type) {
    this.type = type; // 'I','J','L','O','S','T','Z'
    this.matrix = PIECES[type].map(row => [...row]);
    this.row = 0;
    this.col = Math.floor((BOARD_COLS - this.matrix[0].length) / 2);
    this.locked = false;
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('board');
    this.ctx = this.canvas.getContext('2d');
    this.nextCanvas = document.getElementById('next');
    this.nextCtx = this.nextCanvas.getContext('2d');
    this.holdCanvas = document.getElementById('hold');
    this.holdCtx = this.holdCanvas.getContext('2d');

    this.scoreEl = document.getElementById('score');
    this.levelEl = document.getElementById('level');
    this.linesEl = document.getElementById('lines');

    this.board = createEmptyBoard();
    this.randomPiece = randomBagGenerator();
    this.queue = [];
    this.fillQueue();

    this.active = new Piece(this.queue.shift());
    this.holdType = null;
    this.holdUsedThisTurn = false;

    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropCounter = 0;
    this.dropIntervalMs = this.getDropIntervalForLevel(this.level);

    this.lastTime = 0;
    this.isPaused = false;
    this.isGameOver = false;

    this.addEventListeners();
    this.updateUI();
    requestAnimationFrame((t) => this.loop(t));
  }

  getDropIntervalForLevel(level) {
    // Approximate NES speeds (lower is faster)
    const speeds = [1000, 800, 650, 500, 380, 300, 230, 180, 140, 110, 90, 75, 60, 50, 40];
    return speeds[Math.min(level - 1, speeds.length - 1)];
  }

  addEventListeners() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.getElementById('restart').addEventListener('click', () => this.restart());
    window.addEventListener('blur', () => { this.isPaused = true; });
  }

  onKeyDown(e) {
    if (this.isGameOver) {
      if (e.key.toLowerCase() === 'r') this.restart();
      return;
    }
    if (e.key.toLowerCase() === 'p') {
      this.isPaused = !this.isPaused;
      return;
    }
    if (this.isPaused) return;

    switch (e.key) {
      case 'ArrowLeft': this.tryMove(-1, 0); break;
      case 'ArrowRight': this.tryMove(1, 0); break;
      case 'ArrowDown': this.softDrop(); break;
      case 'ArrowUp':
      case 'x':
      case 'X': this.rotate(true); break;
      case 'z':
      case 'Z': this.rotate(false); break;
      case ' ': this.hardDrop(); break;
      case 'c':
      case 'C':
      case 'Shift': this.hold(); break;
      case 'r':
      case 'R': this.restart(); break;
      default: break;
    }
  }

  fillQueue() {
    while (this.queue.length < 5) {
      this.queue.push(this.randomPiece());
    }
  }

  updateUI() {
    this.scoreEl.textContent = String(this.score);
    this.levelEl.textContent = String(this.level);
    this.linesEl.textContent = String(this.lines);
    this.drawNext();
    this.drawHold();
  }

  loop(timestamp) {
    const delta = timestamp - this.lastTime;
    this.lastTime = timestamp;

    if (!this.isPaused && !this.isGameOver) {
      this.dropCounter += delta;
      if (this.dropCounter >= this.dropIntervalMs) {
        this.dropCounter = 0;
        this.stepDown();
      }
      this.draw();
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  tryMove(dx, dy) {
    const { row, col, matrix } = this.active;
    if (this.isValidPosition(matrix, row + dy, col + dx)) {
      this.active.row += dy;
      this.active.col += dx;
      return true;
    }
    return false;
  }

  rotate(clockwise) {
    const rotated = rotateMatrix(this.active.matrix, clockwise);
    const kicks = [
      { r: 0, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }, { r: -1, c: 0 }, { r: 1, c: 0 }
    ];
    for (const k of kicks) {
      if (this.isValidPosition(rotated, this.active.row + k.r, this.active.col + k.c)) {
        this.active.matrix = rotated;
        this.active.row += k.r;
        this.active.col += k.c;
        return true;
      }
    }
    return false;
  }

  softDrop() {
    if (this.tryMove(0, 1)) {
      this.score += 1; // soft drop point
      this.updateUI();
    }
  }

  hardDrop() {
    let distance = 0;
    while (this.tryMove(0, 1)) distance++;
    this.score += distance * 2; // hard drop points
    this.lockPiece();
    this.updateUI();
  }

  stepDown() {
    if (!this.tryMove(0, 1)) {
      this.lockPiece();
    }
  }

  isValidPosition(matrix, targetRow, targetCol) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[0].length; c++) {
        if (!matrix[r][c]) continue;
        const br = targetRow + r;
        const bc = targetCol + c;
        if (bc < 0 || bc >= BOARD_COLS || br >= BOARD_ROWS) return false;
        if (br >= 0 && this.board[br][bc] !== EMPTY) return false;
      }
    }
    return true;
  }

  lockPiece() {
    const { row, col, matrix, type } = this.active;
    // If piece is above the board when locking -> game over
    let touchedTop = false;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[0].length; c++) {
        if (!matrix[r][c]) continue;
        const br = row + r;
        const bc = col + c;
        if (br < 0) touchedTop = true;
        if (br >= 0 && br < BOARD_ROWS && bc >= 0 && bc < BOARD_COLS) {
          this.board[br][bc] = type;
        }
      }
    }
    if (touchedTop) {
      this.gameOver();
      return;
    }
    const cleared = this.clearLines();
    if (cleared > 0) this.handleScoringForClears(cleared);

    this.spawnNext();
  }

  handleScoringForClears(linesCleared) {
    const linePoints = { 1: 100, 2: 300, 3: 500, 4: 800 };
    this.score += (linePoints[linesCleared] || 0) * this.level;
    this.lines += linesCleared;
    const newLevel = 1 + Math.floor(this.lines / 10);
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.dropIntervalMs = this.getDropIntervalForLevel(this.level);
    }
    this.updateUI();
  }

  spawnNext() {
    this.holdUsedThisTurn = false;
    this.fillQueue();
    this.active = new Piece(this.queue.shift());
    // spawn above the board to allow rotation room
    this.active.row = -2;
    this.active.col = Math.floor((BOARD_COLS - this.active.matrix[0].length) / 2);
    if (!this.isValidPosition(this.active.matrix, this.active.row, this.active.col)) {
      this.gameOver();
    }
  }

  clearLines() {
    let linesCleared = 0;
    outer: for (let r = BOARD_ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if (this.board[r][c] === EMPTY) {
          continue outer;
        }
      }
      // row full
      this.board.splice(r, 1);
      this.board.unshift(Array(BOARD_COLS).fill(EMPTY));
      linesCleared++;
      r++; // re-check same index after unshift
    }
    return linesCleared;
  }

  hold() {
    if (this.holdUsedThisTurn) return;
    const currentType = this.active.type;
    if (this.holdType === null) {
      this.holdType = currentType;
      this.spawnNext();
    } else {
      const temp = this.holdType;
      this.holdType = currentType;
      this.active = new Piece(temp);
      this.active.row = -2;
      this.active.col = Math.floor((BOARD_COLS - this.active.matrix[0].length) / 2);
      if (!this.isValidPosition(this.active.matrix, this.active.row, this.active.col)) {
        this.gameOver();
        return;
      }
    }
    this.holdUsedThisTurn = true;
    this.updateUI();
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // draw board
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const cell = this.board[r][c];
        if (cell !== EMPTY) {
          this.drawCell(c, r, COLOR_MAP[cell]);
        } else {
          this.drawEmpty(c, r);
        }
      }
    }

    // draw ghost
    const ghostRow = this.getGhostRow();
    this.drawMatrix(this.active.matrix, ghostRow, this.active.col, COLOR_MAP.ghost, true);

    // draw active
    this.drawMatrix(this.active.matrix, this.active.row, this.active.col, COLOR_MAP[this.active.type]);
  }

  drawCell(c, r, color, ghost = false) {
    const x = c * CELL_SIZE;
    const y = r * CELL_SIZE;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

    // grid overlay and bevel
    if (!ghost) {
      this.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this.ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, 6);
    }
  }

  drawEmpty(c, r) {
    const x = c * CELL_SIZE;
    const y = r * CELL_SIZE;
    this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
  }

  drawMatrix(matrix, row, col, color, ghost = false) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[0].length; c++) {
        if (!matrix[r][c]) continue;
        const br = row + r;
        const bc = col + c;
        if (br < 0) continue; // skip above board
        this.drawCell(bc, br, color, ghost);
      }
    }
  }

  getGhostRow() {
    const { matrix, row, col } = this.active;
    let testRow = row;
    while (this.isValidPosition(matrix, testRow + 1, col)) {
      testRow++;
    }
    return testRow;
  }

  drawNext() {
    const ctx = this.nextCtx;
    ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const previewSize = 24;
    let yOffset = 6;

    for (let i = 0; i < Math.min(3, this.queue.length); i++) {
      const type = this.queue[i];
      const matrix = PIECES[type];
      const color = COLOR_MAP[type];
      const width = matrix[0].length * previewSize;
      const height = matrix.length * previewSize;
      const x = Math.floor((this.nextCanvas.width - width) / 2);
      const y = yOffset;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[0].length; c++) {
          if (!matrix[r][c]) continue;
          ctx.fillStyle = color;
          ctx.fillRect(x + c * previewSize, y + r * previewSize, previewSize, previewSize);
        }
      }
      yOffset += height + 8;
    }
  }

  drawHold() {
    const ctx = this.holdCtx;
    ctx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
    if (!this.holdType) return;
    const matrix = PIECES[this.holdType];
    const color = COLOR_MAP[this.holdType];
    const previewSize = 24;
    const width = matrix[0].length * previewSize;
    const height = matrix.length * previewSize;
    const x = Math.floor((this.holdCanvas.width - width) / 2);
    const y = Math.floor((this.holdCanvas.height - height) / 2);
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[0].length; c++) {
        if (!matrix[r][c]) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + c * previewSize, y + r * previewSize, previewSize, previewSize);
      }
    }
  }

  gameOver() {
    this.isGameOver = true;
    this.isPaused = true;
    this.draw();
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 28px system-ui, Segoe UI, Roboto, Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Game Over', this.canvas.width / 2, this.canvas.height / 2 - 10);
    this.ctx.font = '16px system-ui, Segoe UI, Roboto, Arial';
    this.ctx.fillText('Press R to Restart', this.canvas.width / 2, this.canvas.height / 2 + 18);
  }

  restart() {
    this.board = createEmptyBoard();
    this.queue = [];
    this.fillQueue();
    this.active = new Piece(this.queue.shift());
    this.holdType = null;
    this.holdUsedThisTurn = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropIntervalMs = this.getDropIntervalForLevel(this.level);
    this.isGameOver = false;
    this.isPaused = false;
    this.updateUI();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Recompute color map after DOM is ready to pick up CSS vars
  COLOR_MAP.I = getCssVar('--I');
  COLOR_MAP.J = getCssVar('--J');
  COLOR_MAP.L = getCssVar('--L');
  COLOR_MAP.O = getCssVar('--O');
  COLOR_MAP.S = getCssVar('--S');
  COLOR_MAP.T = getCssVar('--T');
  COLOR_MAP.Z = getCssVar('--Z');
  COLOR_MAP.ghost = getCssVar('--ghost');

  new Game();
});