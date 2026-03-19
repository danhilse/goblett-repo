import {
  applyMoveByOrigin,
  createInitialGame,
  sanitizeGameForSync,
} from "../src/game.js";

const STATE_KEY = "goblett-room-state";

function createRoomState(roomCode) {
  return {
    roomCode,
    revision: 0,
    game: sanitizeGameForSync(createInitialGame()),
    seats: {
      white: null,
      black: null,
    },
  };
}

function createPlayerId() {
  return crypto.randomUUID();
}

function seatForPlayer(seats, playerId) {
  if (!playerId) {
    return null;
  }

  if (seats.white === playerId) {
    return "white";
  }
  if (seats.black === playerId) {
    return "black";
  }
  return null;
}

function assignSeat(state, playerId = null) {
  if (playerId) {
    const existingSeat = seatForPlayer(state.seats, playerId);
    if (existingSeat) {
      return { seat: existingSeat, playerId };
    }
  }

  if (!state.seats.white) {
    const nextPlayerId = createPlayerId();
    state.seats.white = nextPlayerId;
    return { seat: "white", playerId: nextPlayerId };
  }

  if (!state.seats.black) {
    const nextPlayerId = createPlayerId();
    state.seats.black = nextPlayerId;
    return { seat: "black", playerId: nextPlayerId };
  }

  return { seat: "spectator", playerId: null };
}

function releaseSeat(state, playerId) {
  let didReleaseSeat = false;

  if (state.seats.white === playerId) {
    state.seats.white = null;
    didReleaseSeat = true;
  }

  if (state.seats.black === playerId) {
    state.seats.black = null;
    didReleaseSeat = true;
  }

  return didReleaseSeat;
}

function sanitizeSeatsForSync(seats) {
  return {
    white: Boolean(seats.white),
    black: Boolean(seats.black),
  };
}

export default class GoblettServer {
  constructor(room) {
    this.room = room;
    this.statePromise = null;
    this.connectionPlayers = new Map();
  }

  async onConnect(connection) {
    const state = await this.loadState();
    const playerId = this.connectionPlayers.get(connection) ?? null;
    connection.send(JSON.stringify(this.createSnapshot(state, playerId)));
  }

  async onMessage(message, sender) {
    let payload;

    try {
      payload = JSON.parse(message);
    } catch {
      sender.send(JSON.stringify({ type: "error", message: "Invalid message." }));
      return;
    }

    const state = await this.loadState();

    switch (payload.type) {
      case "join":
        await this.handleJoin(state, sender, payload);
        return;
      case "move":
        await this.handleMove(state, sender, payload);
        return;
      case "restart":
        await this.handleRestart(state, sender);
        return;
      case "leave":
        await this.handleLeave(state, sender);
        return;
      default:
        sender.send(JSON.stringify({ type: "error", message: "Unknown event." }));
    }
  }

  async onClose(connection) {
    if (!this.connectionPlayers.has(connection)) {
      return;
    }

    const playerId = this.connectionPlayers.get(connection);
    this.connectionPlayers.delete(connection);

    if (!playerId) {
      return;
    }

    const state = await this.loadState();
    if (releaseSeat(state, playerId)) {
      await this.persistAndBroadcast(state);
    }
  }

  async loadState() {
    if (!this.statePromise) {
      this.statePromise = this.room.storage.get(STATE_KEY).then((storedState) => {
        if (storedState) {
          return storedState;
        }

        return createRoomState(this.room.id.toUpperCase());
      });
    }

    return this.statePromise;
  }

  async persistAndBroadcast(state) {
    this.statePromise = Promise.resolve(state);
    await this.room.storage.put(STATE_KEY, state);

    for (const connection of this.room.getConnections()) {
      const playerId = this.connectionPlayers.get(connection) ?? null;
      connection.send(JSON.stringify(this.createSnapshot(state, playerId)));
    }
  }

  createSnapshot(state, playerId = null) {
    return {
      type: "snapshot",
      roomCode: state.roomCode,
      revision: state.revision,
      game: sanitizeGameForSync(state.game),
      seats: sanitizeSeatsForSync(state.seats),
      yourSeat: playerId ? seatForPlayer(state.seats, playerId) || "spectator" : "spectator",
    };
  }

  async handleJoin(state, sender) {
    const existingPlayerId = this.connectionPlayers.get(sender);
    if (existingPlayerId) {
      sender.send(JSON.stringify(this.createSnapshot(state, existingPlayerId)));
      return;
    }

    const assignment = assignSeat(state);
    this.connectionPlayers.set(sender, assignment.playerId);

    if (!assignment.playerId) {
      sender.send(JSON.stringify(this.createSnapshot(state)));
      return;
    }

    await this.persistAndBroadcast(state);
  }

  async handleMove(state, sender, payload) {
    if (!this.connectionPlayers.has(sender)) {
      sender.send(JSON.stringify({ type: "error", message: "Join the room first." }));
      return;
    }

    const playerId = this.connectionPlayers.get(sender);
    const playerSeat = seatForPlayer(state.seats, playerId);
    if (!playerSeat) {
      sender.send(JSON.stringify({ type: "error", message: "Spectators cannot move." }));
      return;
    }

    if (state.game.turn !== playerSeat) {
      sender.send(JSON.stringify({ type: "error", message: "It is not your turn." }));
      return;
    }

    if (state.game.gameOver) {
      sender.send(JSON.stringify({ type: "error", message: "The game is already over." }));
      return;
    }

    const result = applyMoveByOrigin(
      state.game,
      payload.origin,
      payload.targetIndex,
      playerSeat
    );

    if (!result.ok) {
      sender.send(JSON.stringify({ type: "error", message: result.reason }));
      return;
    }

    state.game = sanitizeGameForSync(result.game);
    state.revision += 1;
    await this.persistAndBroadcast(state);
  }

  async handleRestart(state, sender) {
    if (!this.connectionPlayers.has(sender)) {
      sender.send(JSON.stringify({ type: "error", message: "Join the room first." }));
      return;
    }

    const playerId = this.connectionPlayers.get(sender);
    if (!seatForPlayer(state.seats, playerId)) {
      sender.send(JSON.stringify({ type: "error", message: "Only seated players can restart." }));
      return;
    }

    state.game = sanitizeGameForSync(createInitialGame());
    state.revision += 1;
    await this.persistAndBroadcast(state);
  }

  async handleLeave(state, sender) {
    if (!this.connectionPlayers.has(sender)) {
      return;
    }

    const playerId = this.connectionPlayers.get(sender);
    this.connectionPlayers.delete(sender);

    if (!playerId || !releaseSeat(state, playerId)) {
      return;
    }

    await this.persistAndBroadcast(state);
  }
}
