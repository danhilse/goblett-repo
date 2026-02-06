import { useMemo, useState } from "react";

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
      return "Game over: Draw.";
    }
    if (game.gameOver?.type === "win") {
      return `Game over: ${capitalize(game.gameOver.winner)} wins.`;
    }
    return `Turn: ${capitalize(game.turn)}`;
  }, [game.gameOver, game.turn]);

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
      <header className="header">
        <div>
          <p className="eyebrow">Board Game Prototype</p>
          <h1>Goblett</h1>
        </div>
        <button type="button" className="button" onClick={handleRestart}>
          New Game
        </button>
      </header>

      <section className="status-panel">
        <p className="turn-text">{turnText}</p>
        <p className="status-text">{game.status}</p>
      </section>

      <section className="play-area">
        <ReservePanel
          color="white"
          game={game}
          onSelect={handleReserveClick}
          title="White Reserves"
        />

        <section className="board-wrap">
          <div className="board" role="grid" aria-label="Goblett board">
            {game.board.map((stack, squareIndex) => {
              const top = stack.length ? stack[stack.length - 1] : null;
              const isSelectedBoardCup =
                game.selected?.type === "board" &&
                game.selected.squareIndex === squareIndex;

              return (
                <button
                  key={squareIndex}
                  type="button"
                  role="gridcell"
                  aria-label={`Square ${squareIndex + 1}`}
                  className={[
                    "square",
                    legalTargetSet.has(squareIndex) ? "target" : "",
                    isSelectedBoardCup ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleSquareClick(squareIndex)}
                >
                  {top && <div className={`cup ${top.color} size-${top.size}`} />}
                  {stack.length > 0 && <div className="stack-depth">{stack.length}</div>}
                </button>
              );
            })}
          </div>
        </section>

        <ReservePanel
          color="black"
          game={game}
          onSelect={handleReserveClick}
          title="Black Reserves"
        />
      </section>

      <section className="rules-note">
        <p>
          Reserve cups can cover an opponent stack only when that stack is part of a line with
          exactly three opponent tops.
        </p>
      </section>
    </main>
  );
}

function ReservePanel({ color, game, onSelect, title }) {
  return (
    <aside className="reserve-panel" aria-label={`${title.toLowerCase()}`}>
      <h2>{title}</h2>
      <div className="reserves">
        {game.reserves[color].map((stack, index) => {
          const nextSize = stack[0];
          const isActive =
            game.selected?.type === "reserve" &&
            game.selected.reserveIndex === index &&
            game.selected.color === color;
          const isDisabled = game.turn !== color || stack.length === 0 || Boolean(game.gameOver);

          return (
            <button
              key={`${color}-${index}`}
              type="button"
              className={`reserve-stack ${isActive ? "active" : ""}`}
              disabled={isDisabled}
              onClick={() => onSelect(color, index)}
            >
              <span>
                {nextSize ? (
                  <span className={`cup ${color} size-${nextSize}`} aria-hidden="true" />
                ) : (
                  <span className="reserve-meta">empty</span>
                )}
              </span>
              <span className="reserve-meta">{`Stack ${index + 1} (${stack.length} left)`}</span>
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
    status: "Pick a reserve stack or move a top cup you control. White moves first.",
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
      status: "A board cup is already touched and must be moved before any other action.",
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
    status: "Choose a board square for the selected reserve cup.",
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
      status: `${capitalize(mover)} wins with four tops in a row.`,
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
