'use client';
import { Gamepad2, RotateCcw, X } from 'lucide-react';
import type { Game, Profile, Conversation, GameKind } from '@/lib/domain';
export function GamePanel({
  game,
  profile,
  chat,
  onStart,
  onMove,
  onClose,
}: {
  game: Game | null;
  profile: Profile;
  chat: Conversation;
  onStart: (kind: GameKind) => void;
  onMove: (cell: number) => Promise<void>;
  onClose: () => void;
}) {
  const name = (id: string) =>
    id === profile.id
      ? 'You'
      : (chat.peers.find((p) => p.id === id)?.username ?? 'Your partner');
  return (
    <section className="game-panel" aria-label="Play a game">
      <div className="game-panel-title">
        <span>
          <Gamepad2 size={18} />
          {game
            ? game.kind === 'tic-tac-toe'
              ? 'Tic-tac-toe'
              : 'Connect Four'
            : 'A little friendly competition'}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close game"
        >
          <X size={18} />
        </button>
      </div>
      {!game ? (
        <div className="game-choices">
          <button onClick={() => onStart('tic-tac-toe')}>
            <span>× ○</span>Tic-tac-toe
          </button>
          <button onClick={() => onStart('connect-four')}>
            <span>● ●</span>Connect Four
          </button>
        </div>
      ) : (
        <>
          <p className="game-turn" aria-live="polite">
            {game.winner
              ? game.winner === 'draw'
                ? 'A draw. One more round?'
                : `${name(game.winner)} ${game.winner === profile.id ? 'win' : 'wins'}!`
              : game.turn === profile.id
                ? 'Your turn. Make it count.'
                : `${name(game.turn)}’s turn`}
          </p>
          <div className={`game-board ${game.kind}`}>
            {game.board.map((value, index) => (
              <button
                key={index}
                disabled={
                  !!game.winner ||
                  game.turn !== profile.id ||
                  chat.endedAt !== null ||
                  (game.kind === 'tic-tac-toe' && !!value)
                }
                aria-label={
                  game.kind === 'tic-tac-toe'
                    ? `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}${value ? `, ${name(value)}` : ''}`
                    : `Drop in column ${(index % 7) + 1}, row ${Math.floor(index / 7) + 1}`
                }
                className={
                  value
                    ? value === game.players[0]
                      ? 'player-one'
                      : 'player-two'
                    : ''
                }
                onClick={() =>
                  void onMove(game.kind === 'tic-tac-toe' ? index : index % 7)
                }
              >
                {game.kind === 'tic-tac-toe'
                  ? value === game.players[0]
                    ? '×'
                    : value
                      ? '○'
                      : ''
                  : value
                    ? '●'
                    : ''}
              </button>
            ))}
          </div>
          <div className="game-player-legend">
            <span>
              <i className="player-one" />
              {name(game.players[0])}
            </span>
            <span>
              <i className="player-two" />
              {name(game.players[1])}
            </span>
          </div>
          {game.winner && (
            <button
              className="button button-small button-outline"
              onClick={() => onStart(game.kind)}
            >
              <RotateCcw size={15} />
              Rematch
            </button>
          )}
        </>
      )}
    </section>
  );
}
