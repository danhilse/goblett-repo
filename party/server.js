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

function seatForPlayer(seats, playerId) {
  if (seats.white === playerId) {
    return "white";
  }
  if (seats.black === playerId) {
    return "black";
  }
  return null;
}

function assignSeat(state, playerId) {
  const existingSeat = seatForPlayer(state.seats, playerId);
  if (existingSeat) {
    return existingSeat;
  }

  if (!state.seats.white) {
    state.seats.white = playerId;
    return "white";
  }

  if (!state.seats.black) {
    state.seats.black = playerId;
    return "black";
  }

  return "spectator";
}

export default class GoblettServer {
  constructor(room) {
    this.room = room;
    this.statePromise = null;
    this.connectionPlayers = new Map();
  }

  async onConnect(connection) {
    const state = await this.loadState();
    connection.send(JSON.stringify(this.createSnapshot(state)));
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
    this.connectionPlayers.delete(connection);
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
    this.room.broadcast(JSON.stringify(this.createSnapshot(state)));
  }

  createSnapshot(state) {
    return {
      type: "snapshot",
      roomCode: state.roomCode,
      revision: state.revision,
      game: sanitizeGameForSync(state.game),
      seats: state.seats,
    };
  }

  async handleJoin(state, sender, payload) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    if (!playerId) {
      sender.send(JSON.stringify({ type: "error", message: "Missing player id." }));
      return;
    }

    this.connectionPlayers.set(sender, playerId);
    assignSeat(state, playerId);
    await this.persistAndBroadcast(state);
  }

  async handleMove(state, sender, payload) {
    const playerId = this.connectionPlayers.get(sender);
    if (!playerId) {
      sender.send(JSON.stringify({ type: "error", message: "Join the room first." }));
      return;
    }

    const playerSeat = seatForPlayer(state.seats, playerId);
    if (!playerSeat) {
      sender.send(JSON.stringify({ type: "error", message: "Spectators cannot move." }));
      return;
    }

    if (state.game.turn !== playerSeat) {
      sender.send(JSON.stringify({ type: "error", message: "It is not your turn." }));
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
    const playerId = this.connectionPlayers.get(sender);
    if (!playerId || !seatForPlayer(state.seats, playerId)) {
      sender.send(JSON.stringify({ type: "error", message: "Only seated players can restart." }));
      return;
    }

    state.game = sanitizeGameForSync(createInitialGame());
    state.revision += 1;
    await this.persistAndBroadcast(state);
  }

  async handleLeave(state, sender) {
    const playerId = this.connectionPlayers.get(sender);
    if (!playerId) {
      return;
    }

    if (state.seats.white === playerId) {
      state.seats.white = null;
    }
    if (state.seats.black === playerId) {
      state.seats.black = null;
    }

    this.connectionPlayers.delete(sender);
    await this.persistAndBroadcast(state);
  }
}
