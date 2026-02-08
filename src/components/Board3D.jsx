import { Canvas, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

const BOARD_SIZE = 4;
const BOARD_SPAN = 5.2;
const BOARD_DEPTH = 0.6;
const BOARD_RADIUS = 0.32;
const TILE_GAP = 0.12;
const TILE_PADDING = 0.36;
const TILE_DEPTH = 0.07;

const CUP_SPECS = {
  1: { radius: 0.14, height: 0.3 },
  2: { radius: 0.24, height: 0.35 },
  3: { radius: 0.34, height: 0.4 },
  4: { radius: 0.46, height: 0.46 },
};

function Board3D({
  board,
  legalTargetSet,
  selected,
  dragState,
  dragPreview,
  onSquareClick,
  onSquareHover,
  onSquareHoverEnd,
  onCupPointerDown,
}) {
  return (
    <Canvas
      shadows
      orthographic
      camera={{ zoom: 80, near: 0.1, far: 80 }}
      gl={{ antialias: true }}
      dpr={[1, 1.8]}
    >
      <SceneCamera />
      <color attach="background" args={["#f4efe8"]} />
      <ambientLight intensity={1.0} />
      <hemisphereLight args={["#f5efe6", "#c8bfb2", 0.55]} />
      <directionalLight
        position={[4.5, 9, 5]}
        intensity={0.9}
        castShadow
        shadow-bias={-0.0006}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={24}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
      <directionalLight position={[-4, 4, -3]} intensity={0.45} />
      <BoardGroup
        board={board}
        legalTargetSet={legalTargetSet}
        selected={selected}
        dragState={dragState}
        dragPreview={dragPreview}
        onSquareClick={onSquareClick}
        onSquareHover={onSquareHover}
        onSquareHoverEnd={onSquareHoverEnd}
        onCupPointerDown={onCupPointerDown}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow>
        <planeGeometry args={[13, 13]} />
        <shadowMaterial transparent opacity={0.1} />
      </mesh>
    </Canvas>
  );
}

function SceneCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(7.8, 8.2, 7.8);
    camera.lookAt(0, 0.3, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function BoardGroup({
  board,
  legalTargetSet,
  selected,
  dragState,
  dragPreview,
  onSquareClick,
  onSquareHover,
  onSquareHoverEnd,
  onCupPointerDown,
}) {
  const playableSpan = BOARD_SPAN - TILE_PADDING * 2;
  const tileSize = (playableSpan - TILE_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;

  const boardGeometry = useMemo(() => {
    const shape = roundedRectShape(BOARD_SPAN, BOARD_SPAN, BOARD_RADIUS);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: BOARD_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.045,
      bevelSegments: 10,
      curveSegments: 26,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  const tileGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(tileSize, TILE_DEPTH, tileSize, 1, 1, 1);
    return geometry;
  }, [tileSize]);

  const squareLayout = useMemo(() => buildSquareLayout(), []);
  const [dragPointer, setDragPointer] = useState(null);
  const topPieces = useMemo(
    () => board.map((stack) => (stack.length ? stack[stack.length - 1] : null)),
    [board]
  );
  const draggedBoardSquare =
    dragState.active && dragState.origin?.type === "board"
      ? dragState.origin.squareIndex
      : null;

  useEffect(() => {
    if (!dragState.active) {
      setDragPointer(null);
      return;
    }

    if (dragState.origin?.type !== "board") {
      return;
    }

    if (
      dragState.pointer?.boardX !== undefined &&
      dragState.pointer?.boardZ !== undefined
    ) {
      setDragPointer({
        x: dragState.pointer.boardX,
        z: dragState.pointer.boardZ,
      });
      return;
    }

    const originSquare = squareLayout[dragState.origin.squareIndex];
    if (!originSquare) {
      return;
    }

    setDragPointer({ x: originSquare.x, z: originSquare.z });
  }, [dragState.active, dragState.origin, dragState.pointer, squareLayout]);

  return (
    <group>
      <mesh
        position={[0, BOARD_DEPTH + TILE_DEPTH / 2 + 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(event) => {
          if (dragState.active) {
            setDragPointer({
              x: event.point.x,
              z: event.point.z,
            });
          }

          const hoverIndex = getSquareIndexFromPoint(
            event.point.x,
            event.point.z,
            playableSpan,
            tileSize
          );
          if (hoverIndex === null) {
            onSquareHoverEnd();
            return;
          }
          onSquareHover(hoverIndex);
        }}
        onPointerLeave={onSquareHoverEnd}
        onPointerCancel={onSquareHoverEnd}
      >
        <planeGeometry args={[playableSpan, playableSpan]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh geometry={boardGeometry} receiveShadow>
        <meshStandardMaterial
          color="#a68a64"
          roughness={0.55}
          metalness={0.03}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {dragState.active &&
      dragState.origin?.type === "board" &&
      dragPreview &&
      dragPointer ? (
        <DragPreviewCup
          x={dragPointer.x}
          z={dragPointer.z}
          size={dragPreview.size}
          color={dragPreview.color}
        />
      ) : null}

      {squareLayout.map((square, index) => {
        const isTarget = legalTargetSet.has(index);
        const isSelected =
          selected?.type === "board" && selected.squareIndex === index;
        const isHovered = dragState.active && dragState.hoverSquare === index;
        const hoveredLegal = isHovered && isTarget;

        return (
          <mesh
            key={`tile-${index}`}
            geometry={tileGeometry}
            position={[square.x, BOARD_DEPTH + TILE_DEPTH / 2 + 0.01, square.z]}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSquareClick(index);
            }}
          >
            <meshStandardMaterial
              color={isSelected ? "#e8e1d4" : isHovered ? "#f2e9db" : "#f8f4ed"}
              roughness={0.5}
              metalness={0.01}
              side={THREE.DoubleSide}
              emissive={
                isHovered
                  ? hoveredLegal
                    ? "#90a97b"
                    : "#a06f62"
                  : isTarget
                    ? "#7e9476"
                    : isSelected
                      ? "#8c7b6b"
                      : "#000000"
              }
              emissiveIntensity={
                isHovered ? (hoveredLegal ? 0.3 : 0.18) : isTarget ? 0.22 : isSelected ? 0.1 : 0
              }
            />
          </mesh>
        );
      })}

      {squareLayout.map((square, index) => {
        const cup = topPieces[index];
        if (!cup || index === draggedBoardSquare) {
          return null;
        }

        const isSelected =
          selected?.type === "board" && selected.squareIndex === index;

        return (
          <Cup3D
            key={`cup-${index}`}
            x={square.x}
            z={square.z}
            size={cup.size}
            color={cup.color}
            selected={isSelected}
            onPointerDown={(pointer) => onCupPointerDown(index, pointer)}
          />
        );
      })}
    </group>
  );
}

function Cup3D({ x, z, size, color, selected, onPointerDown }) {
  const spec = CUP_SPECS[size];
  const baseY = BOARD_DEPTH + TILE_DEPTH + spec.height / 2 + 0.015;
  const cupColor = color === "white" ? "#f5efe4" : "#302520";

  return (
    <group
      position={[x, baseY, z]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown({
          boardX: event.point.x,
          boardZ: event.point.z,
          x: event.nativeEvent.clientX,
          y: event.nativeEvent.clientY,
        });
      }}
    >
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[spec.radius, spec.radius, spec.height, 48]} />
        <meshStandardMaterial
          color={cupColor}
          roughness={0.48}
          metalness={0.02}
          emissive={selected ? "#8c7b6b" : "#000000"}
          emissiveIntensity={selected ? 0.12 : 0}
        />
      </mesh>
    </group>
  );
}

function DragPreviewCup({ x, z, size, color }) {
  const spec = CUP_SPECS[size];
  const baseY = BOARD_DEPTH + TILE_DEPTH + spec.height / 2 + 0.42;
  const cupColor = color === "white" ? "#f5efe4" : "#302520";

  return (
    <group position={[x, baseY, z]}>
      <mesh castShadow raycast={() => null}>
        <cylinderGeometry args={[spec.radius, spec.radius, spec.height, 48]} />
        <meshStandardMaterial
          color={cupColor}
          roughness={0.42}
          metalness={0.03}
          transparent
          opacity={0.88}
          emissive="#7f6c5c"
          emissiveIntensity={0.14}
        />
      </mesh>
    </group>
  );
}

function getSquareIndexFromPoint(x, z, playableSpan, tileSize) {
  const start = -playableSpan / 2;
  const end = playableSpan / 2;

  if (x < start || x > end || z < start || z > end) {
    return null;
  }

  const step = tileSize + TILE_GAP;
  const localX = x - start;
  const localZ = z - start;
  const col = Math.floor(localX / step);
  const row = Math.floor(localZ / step);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }

  const offsetX = localX - col * step;
  const offsetZ = localZ - row * step;
  if (offsetX > tileSize || offsetZ > tileSize) {
    return null;
  }

  return row * BOARD_SIZE + col;
}

function buildSquareLayout() {
  const layout = [];
  const playableSpan = BOARD_SPAN - TILE_PADDING * 2;
  const tileSize = (playableSpan - TILE_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;
  const start = -playableSpan / 2 + tileSize / 2;
  const step = tileSize + TILE_GAP;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      layout.push({
        x: start + col * step,
        z: start + row * step,
      });
    }
  }

  return layout;
}

function roundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + width, y + height - r);
  shape.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + height);
  shape.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, (Math.PI * 3) / 2, false);
  shape.closePath();

  return shape;
}

export default memo(Board3D);
