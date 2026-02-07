import { Canvas, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";

const BOARD_SIZE = 4;
const BOARD_SPAN = 5.2;
const BOARD_DEPTH = 0.6;
const BOARD_RADIUS = 0.32;
const TILE_GAP = 0.12;
const TILE_PADDING = 0.36;
const TILE_DEPTH = 0.07;

const CUP_SPECS = {
  1: { radius: 0.14, height: 0.18 },
  2: { radius: 0.24, height: 0.3 },
  3: { radius: 0.34, height: 0.46 },
  4: { radius: 0.46, height: 0.66 },
};

function Board3D({ board, legalTargetSet, selected, onSquareClick }) {
  return (
    <Canvas
      shadows
      orthographic
      camera={{ zoom: 74, near: 0.1, far: 80 }}
      gl={{ antialias: true }}
      dpr={[1, 1.8]}
    >
      <SceneCamera />
      <color attach="background" args={["#f5f0ea"]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#f5f0ea", "#ddd5c8", 0.5]} />
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
        onSquareClick={onSquareClick}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow>
        <planeGeometry args={[13, 13]} />
        <shadowMaterial transparent opacity={0.06} />
      </mesh>
    </Canvas>
  );
}

function SceneCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(7.8, 8.2, 7.8);
    camera.lookAt(0, 0.5, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function BoardGroup({ board, legalTargetSet, selected, onSquareClick }) {
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
    const playableSpan = BOARD_SPAN - TILE_PADDING * 2;
    const tileSize = (playableSpan - TILE_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;
    const geometry = new THREE.BoxGeometry(tileSize, TILE_DEPTH, tileSize, 1, 1, 1);
    return geometry;
  }, []);

  const squareLayout = useMemo(() => buildSquareLayout(), []);
  const topPieces = useMemo(
    () => board.map((stack) => (stack.length ? stack[stack.length - 1] : null)),
    [board]
  );

  return (
    <group>
      <mesh geometry={boardGeometry} receiveShadow>
        <meshStandardMaterial
          color="#c4a882"
          roughness={0.58}
          metalness={0.02}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {squareLayout.map((square, index) => {
        const isTarget = legalTargetSet.has(index);
        const isSelected =
          selected?.type === "board" && selected.squareIndex === index;

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
              color={isSelected ? "#ece5d8" : "#f3ede3"}
              roughness={0.5}
              metalness={0.01}
              side={THREE.DoubleSide}
              emissive={isTarget ? "#7e9476" : isSelected ? "#8c7b6b" : "#000000"}
              emissiveIntensity={isTarget ? 0.22 : isSelected ? 0.1 : 0}
            />
          </mesh>
        );
      })}

      {squareLayout.map((square, index) => {
        const cup = topPieces[index];
        if (!cup) {
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
            onClick={() => onSquareClick(index)}
          />
        );
      })}
    </group>
  );
}

function Cup3D({ x, z, size, color, selected, onClick }) {
  const spec = CUP_SPECS[size];
  const baseY = BOARD_DEPTH + TILE_DEPTH + spec.height / 2 + 0.015;
  const cupColor = color === "white" ? "#ebe4d6" : "#4a3f34";

  return (
    <group
      position={[x, baseY, z]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onClick();
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
