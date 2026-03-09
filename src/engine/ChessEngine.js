import { Chess } from 'chess.js';

/**
 * Chess engine implementing the GameEngine interface.
 * Delegates all rule logic to chess.js.
 * Swap this file for a custom engine to replace chess with another board game.
 */
class ChessEngine {
  constructor() {
    this._chess = new Chess();
    this._resigned = null; // 'w' or 'b' if a player resigned
  }

  /** @param {string} square e.g. 'e2' */
  getLegalMoves(square) {
    return this._chess
      .moves({ square, verbose: true })
      .map((m) => m.to);
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {string} [promotion] - 'q' | 'r' | 'b' | 'n'
   * @returns {import('./engineInterface').MoveResult}
   */
  applyMove(from, to, promotion) {
    // Detect if this move would require promotion (pawn reaching back rank)
    if (!promotion) {
      const piece = this._chess.get(from);
      const isPromotion =
        piece &&
        piece.type === 'p' &&
        ((piece.color === 'w' && to[1] === '8') ||
          (piece.color === 'b' && to[1] === '1'));

      if (isPromotion) {
        return { success: false, promotionRequired: true, promotion: null };
      }
    }

    try {
      const move = this._chess.move({ from, to, promotion: promotion || undefined });
      if (!move) return { success: false, promotionRequired: false, promotion: null };
      return { success: true, promotionRequired: false, promotion: promotion || null };
    } catch {
      return { success: false, promotionRequired: false, promotion: null };
    }
  }

  /** @returns {import('./engineInterface').BoardState} */
  getBoardState() {
    return {
      fen: this._chess.fen(),
      turn: this._chess.turn(),
      inCheck: this._chess.inCheck(),
    };
  }

  /** @returns {import('./engineInterface').GameStatus} */
  getStatus() {
    if (this._resigned) return 'resigned';
    if (this._chess.isCheckmate()) return 'checkmate';
    if (this._chess.isStalemate()) return 'stalemate';
    if (this._chess.isDraw()) return 'draw';
    return 'playing';
  }

  /** @returns {string[]} SAN move list */
  getHistory() {
    return this._chess.history();
  }

  /** @param {'w'|'b'} color */
  resign(color) {
    this._resigned = color;
  }

  reset() {
    this._chess = new Chess();
    this._resigned = null;
  }
}

// Export as a singleton — one engine per app session.
export const engine = new ChessEngine();
