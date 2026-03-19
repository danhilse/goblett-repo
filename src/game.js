export const BOARD_SIZE = 4;
export const TOTAL_SQUARES = BOARD_SIZE * BOARD_SIZE;
export const STACK_COUNT = 3;
export const STARTING_SIZES = [4, 3, 2, 1];
export const WINNING_LINES = buildWinningLines();
export const LINES_BY_SQUARE = buildLinesBySquare();

export function createInitialGame() {
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

export function sanitizeGameForSync(game) {
  return {
    ...game,
    selected: null,
  };
}

export function selectBoardCup(game, squareIndex) {
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

export function selectReserveStack(game, color, reserveIndex) {
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

export function executeMove(game, targetIndex) {
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

export function legalTargetsForSelection(game, selection) {
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

export function resolveDraggedSelection(game, origin) {
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
  if (!stack.length || origin.color !== game.turn) {
    return null;
  }

  return {
    type: "reserve",
    color: origin.color,
    reserveIndex: origin.reserveIndex,
    size: stack[0],
  };
}

export function selectionsMatch(left, right) {
  if (!left || !right || left.type !== right.type) {
    return false;
  }

  if (left.type === "board") {
    return left.squareIndex === right.squareIndex;
  }

  return left.color === right.color && left.reserveIndex === right.reserveIndex;
}

export function selectionFromOrigin(game, origin, playerColor = game.turn) {
  if (!origin) {
    return null;
  }

  const reserveStacks = game.reserves[playerColor];
  if (!reserveStacks) {
    return null;
  }

  if (origin.type === "board") {
    if (
      !Number.isInteger(origin.squareIndex) ||
      origin.squareIndex < 0 ||
      origin.squareIndex >= game.board.length
    ) {
      return null;
    }

    const top = getTopCup(game.board, origin.squareIndex);
    if (!top || top.color !== playerColor) {
      return null;
    }

    return {
      type: "board",
      squareIndex: origin.squareIndex,
      size: top.size,
      color: top.color,
    };
  }

  if (origin.type !== "reserve") {
    return null;
  }

  if (
    !Number.isInteger(origin.reserveIndex) ||
    origin.reserveIndex < 0 ||
    origin.reserveIndex >= reserveStacks.length
  ) {
    return null;
  }

  const stack = reserveStacks[origin.reserveIndex];
  if (!stack || !stack.length) {
    return null;
  }

  return {
    type: "reserve",
    color: playerColor,
    reserveIndex: origin.reserveIndex,
    size: stack[0],
  };
}

export function applyMoveByOrigin(game, origin, targetIndex, playerColor = game.turn) {
  const selection = selectionFromOrigin(game, origin, playerColor);
  if (!selection) {
    return {
      ok: false,
      reason: "That move is no longer available.",
    };
  }

  const legalTargets = legalTargetsForSelection(game, selection);
  if (!legalTargets.includes(targetIndex)) {
    return {
      ok: false,
      reason: "Illegal move for the selected cup.",
    };
  }

  return {
    ok: true,
    game: executeMove(
      {
        ...game,
        selected: selection,
      },
      targetIndex
    ),
  };
}

export function otherPlayer(color) {
  return color === "white" ? "black" : "white";
}

export function getTopCup(board, squareIndex) {
  const stack = board[squareIndex];
  return stack.length ? stack[stack.length - 1] : null;
}

export function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
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
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    leftDiag.push(index * (BOARD_SIZE + 1));
    rightDiag.push((index + 1) * (BOARD_SIZE - 1));
  }

  generated.push(leftDiag, rightDiag);
  return generated;
}
