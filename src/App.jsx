import { useEffect, useMemo, useState } from "react";
import Board3D from "./components/Board3D";

const BOARD_SIZE = 4;
const TOTAL_SQUARES = BOARD_SIZE * BOARD_SIZE;
const STACK_COUNT = 3;
const STARTING_SIZES = [4, 3, 2, 1];
const WINNING_LINES = buildWinningLines();
const LINES_BY_SQUARE = buildLinesBySquare();

function App() {
  const [game, setGame] = useState(() => createInitialGame());
  const [dragState, setDragState] = useState(() => createInactiveDragState());

  const legalTargetSet = useMemo(() => {
    if (!game.selected) {
      return new Set();
    }
    return new Set(legalTargetsForSelection(game, game.selected));
  }, [game]);
  const movableBoardSquareSet = useMemo(() => {
    if (game.gameOver) {
      return new Set();
    }

    if (game.selected?.type === "board") {
      return new Set([game.selected.squareIndex]);
    }

    if (game.selected?.type === "reserve") {
      return new Set();
    }

    const movable = new Set();
    for (let squareIndex = 0; squareIndex < TOTAL_SQUARES; squareIndex += 1) {
      const top = getTopCup(game.board, squareIndex);
      if (!top || top.color !== game.turn) {
        continue;
      }

      const selection = {
        type: "board",
        squareIndex,
        size: top.size,
        color: top.color,
      };
      if (legalTargetsForSelection(game, selection).length > 0) {
        movable.add(squareIndex);
      }
    }
    return movable;
  }, [game]);
  const movableReserveByColor = useMemo(() => {
    const movable = {
      white: new Set(),
      black: new Set(),
    };

    if (game.gameOver || game.selected?.type === "board") {
      return movable;
    }

    if (game.selected?.type === "reserve") {
      movable[game.selected.color].add(game.selected.reserveIndex);
      return movable;
    }

    const currentColor = game.turn;
    game.reserves[currentColor].forEach((stack, reserveIndex) => {
      if (!stack.length) {
        return;
      }

      const selection = {
        type: "reserve",
        color: currentColor,
        reserveIndex,
        size: stack[0],
      };
      if (legalTargetsForSelection(game, selection).length > 0) {
        movable[currentColor].add(reserveIndex);
      }
    });

    return movable;
  }, [game]);
  const dragPreview = useMemo(() => {
    if (!dragState.active) {
      return null;
    }

    const draggedSelection = resolveDraggedSelection(game, dragState.origin);
    if (!draggedSelection) {
      return null;
    }

    return {
      size: draggedSelection.size,
      color: draggedSelection.color,
    };
  }, [dragState.active, dragState.origin, game]);

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
    setDragState(createInactiveDragState());
  };

  const handleSquareClick = (squareIndex) => {
    setDragState(createInactiveDragState());
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
    setDragState(createInactiveDragState());
    setGame((current) => selectReserveStack(current, color, reserveIndex));
  };

  const handleSquareHover = (squareIndex) => {
    setDragState((current) => {
      if (!current.active || current.hoverSquare === squareIndex) {
        return current;
      }
      return {
        ...current,
        hoverSquare: squareIndex,
      };
    });
  };

  const clearSquareHover = () => {
    setDragState((current) => {
      if (!current.active || current.hoverSquare === null) {
        return current;
      }
      return {
        ...current,
        hoverSquare: null,
      };
    });
  };

  const handleCupPointerDown = (squareIndex, pointer) => {
    if (game.gameOver) {
      return;
    }

    const top = getTopCup(game.board, squareIndex);
    if (!top || top.color !== game.turn) {
      return;
    }

    const canUseCurrentSelection =
      game.selected?.type === "board" &&
      game.selected.squareIndex === squareIndex;
    if (game.selected && !canUseCurrentSelection) {
      return;
    }

    const selection = {
      type: "board",
      squareIndex,
      size: top.size,
      color: top.color,
    };
    const legalTargets = legalTargetsForSelection(game, selection);
    if (!canUseCurrentSelection) {
      setGame((current) => selectBoardCup(current, squareIndex));
    }

    if (!legalTargets.length) {
      return;
    }

    setDragState({
      active: true,
      origin: {
        type: "board",
        squareIndex,
      },
      hoverSquare: null,
      pointer,
    });
  };

  const handleReservePointerDown = (color, reserveIndex, pointer) => {
    if (
      game.gameOver ||
      color !== game.turn ||
      game.selected?.type === "board"
    ) {
      return;
    }

    const stack = game.reserves[color][reserveIndex];
    if (!stack.length) {
      return;
    }

    const selection = {
      type: "reserve",
      color,
      reserveIndex,
      size: stack[0],
    };
    const legalTargets = legalTargetsForSelection(game, selection);
    setGame((current) => selectReserveStack(current, color, reserveIndex));

    if (!legalTargets.length) {
      return;
    }

    setDragState({
      active: true,
      origin: {
        type: "reserve",
        color,
        reserveIndex,
      },
      hoverSquare: null,
      pointer,
    });
  };

  useEffect(() => {
    if (!dragState.active) {
      return undefined;
    }

    const handlePointerUp = () => {
      setGame((current) => completeDragMove(current, dragState));
      setDragState(createInactiveDragState());
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [dragState]);

  useEffect(() => {
    if (!dragState.active || dragState.origin?.type !== "reserve") {
      return undefined;
    }

    const handlePointerMove = (event) => {
      setDragState((current) => {
        if (!current.active || current.origin?.type !== "reserve") {
          return current;
        }

        return {
          ...current,
          pointer: {
            x: event.clientX,
            y: event.clientY,
          },
        };
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [dragState.active, dragState.origin]);

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
          pickableSet={movableReserveByColor.white}
          onSelect={handleReserveClick}
          onPointerDown={handleReservePointerDown}
        />

        <section className="board-stage">
          <div
            className={`board-canvas ${dragState.active ? "dragging" : ""}`}
            role="grid"
            aria-label="Goblett board"
          >
            <Board3D
              board={game.board}
              legalTargetSet={legalTargetSet}
              movableSquareSet={movableBoardSquareSet}
              selected={game.selected}
              dragState={dragState}
              dragPreview={dragPreview}
              onSquareClick={handleSquareClick}
              onSquareHover={handleSquareHover}
              onSquareHoverEnd={clearSquareHover}
              onCupPointerDown={handleCupPointerDown}
            />
          </div>
        </section>

        <ReserveColumn
          color="black"
          game={game}
          pickableSet={movableReserveByColor.black}
          onSelect={handleReserveClick}
          onPointerDown={handleReservePointerDown}
        />
      </div>

      {dragState.active &&
      dragState.origin?.type === "reserve" &&
      dragPreview &&
      dragState.pointer &&
      (dragState.hoverSquare === null ||
        !legalTargetSet.has(dragState.hoverSquare)) ? (
        <div
          className="drag-cursor"
          style={{
            left: `${dragState.pointer.x}px`,
            top: `${dragState.pointer.y}px`,
          }}
          aria-hidden="true"
        >
          <span className={`stone ${dragPreview.color} size-${dragPreview.size}`} />
        </div>
      ) : null}

      <footer className="footer fade-in-3">
        <p className="status-line">{game.status}</p>
        <button type="button" className="restart-btn" onClick={handleRestart}>
          {game.gameOver ? "Play again" : "Restart"}
        </button>
      </footer>
    </main>
  );
}

function ReserveColumn({ color, game, pickableSet, onSelect, onPointerDown }) {
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
          const isPickable = !isDisabled && pickableSet.has(index);

          return (
            <button
              key={`${color}-${index}`}
              type="button"
              className={`reserve-piece ${isActive ? "active" : ""} ${isPickable ? "pickable" : ""} ${!nextSize ? "empty" : ""}`}
              disabled={isDisabled}
              onPointerDown={(event) => {
                if (isDisabled) {
                  return;
                }
                event.preventDefault();
                onPointerDown(color, index, {
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
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
    status: "Select or drag a reserve stack, or drag a cup you control.",
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
    status: "Cup selected. Drag or tap a destination square.",
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
    status: "Reserve cup selected. Drag or tap a destination square.",
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

function completeDragMove(game, dragState) {
  if (!dragState.active || dragState.hoverSquare === null || game.gameOver) {
    return game;
  }

  const draggedSelection = resolveDraggedSelection(game, dragState.origin);
  if (!draggedSelection) {
    return game;
  }

  const activeSelection = selectionsMatch(game.selected, draggedSelection)
    ? game.selected
    : draggedSelection;
  const legalTargets = legalTargetsForSelection(game, activeSelection);

  if (!legalTargets.includes(dragState.hoverSquare)) {
    return {
      ...game,
      selected: activeSelection,
    };
  }

  return executeMove(
    {
      ...game,
      selected: activeSelection,
    },
    dragState.hoverSquare
  );
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

function resolveDraggedSelection(game, origin) {
  if (!origin) {
    return null;
  }

  if (origin.type === "board") {
    const top = getTopCup(game.board, origin.squareIndex);
    if (!top || top.color !== game.turn) {
      return null;
    }

    return {
      type: "board",
      squareIndex: origin.squareIndex,
      size: top.size,
      color: top.color,
    };
  }

  const stack = game.reserves[origin.color][origin.reserveIndex];
  if (
    !stack.length ||
    origin.color !== game.turn
  ) {
    return null;
  }

  return {
    type: "reserve",
    color: origin.color,
    reserveIndex: origin.reserveIndex,
    size: stack[0],
  };
}

function selectionsMatch(left, right) {
  if (!left || !right || left.type !== right.type) {
    return false;
  }

  if (left.type === "board") {
    return left.squareIndex === right.squareIndex;
  }

  return (
    left.color === right.color && left.reserveIndex === right.reserveIndex
  );
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

function createInactiveDragState() {
  return {
    active: false,
    origin: null,
    hoverSquare: null,
    pointer: null,
  };
}

export default App;
