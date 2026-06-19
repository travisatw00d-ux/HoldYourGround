class SpatialGrid {
  constructor(cellSize, worldW, worldH) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldW / cellSize) + 1;
    this.rows = Math.ceil(worldH / cellSize) + 1;
    this.count = this.cols * this.rows;
    this.zombieCells = new Array(this.count);
    this.playerCells = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.zombieCells[i] = [];
      this.playerCells[i] = [];
    }
    this.playerScratch = [];
    this.zombieScratch = [];
  }

  clear() {
    const zc = this.zombieCells, pc = this.playerCells, n = this.count;
    for (let i = 0; i < n; i++) { zc[i].length = 0; pc[i].length = 0; }
  }

  clearZombies() {
    const zc = this.zombieCells, n = this.count;
    for (let i = 0; i < n; i++) zc[i].length = 0;
  }

  insertZombie(z) {
    const c = this.cols, cs = this.cellSize, rows = this.rows;
    let cx = (z.x / cs) | 0; if (cx < 0) cx = 0; else if (cx >= c) cx = c - 1;
    let cy = (z.y / cs) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    this.zombieCells[cy * c + cx].push(z);
  }

  insertPlayer(p) {
    const c = this.cols, cs = this.cellSize, rows = this.rows;
    let cx = (p.x / cs) | 0; if (cx < 0) cx = 0; else if (cx >= c) cx = c - 1;
    let cy = (p.y / cs) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    this.playerCells[cy * c + cx].push(p);
  }

  _query(cells, x, y, result) {
    result.length = 0;
    const c = this.cols, cs = this.cellSize, rows = this.rows;
    let cx = (x / cs) | 0; if (cx < 0) cx = 0; else if (cx >= c) cx = c - 1;
    let cy = (y / cs) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    const x0 = cx - 1 < 0 ? 0 : cx - 1;
    const x1 = cx + 1 >= c ? c - 1 : cx + 1;
    const y0 = cy - 1 < 0 ? 0 : cy - 1;
    const y1 = cy + 1 >= rows ? rows - 1 : cy + 1;
    for (let yy = y0; yy <= y1; yy++) {
      const base = yy * c;
      for (let xx = x0; xx <= x1; xx++) {
        const cell = cells[base + xx];
        for (let i = 0, n = cell.length; i < n; i++) result.push(cell[i]);
      }
    }
    return result;
  }

  getNearbyZombies(x, y) { return this._query(this.zombieCells, x, y, this.zombieScratch); }
  getNearbyPlayers(x, y) { return this._query(this.playerCells, x, y, this.playerScratch); }
}

module.exports = SpatialGrid;
