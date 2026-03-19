import { useEffect, useMemo, useState } from "react";
import Board3D from "./components/Board3D";
import {
  TOTAL_SQUARES,
  capitalize,
  createInitialGame,
  executeMove,
  getTopCup,
  legalTargetsForSelection,
  resolveDraggedSelection,
  selectionsMatch,
  selectBoardCup,
  selectReserveStack,
} from "./game";
import usePartyRoom from "./usePartyRoom";

function App() {
  const [game, setGame] = useState(() => createInitialGame());
  const [dragState, setDragState] = useState(() => createInactiveDragState());
  const [cameraIntroSequence, setCameraIntroSequence] = useState(0);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [matchMode, setMatchMode] = useState("local");
  const [joinCode, setJoinCode] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const {
    onlineAvailable,
    roomState,
    yourSeat,
    normalizeRoomCode,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMove,
    requestRestart,
  } = usePartyRoom();

  const isOnlineLobby = matchMode === "online";
  const isInOnlineRoom = isOnlineLobby && Boolean(roomState.roomCode);
  const interactionLocked =
    isInOnlineRoom &&
    (roomState.connectionStatus !== "connected" ||
      yourSeat === "spectator" ||
      yourSeat !== game.turn);

  useEffect(() => {
    if (!isInOnlineRoom || !roomState.game) {
      return;
    }

    setGame(roomState.game);
    setDragState(createInactiveDragState());
  }, [isInOnlineRoom, roomState.game]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);

    if (isInOnlineRoom) {
      url.searchParams.set("room", roomState.roomCode);
    } else {
      url.searchParams.delete("room");
    }

    window.history.replaceState({}, "", url);
  }, [isInOnlineRoom, roomState.roomCode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const roomParam = normalizeRoomCode(
      new URLSearchParams(window.location.search).get("room") || ""
    );

    if (!roomParam) {
      return;
    }

    setMatchMode("online");
    setJoinCode(roomParam);
    joinRoom(roomParam);
  }, []);

  useEffect(() => {
    if (!shareCopied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setShareCopied(false);
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [shareCopied]);

  const legalTargetSet = useMemo(() => {
    if (!game.selected) {
      return new Set();
    }
    return new Set(legalTargetsForSelection(game, game.selected));
  }, [game]);

  const movableBoardSquareSet = useMemo(() => {
    if (game.gameOver || interactionLocked) {
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
  }, [game, interactionLocked]);

  const movableReserveByColor = useMemo(() => {
    const movable = {
      white: new Set(),
      black: new Set(),
    };

    if (game.gameOver || interactionLocked || game.selected?.type === "board") {
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
  }, [game, interactionLocked]);

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

  const gameOverHeading = useMemo(() => {
    if (!game.gameOver) {
      return "";
    }
    if (game.gameOver.type === "draw") {
      return "Game over: draw";
    }
    return `Game over: ${capitalize(game.gameOver.winner)} wins`;
  }, [game.gameOver]);

  const roomStatusText = useMemo(() => {
    if (!isOnlineLobby) {
      return "Local pass-and-play.";
    }

    if (!onlineAvailable) {
      return "Online rooms are disabled until VITE_PARTYKIT_HOST is configured.";
    }

    if (!isInOnlineRoom) {
      return "Create a room or join a room code.";
    }

    if (roomState.connectionStatus === "connecting") {
      return `Connecting to room ${roomState.roomCode}...`;
    }

    if (roomState.connectionStatus === "disconnected") {
      return `Disconnected from room ${roomState.roomCode}.`;
    }

    if (yourSeat === "spectator") {
      return `Room ${roomState.roomCode} is full. You are watching.`;
    }

    if (game.gameOver) {
      return `Room ${roomState.roomCode}. ${turnText}.`;
    }

    if (yourSeat === game.turn) {
      return `Room ${roomState.roomCode}. Your turn as ${capitalize(yourSeat)}.`;
    }

    return `Room ${roomState.roomCode}. Waiting for ${capitalize(game.turn)}.`;
  }, [
    game.gameOver,
    game.turn,
    isInOnlineRoom,
    isOnlineLobby,
    onlineAvailable,
    roomState.connectionStatus,
    roomState.roomCode,
    turnText,
    yourSeat,
  ]);

  const footerStatus = roomState.lastError || roomStatusText || game.status;
  const restartDisabled =
    isInOnlineRoom &&
    (roomState.connectionStatus !== "connected" || yourSeat === "spectator");

  const submitSelectionTarget = (currentGame, selection, targetIndex) => {
    const legalTargets = legalTargetsForSelection(currentGame, selection);
    if (!legalTargets.includes(targetIndex)) {
      return {
        ...currentGame,
        selected: selection,
        status: "Illegal target for the selected cup.",
      };
    }

    if (isInOnlineRoom) {
      const didSend = sendMove(selectionToOrigin(selection), targetIndex);
      return {
        ...currentGame,
        selected: didSend ? null : selection,
        status: didSend
          ? "Move sent. Waiting for room sync."
          : "Room connection is offline.",
      };
    }

    return executeMove(
      {
        ...currentGame,
        selected: selection,
      },
      targetIndex
    );
  };

  const handleRestart = () => {
    setDragState(createInactiveDragState());

    if (isInOnlineRoom) {
      if (requestRestart()) {
        setGame((current) => ({
          ...current,
          selected: null,
          status: "Restart requested. Waiting for room sync.",
        }));
      }
      return;
    }

    setGame(createInitialGame());
    setCameraIntroSequence((current) => current + 1);
  };

  const handleSwitchToLocal = () => {
    if (isInOnlineRoom) {
      leaveRoom();
    }

    setMatchMode("local");
    setJoinCode("");
    setGame(createInitialGame());
    setDragState(createInactiveDragState());
    setCameraIntroSequence((current) => current + 1);
  };

  const handleOpenOnline = () => {
    setMatchMode("online");
  };

  const handleCreateRoom = () => {
    setMatchMode("online");
    createRoom();
    setDragState(createInactiveDragState());
  };

  const handleJoinRoom = () => {
    setMatchMode("online");
    if (joinRoom(joinCode)) {
      setDragState(createInactiveDragState());
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setGame(createInitialGame());
    setDragState(createInactiveDragState());
    setCameraIntroSequence((current) => current + 1);
  };

  const handleCopyInvite = async () => {
    if (typeof window === "undefined" || !roomState.roomCode) {
      return;
    }

    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("room", roomState.roomCode);
    inviteUrl.hash = "";

    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  };

  const handleSquareClick = (squareIndex) => {
    if (interactionLocked) {
      return;
    }

    setDragState(createInactiveDragState());

    if (game.gameOver) {
      return;
    }

    if (!game.selected) {
      setGame(selectBoardCup(game, squareIndex));
      return;
    }

    setGame(submitSelectionTarget(game, game.selected, squareIndex));
  };

  const handleReserveClick = (color, reserveIndex) => {
    if (interactionLocked) {
      return;
    }

    setDragState(createInactiveDragState());
    setGame(selectReserveStack(game, color, reserveIndex));
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
    if (game.gameOver || interactionLocked) {
      return;
    }

    const top = getTopCup(game.board, squareIndex);
    if (!top || top.color !== game.turn) {
      return;
    }

    const canUseCurrentSelection =
      game.selected?.type === "board" && game.selected.squareIndex === squareIndex;
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
      setGame(selectBoardCup(game, squareIndex));
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
      interactionLocked ||
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
    setGame(selectReserveStack(game, color, reserveIndex));

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
      setGame(completeDragMove(game, dragState, submitSelectionTarget));
      setDragState(createInactiveDragState());
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [dragState, game]);

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

  useEffect(() => {
    if (!isRulesOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsRulesOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isRulesOpen]);

  return (
    <main className={`app ${game.gameOver ? "game-ended" : ""}`}>
      <header className="header fade-in-1">
        <div>
          <h1>Goblett</h1>
          <p className="subhead">A minimalist Gobblet room with optional online play.</p>
        </div>
        <div className="header-controls">
          <button type="button" className="rules-btn" onClick={() => setIsRulesOpen(true)}>
            Rules
          </button>
          <div className="header-status">
            <span className={`turn-dot ${game.turn}`} />
            <span className="turn-label">{turnText}</span>
          </div>
        </div>
      </header>

      <section className="match-panel fade-in-2" aria-label="Match controls">
        <div className="mode-toggle" role="tablist" aria-label="Play mode">
          <button
            type="button"
            className={`mode-btn ${matchMode === "local" ? "active" : ""}`}
            onClick={handleSwitchToLocal}
          >
            Local
          </button>
          <button
            type="button"
            className={`mode-btn ${matchMode === "online" ? "active" : ""}`}
            onClick={handleOpenOnline}
          >
            Online
          </button>
        </div>

        {matchMode === "online" ? (
          <div className="room-panel">
            {!isInOnlineRoom ? (
              <div className="room-actions">
                <button
                  type="button"
                  className="room-btn primary"
                  onClick={handleCreateRoom}
                  disabled={!onlineAvailable}
                >
                  Create room
                </button>
                <div className="join-controls">
                  <input
                    type="text"
                    className="room-input"
                    value={joinCode}
                    onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
                    placeholder="Room code"
                    inputMode="text"
                    autoCapitalize="characters"
                    spellCheck="false"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="room-btn"
                    onClick={handleJoinRoom}
                    disabled={!onlineAvailable || joinCode.length < 4}
                  >
                    Join
                  </button>
                </div>
              </div>
            ) : (
              <div className="room-session">
                <div>
                  <p className="room-kicker">Room</p>
                  <p className="room-code">{roomState.roomCode}</p>
                </div>
                <div>
                  <p className="room-kicker">Seat</p>
                  <p className="room-meta">{capitalize(yourSeat)}</p>
                </div>
                <div>
                  <p className="room-kicker">Connection</p>
                  <p className="room-meta">{capitalize(roomState.connectionStatus)}</p>
                </div>
                <div className="room-session-actions">
                  <button type="button" className="room-btn" onClick={handleCopyInvite}>
                    {shareCopied ? "Copied" : "Copy invite"}
                  </button>
                  <button type="button" className="room-btn" onClick={handleLeaveRoom}>
                    Leave room
                  </button>
                </div>
              </div>
            )}

            <p className="match-note">{roomStatusText}</p>
          </div>
        ) : (
          <p className="match-note">Pass the device locally, or switch to Online for room play.</p>
        )}
      </section>

      {game.gameOver ? (
        <section className="game-over-banner fade-in-2" role="alert" aria-live="assertive">
          <p className="game-over-kicker">Game over</p>
          <p className="game-over-title">{turnText}</p>
          <p className="game-over-note">
            {isInOnlineRoom
              ? "Restart the room to begin another match."
              : "Press Play again to start a new match."}
          </p>
        </section>
      ) : null}

      <div className="arena fade-in-2">
        <ReserveColumn
          color="white"
          game={game}
          pickableSet={movableReserveByColor.white}
          interactionEnabled={!interactionLocked}
          onSelect={handleReserveClick}
          onPointerDown={handleReservePointerDown}
        />

        <section className={`board-stage ${game.gameOver ? "game-over" : ""}`}>
          <div
            className={`board-canvas ${dragState.active ? "dragging" : ""} ${
              interactionLocked ? "locked" : ""
            }`}
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
              introSequence={cameraIntroSequence}
              onSquareClick={handleSquareClick}
              onSquareHover={handleSquareHover}
              onSquareHoverEnd={clearSquareHover}
              onCupPointerDown={handleCupPointerDown}
            />
          </div>
          {game.gameOver ? (
            <div className="board-game-over-overlay" role="status" aria-label={gameOverHeading}>
              <span className="board-game-over-label">Game over</span>
              <strong>{turnText}</strong>
            </div>
          ) : null}
          {interactionLocked && isInOnlineRoom ? (
            <div className="board-room-overlay" aria-hidden="true">
              <span>{yourSeat === "spectator" ? "Spectating" : "Waiting"}</span>
            </div>
          ) : null}
        </section>

        <ReserveColumn
          color="black"
          game={game}
          pickableSet={movableReserveByColor.black}
          interactionEnabled={!interactionLocked}
          onSelect={handleReserveClick}
          onPointerDown={handleReservePointerDown}
        />
      </div>

      {dragState.active &&
      dragState.origin?.type === "reserve" &&
      dragPreview &&
      dragState.pointer &&
      (dragState.hoverSquare === null || !legalTargetSet.has(dragState.hoverSquare)) ? (
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
        <p className="status-line">{footerStatus}</p>
        <button
          type="button"
          className={`restart-btn ${game.gameOver ? "prominent" : ""}`}
          onClick={handleRestart}
          disabled={restartDisabled}
        >
          {isInOnlineRoom ? "Restart room" : game.gameOver ? "Play again" : "Restart"}
        </button>
      </footer>

      {isRulesOpen ? <RulesModal onClose={() => setIsRulesOpen(false)} /> : null}
    </main>
  );
}

function RulesModal({ onClose }) {
  const rulesId = "game-rules-heading";

  return (
    <div className="rules-modal-backdrop" onClick={onClose}>
      <section
        className="rules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={rulesId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="rules-modal-header">
          <p className="rules-kicker">How to play</p>
          <h2 id={rulesId}>Goblett rules</h2>
        </header>

        <div className="rules-body">
          <p>Build a visible line of 4 cups in any row, column, or diagonal to win.</p>

          <p>On your turn, move exactly one cup:</p>
          <ul>
            <li>From one of your reserve stacks to the board.</li>
            <li>Or move the top cup from one board stack to a different square.</li>
          </ul>

          <p>Covering rules:</p>
          <ul>
            <li>You may place only on an empty square or on a smaller cup.</li>
            <li>
              Reserve cups can only cover an opponent cup when it blocks an immediate
              4-in-a-row threat.
            </li>
          </ul>

          <p>End conditions:</p>
          <ul>
            <li>If you end your turn with 4 in a row, you win.</li>
            <li>
              If your move reveals an opponent 4 in a row, the opponent wins immediately.
            </li>
            <li>Threefold repetition is a draw.</li>
          </ul>
        </div>

        <div className="rules-modal-footer">
          <button type="button" className="restart-btn prominent" onClick={onClose}>
            Back to game
          </button>
        </div>
      </section>
    </div>
  );
}

function ReserveColumn({
  color,
  game,
  pickableSet,
  interactionEnabled,
  onSelect,
  onPointerDown,
}) {
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
            !interactionEnabled ||
            game.turn !== color ||
            stack.length === 0 ||
            Boolean(game.gameOver);
          const isPickable = !isDisabled && pickableSet.has(index);

          return (
            <button
              key={`${color}-${index}`}
              type="button"
              className={`reserve-piece ${isActive ? "active" : ""} ${
                isPickable ? "pickable" : ""
              } ${!nextSize ? "empty" : ""}`}
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

function completeDragMove(game, dragState, submitSelectionTarget) {
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

  return submitSelectionTarget(game, activeSelection, dragState.hoverSquare);
}

function selectionToOrigin(selection) {
  if (selection.type === "board") {
    return {
      type: "board",
      squareIndex: selection.squareIndex,
    };
  }

  return {
    type: "reserve",
    reserveIndex: selection.reserveIndex,
  };
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
