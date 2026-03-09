/**
 * @fileoverview Engine interface contract.
 *
 * Every game engine (chess, custom board game, etc.) must expose this interface.
 * To swap the game, create a new engine file implementing this shape and change
 * the single import in src/game/gameContext.jsx.
 */

/**
 * @typedef {Object} MoveResult
 * @property {boolean} success - Whether the move was legal and applied.
 * @property {string|null} promotion - Piece type if promotion is needed ('q','r','b','n') or null.
 * @property {boolean} promotionRequired - True when the move needs a promotion choice.
 */

/**
 * @typedef {Object} BoardState
 * @property {string} fen - FEN string representing the position.
 * @property {string} turn - 'w' or 'b'.
 * @property {boolean} inCheck - Whether the side to move is in check.
 */

/**
 * @typedef {'playing'|'checkmate'|'stalemate'|'draw'|'resigned'} GameStatus
 */

/**
 * Engine interface — every engine must implement these methods.
 *
 * @typedef {Object} GameEngine
 * @property {function(string): string[]} getLegalMoves
 *   Returns an array of target squares that the piece on `square` can legally move to.
 * @property {function(string, string, string=): MoveResult} applyMove
 *   Attempts to apply a move from `from` to `to`, with optional `promotion` piece type.
 *   Returns a MoveResult indicating success or whether promotion is required.
 * @property {function(): BoardState} getBoardState
 *   Returns the current board state.
 * @property {function(): GameStatus} getStatus
 *   Returns the current game status.
 * @property {function(): string[]} getHistory
 *   Returns the move history as an array of SAN strings.
 * @property {function(string): void} resign
 *   Marks the given color ('w' or 'b') as having resigned.
 * @property {function(): void} reset
 *   Resets the engine to the starting position.
 */
