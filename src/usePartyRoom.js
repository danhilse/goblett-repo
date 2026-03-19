import { useEffect, useMemo, useRef, useState } from "react";
import PartySocket from "partysocket";

const PLAYER_ID_STORAGE_KEY = "goblett-player-id";
const PARTY_NAME = "goblett";
const DEFAULT_DEV_HOST = "localhost:1999";

function getPartykitHost() {
  const configuredHost = import.meta.env.VITE_PARTYKIT_HOST;
  if (configuredHost) {
    return configuredHost;
  }

  if (import.meta.env.DEV) {
    return DEFAULT_DEV_HOST;
  }

  return "";
}

function getOrCreatePlayerId() {
  if (typeof window === "undefined") {
    return "server-player";
  }

  const existingId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (existingId) {
    return existingId;
  }

  const nextId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `player-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, nextId);
  return nextId;
}

function createIdleState() {
  return {
    roomCode: "",
    game: null,
    seats: {
      white: null,
      black: null,
    },
    revision: -1,
    connectionStatus: "idle",
    lastError: "",
  };
}

function normalizeRoomCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";

  for (let index = 0; index < 6; index += 1) {
    roomCode += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return roomCode;
}

function deriveSeat(seats, playerId) {
  if (seats.white === playerId) {
    return "white";
  }
  if (seats.black === playerId) {
    return "black";
  }
  return "spectator";
}

export default function usePartyRoom() {
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [roomState, setRoomState] = useState(() => createIdleState());
  const socketRef = useRef(null);
  const host = getPartykitHost();

  const closeSocket = () => {
    if (!socketRef.current) {
      return;
    }

    socketRef.current.close();
    socketRef.current = null;
  };

  const connectToRoom = (roomCode) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) {
      setRoomState((current) => ({
        ...current,
        connectionStatus: "error",
        lastError: "Enter a valid room code.",
      }));
      return false;
    }

    if (!host) {
      setRoomState((current) => ({
        ...current,
        connectionStatus: "error",
        lastError: "Online rooms need VITE_PARTYKIT_HOST configured in production.",
      }));
      return false;
    }

    closeSocket();

    setRoomState((current) => ({
      ...current,
      roomCode: normalizedRoomCode,
      connectionStatus: "connecting",
      lastError: "",
    }));

    const socket = new PartySocket({
      host,
      party: PARTY_NAME,
      room: normalizedRoomCode,
    });

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          playerId,
        })
      );
    });

    socket.addEventListener("message", (event) => {
      let payload;

      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "snapshot") {
        setRoomState((current) => ({
          ...current,
          roomCode: payload.roomCode,
          game: payload.game,
          seats: payload.seats,
          revision: payload.revision,
          connectionStatus: "connected",
          lastError: "",
        }));
        return;
      }

      if (payload.type === "error") {
        setRoomState((current) => ({
          ...current,
          connectionStatus:
            current.connectionStatus === "connected" ? "connected" : "error",
          lastError: payload.message,
        }));
      }
    });

    socket.addEventListener("close", () => {
      setRoomState((current) => {
        if (current.roomCode !== normalizedRoomCode) {
          return current;
        }

        return {
          ...current,
          connectionStatus: current.game ? "disconnected" : "idle",
        };
      });
    });

    socket.addEventListener("error", () => {
      setRoomState((current) => ({
        ...current,
        connectionStatus: "error",
        lastError: "Unable to reach the room server.",
      }));
    });

    socketRef.current = socket;
    return true;
  };

  const leaveRoom = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "leave" }));
    }

    closeSocket();
    setRoomState(createIdleState());
  };

  const sendMove = (origin, targetIndex) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setRoomState((current) => ({
        ...current,
        lastError: "Room connection is offline.",
      }));
      return false;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "move",
        origin,
        targetIndex,
      })
    );

    return true;
  };

  const requestRestart = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setRoomState((current) => ({
        ...current,
        lastError: "Room connection is offline.",
      }));
      return false;
    }

    socketRef.current.send(JSON.stringify({ type: "restart" }));
    return true;
  };

  useEffect(
    () => () => {
      closeSocket();
    },
    []
  );

  const yourSeat = useMemo(
    () => deriveSeat(roomState.seats, playerId),
    [playerId, roomState.seats]
  );

  return {
    host,
    onlineAvailable: Boolean(host),
    playerId,
    roomState,
    yourSeat,
    normalizeRoomCode,
    createRoom: () => connectToRoom(generateRoomCode()),
    joinRoom: connectToRoom,
    leaveRoom,
    sendMove,
    requestRestart,
  };
}
