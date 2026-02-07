import { useMemo, useState } from "react";
import Board3D from "./components/Board3D";

const BOARD_SIZE = 4;
const TOTAL_SQUARES = BOARD_SIZE * BOARD_SIZE;
const STACK_COUNT = 3;
const STARTING_SIZES = [4, 3, 2, 1];
const WINNING_LINES = buildWinningLines();
const LINES_BY_SQUARE = buildLinesBySquare();

function App() {
  const [game, setGame] = useState(() => createInitialGame());

  const legalTargetSet = useMemo(() => {
    if (!game.selected) {
      return new Set();
    }
    return new Set(legalTargetsForSelection(game, game.selected));
  }, [game]);

  const turnText = useMemo(() => {
    if (game.gameOver?.type === "draw") {
      return "Draw";
    }
    if (game.gameOver?.type === "win") {
      return `${capitalize(game.gameOver.winner)} wins`;
    }
    return capitalize(game.turn);
  }, [game.gameOver, game.turn]);

  const reserveCounts = useMemo(
    () => ({
      white: game.reserves.white.reduce((sum, stack) => sum + stack.length, 0),
      black: game.reserves.black.reduce((sum, stack) => sum + stack.length, 0),
    }),
    [game.reserves]
  );

  const handleRestart = () => {
    setGame(createInitialGame());
  };

  const handleSquareClick = (squareIndex) => {
    setGame((current) => {
      if (current.gameOver) {
        return current;
      }

      if (!current.selected) {
        return selectBoardCup(current, squareIndex);
      }

      const legalTargets = legalTargetsForSelection(current, current.selected);
      if (!legalTargets.includes(squareIndex)) {
        return {
          ...current,
          status: "Illegal target for the selected cup.",
        };
      }

      return executeMove(current, squareIndex);
    });
  };

  const handleReserveClick = (color, reserveIndex) => {
    setGame((current) => selectReserveStack(current, color, reserveIndex));
  };

  return (
    <main className="app">
      <header className="header fade-in-1">
        <h1>Goblett</h1>
        <div className="header-status">
          <span className={`turn-dot ${game.turn}`} />
          <span className="turn-label">{turnText}</span>
        </div>
      </header>

      <div className="arena fade-in-2">
        <ReserveColumn
          color="white"
          game={game}
          onSelect={handleReserveClick}
        />

        <section className="board-stage">
          <div className="board-canvas" role="grid" aria-label="Goblett board">
            <Board3D
              board={game.board}
              legalTargetSet={legalTargetSet}
              selected={game.selected}
              onSquareClick={handleSquareClick}
            />
          </div>
        </section>

        <ReserveColumn
          color="black"
          game={game}
          onSelect={handleReserveClick}
        />
      </div>

      <footer className="footer fade-in-3">
        <p className="status-line">{game.status}</p>
        <button type="button" className="restart-btn" onClick={handleRestart}>
          {game.gameOver ? "Play again" : "Restart"}
        </button>
      </footer>
    </main>
  );
}

function ReserveColumn({ color, game, onSelect }) {
  return (
    <aside className={`reserve-col ${color}`} aria-label={`${color} reserves`}>
      <span className="reserve-label">{color}</span>
      <div className="reserve-stacks">
        {game.reserves[color].map((stack, index) => {
          const nextSize = stack[0];
          const isActive =
            game.selected?.type === "reserve" &&
            game.selected.reserveIndex === index &&
            game.selected.color === color;
          const isDisabled =
            game.turn !== color || stack.length === 0 || Boolean(game.gameOver);

          return (
            <button
              key={`${color}-${index}`}
              type="button"
              className={`reserve-piece ${isActive ? "active" : ""} ${!nextSize ? "empty" : ""}`}
              disabled={isDisabled}
              onClick={() => onSelect(color, index)}
              aria-label={`Stack ${index + 1}, ${stack.length} remaining`}
            >
              {nextSize ? (
                <span className={`stone ${color} size-${nextSize}`} />
              ) : (
                <span className="stone-empty" />
              )}
              <span className="piece-count">{stack.length}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function createInitialGame() {
  const initial = {
    board: Array.from({ length: TOTAL_SQUARES }, () => []),
    reserves: {
      white: Array.from({ length: STACK_COUNT }, () => [...STARTING_SIZES]),
      black: Array.from({ length: STACK_COUNT }, () => [...STARTING_SIZES]),
    },
    turn: "white",
    selected: null,
    gameOver: null,
    status: "Select a reserve stack or tap a cup you control.",
    repetitionCount: {},
  };

  const key = serializePosition(initial);
  initial.repetitionCount[key] = 1;
  return initial;
}

function selectBoardCup(game, squareIndex) {
  const top = getTopCup(game.board, squareIndex);
  if (!top || top.color !== game.turn) {
    return game;
  }

  if (game.selected?.type === "board" || game.selected?.type === "reserve") {
    return game;
  }

  const selection = {
    type: "board",
    squareIndex,
    size: top.size,
    color: top.color,
  };
  const legalTargets = legalTargetsForSelection(game, selection);

  if (legalTargets.length === 0) {
    return {
      ...game,
      status: "That cup has no legal destination.",
    };
  }

  return {
    ...game,
    selected: selection,
    status: "Cup touched. It must move to another square this turn.",
  };
}

function selectReserveStack(game, color, reserveIndex) {
  if (game.gameOver || color !== game.turn) {
    return game;
  }

  if (game.selected?.type === "board") {
    return {
      ...game,
      status: "A board cup is already touched and must be moved.",
    };
  }

  const stack = game.reserves[color][reserveIndex];
  if (!stack.length) {
    return game;
  }

  const selection = {
    type: "reserve",
    color,
    reserveIndex,
    size: stack[0],
  };
  const legalTargets = legalTargetsForSelection(game, selection);

  if (legalTargets.length === 0) {
    return {
      ...game,
      status: "That reserve cup has no legal placement.",
    };
  }

  return {
    ...game,
    selected: selection,
    status: "Choose a square for this cup.",
  };
}

function executeMove(game, targetIndex) {
  const mover = game.turn;
  const opponent = otherPlayer(mover);
  const board = game.board.map((stack) => [...stack]);
  const reserves = {
    white: game.reserves.white.map((stack) => [...stack]),
    black: game.reserves.black.map((stack) => [...stack]),
  };

  if (game.selected.type === "board") {
    board[game.selected.squareIndex].pop();
  } else {
    reserves[mover][game.selected.reserveIndex].shift();
  }

  board[targetIndex].push({
    color: mover,
    size: game.selected.size,
  });

  const movedGame = {
    ...game,
    board,
    reserves,
    selected: null,
  };

  if (hasLine(movedGame, opponent)) {
    return {
      ...movedGame,
      gameOver: { winner: opponent, type: "win" },
      status: `${capitalize(opponent)} wins. ${capitalize(
        mover
      )} ended a turn while opponent had four in a row.`,
    };
  }

  if (hasLine(movedGame, mover)) {
    return {
      ...movedGame,
      gameOver: { winner: mover, type: "win" },
      status: `${capitalize(mover)} wins with four in a row.`,
    };
  }

  const nextTurnGame = {
    ...movedGame,
    turn: opponent,
    status: `${capitalize(opponent)} to move.`,
  };

  const key = serializePosition(nextTurnGame);
  const repetitionCount = { ...nextTurnGame.repetitionCount };
  const nextCount = (repetitionCount[key] || 0) + 1;
  repetitionCount[key] = nextCount;

  if (nextCount >= 3) {
    return {
      ...nextTurnGame,
      repetitionCount,
      gameOver: { winner: null, type: "draw" },
      status: "Draw by threefold repetition.",
    };
  }

  return {
    ...nextTurnGame,
    repetitionCount,
  };
}

function legalTargetsForSelection(game, selection) {
  const legal = [];

  for (let target = 0; target < TOTAL_SQUARES; target += 1) {
    const top = getTopCup(game.board, target);
    const isEmpty = !top;
    const targetIsOpponentTop = top && top.color === otherPlayer(game.turn);

    if (selection.type === "board") {
      if (target === selection.squareIndex) {
        continue;
      }
      if (canCover(game.board, selection.size, target)) {
        legal.push(target);
      }
      continue;
    }

    if (isEmpty) {
      legal.push(target);
      continue;
    }

    if (
      targetIsOpponentTop &&
      canCover(game.board, selection.size, target) &&
      reserveCoverThreatExists(game, otherPlayer(game.turn), target)
    ) {
      legal.push(target);
    }
  }

  return legal;
}

function reserveCoverThreatExists(game, opponentColor, targetIndex) {
  for (const line of LINES_BY_SQUARE[targetIndex]) {
    let count = 0;
    for (const index of line) {
      const top = getTopCup(game.board, index);
      if (top && top.color === opponentColor) {
        count += 1;
      }
    }
    if (count === BOARD_SIZE - 1) {
      return true;
    }
  }

  return false;
}

function hasLine(game, color) {
  return WINNING_LINES.some((line) =>
    line.every((index) => {
      const top = getTopCup(game.board, index);
      return top && top.color === color;
    })
  );
}

function serializePosition(game) {
  const boardKey = game.board
    .map((stack) => stack.map((cup) => `${cup.color[0]}${cup.size}`).join("."))
    .join("|");
  const reservesKey = ["white", "black"]
    .map((color) => game.reserves[color].map((stack) => stack.join(",")).join("/"))
    .join("|");

  return `${game.turn}#${boardKey}#${reservesKey}`;
}

function canCover(board, movingSize, targetIndex) {
  const top = getTopCup(board, targetIndex);
  if (!top) {
    return true;
  }
  return movingSize > top.size;
}

function getTopCup(board, squareIndex) {
  const stack = board[squareIndex];
  return stack.length ? stack[stack.length - 1] : null;
}

function otherPlayer(color) {
  return color === "white" ? "black" : "white";
}

function buildLinesBySquare() {
  const mapping = Array.from({ length: TOTAL_SQUARES }, () => []);
  for (const line of WINNING_LINES) {
    for (const index of line) {
      mapping[index].push(line);
    }
  }
  return mapping;
}

function buildWinningLines() {
  const generated = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const rowLine = [];
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      rowLine.push(row * BOARD_SIZE + col);
    }
    generated.push(rowLine);
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const colLine = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      colLine.push(row * BOARD_SIZE + col);
    }
    generated.push(colLine);
  }

  const leftDiag = [];
  const rightDiag = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    leftDiag.push(i * (BOARD_SIZE + 1));
    rightDiag.push((i + 1) * (BOARD_SIZE - 1));
  }

  generated.push(leftDiag, rightDiag);
  return generated;
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}

export default App;
