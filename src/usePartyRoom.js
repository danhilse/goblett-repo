import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

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

function createIdleState() {
  return {
    roomCode: "",
    game: null,
    seats: {
      white: false,
      black: false,
    },
    yourSeat: "spectator",
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

export default function usePartyRoom() {
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
      yourSeat: "spectator",
      connectionStatus: "connecting",
      lastError: "",
    }));

    const socket = new PartySocket({
      host,
      party: PARTY_NAME,
      room: normalizedRoomCode,
    });
    const activeSocket = socket;

    socket.addEventListener("open", () => {
      if (socketRef.current !== activeSocket) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "join",
        })
      );
    });

    socket.addEventListener("message", (event) => {
      if (socketRef.current !== activeSocket) {
        return;
      }

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
          yourSeat: payload.yourSeat ?? "spectator",
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
      if (socketRef.current !== activeSocket) {
        return;
      }

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
      if (socketRef.current !== activeSocket) {
        return;
      }

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

  return {
    host,
    onlineAvailable: Boolean(host),
    roomState,
    yourSeat: roomState.yourSeat,
    normalizeRoomCode,
    createRoom: () => connectToRoom(generateRoomCode()),
    joinRoom: connectToRoom,
    leaveRoom,
    sendMove,
    requestRestart,
  };
}
