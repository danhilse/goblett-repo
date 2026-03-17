import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const BOARD_SIZE = 4;
const BOARD_SPAN = 5.2;
const BOARD_DEPTH = 0.6;
const BOARD_RADIUS = 0.32;
const TILE_GAP = 0.12;
const TILE_PADDING = 0.36;
const TILE_DEPTH = 0.07;
const CAMERA_INTRO_DURATION_MS = 2400;
const CAMERA_ISOMETRIC_POSITION = new THREE.Vector3(7.8, 8.2, 7.8);
const CAMERA_LOOK_AT = new THREE.Vector3(0, 0.3, 0);
const CAMERA_START_RADIUS = 14.2;
const CAMERA_START_PHI = THREE.MathUtils.degToRad(12);
const CAMERA_START_THETA = THREE.MathUtils.degToRad(-120);

const CUP_SPECS = {
  1: { radius: 0.14, height: 0.46 },
  2: { radius: 0.24, height: 0.56 },
  3: { radius: 0.34, height: 0.66 },
  4: { radius: 0.46, height: 0.76 },
};

function Board3D({
  board,
  legalTargetSet,
  movableSquareSet,
  selected,
  dragState,
  dragPreview,
  introSequence,
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
      <SceneCamera introSequence={introSequence} />
      <color attach="background" args={["#fcf8f1"]} />
      <ambientLight intensity={0.86} />
      <hemisphereLight args={["#fff9ef", "#b8a791", 0.74]} />
      <directionalLight
        position={[4.5, 9, 5]}
        intensity={1.08}
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
      <directionalLight position={[-4, 4, -3]} intensity={0.62} />
      <BoardGroup
        board={board}
        legalTargetSet={legalTargetSet}
        movableSquareSet={movableSquareSet}
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
        <shadowMaterial transparent opacity={0.15} />
      </mesh>
    </Canvas>
  );
}

function SceneCamera({ introSequence }) {
  const { camera } = useThree();
  const animateIntroRef = useRef(false);
  const introStartTimeRef = useRef(-1);
  const endSphericalRef = useRef({ radius: 0, phi: 0, theta: 0 });
  const workingSphericalRef = useRef(new THREE.Spherical());

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const cameraOffset = CAMERA_ISOMETRIC_POSITION.clone().sub(CAMERA_LOOK_AT);
    workingSphericalRef.current.setFromVector3(cameraOffset);
    endSphericalRef.current = {
      radius: workingSphericalRef.current.radius,
      phi: workingSphericalRef.current.phi,
      theta: workingSphericalRef.current.theta,
    };

    if (prefersReducedMotion) {
      animateIntroRef.current = false;
      introStartTimeRef.current = -1;
      camera.position.copy(CAMERA_ISOMETRIC_POSITION);
      camera.lookAt(CAMERA_LOOK_AT);
      camera.updateProjectionMatrix();
      return;
    }

    animateIntroRef.current = true;
    introStartTimeRef.current = -1;
    workingSphericalRef.current.set(
      CAMERA_START_RADIUS,
      CAMERA_START_PHI,
      CAMERA_START_THETA
    );
    camera.position
      .setFromSpherical(workingSphericalRef.current)
      .add(CAMERA_LOOK_AT);
    camera.lookAt(CAMERA_LOOK_AT);
    camera.updateProjectionMatrix();
  }, [camera, introSequence]);

  useFrame((state) => {
    if (!animateIntroRef.current) {
      return;
    }

    if (introStartTimeRef.current < 0) {
      introStartTimeRef.current = state.clock.elapsedTime;
    }

    const elapsedMs = (state.clock.elapsedTime - introStartTimeRef.current) * 1000;
    const progress = Math.min(elapsedMs / CAMERA_INTRO_DURATION_MS, 1);
    const eased = easeInOutQuint(progress);

    const radius = THREE.MathUtils.lerp(
      CAMERA_START_RADIUS,
      endSphericalRef.current.radius,
      eased
    );
    const phi = THREE.MathUtils.lerp(
      CAMERA_START_PHI,
      endSphericalRef.current.phi,
      eased
    );
    const theta = THREE.MathUtils.lerp(
      CAMERA_START_THETA,
      endSphericalRef.current.theta,
      eased
    );
    workingSphericalRef.current.set(radius, phi, theta);
    camera.position
      .setFromSpherical(workingSphericalRef.current)
      .add(CAMERA_LOOK_AT);
    camera.lookAt(CAMERA_LOOK_AT);

    if (progress >= 1) {
      animateIntroRef.current = false;
      camera.position.copy(CAMERA_ISOMETRIC_POSITION);
      camera.lookAt(CAMERA_LOOK_AT);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function easeInOutQuint(value) {
  if (value < 0.5) {
    return 16 * value ** 5;
  }
  return 1 - ((-2 * value + 2) ** 5) / 2;
}

function BoardGroup({
  board,
  legalTargetSet,
  movableSquareSet,
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
  const targetDiscGeometry = useMemo(
    () => new THREE.CircleGeometry(tileSize * 0.16, 28),
    [tileSize]
  );
  const targetRingGeometry = useMemo(
    () => new THREE.RingGeometry(tileSize * 0.22, tileSize * 0.3, 36),
    [tileSize]
  );

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
  const hoveredDropSquare =
    dragState.active &&
    dragState.hoverSquare !== null &&
    legalTargetSet.has(dragState.hoverSquare)
      ? dragState.hoverSquare
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
          color="#b89461"
          roughness={0.48}
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
      dragPointer &&
      hoveredDropSquare === null ? (
        <DragPreviewCup
          x={dragPointer.x}
          z={dragPointer.z}
          size={dragPreview.size}
          color={dragPreview.color}
        />
      ) : null}
      {dragState.active && dragPreview && hoveredDropSquare !== null ? (
        <DropProjectionCup
          x={squareLayout[hoveredDropSquare].x}
          z={squareLayout[hoveredDropSquare].z}
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
          <group key={`tile-${index}`}>
            <mesh
              geometry={tileGeometry}
              position={[square.x, BOARD_DEPTH + TILE_DEPTH / 2 + 0.01, square.z]}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSquareClick(index);
              }}
            >
              <meshStandardMaterial
                color={isSelected ? "#f0e3d1" : isHovered ? "#faf0df" : "#fff9ee"}
                roughness={0.42}
                metalness={0.01}
                side={THREE.DoubleSide}
                emissive={
                  isHovered
                    ? hoveredLegal
                      ? "#709c8d"
                      : "#a06a5b"
                    : isTarget
                      ? "#638b7d"
                      : isSelected
                        ? "#8b7159"
                        : "#000000"
                }
                emissiveIntensity={
                  isHovered
                    ? hoveredLegal
                      ? 0.4
                      : 0.24
                    : isTarget
                      ? 0.28
                      : isSelected
                        ? 0.15
                        : 0
                }
              />
            </mesh>
            {isTarget ? (
              <>
                <mesh
                  geometry={targetDiscGeometry}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[square.x, BOARD_DEPTH + TILE_DEPTH + 0.018, square.z]}
                  raycast={() => null}
                >
                  <meshBasicMaterial
                    color={hoveredLegal ? "#a4ccbe" : "#769f92"}
                    transparent
                    opacity={hoveredLegal ? 0.74 : 0.44}
                    depthWrite={false}
                  />
                </mesh>
                <mesh
                  geometry={targetRingGeometry}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[square.x, BOARD_DEPTH + TILE_DEPTH + 0.02, square.z]}
                  raycast={() => null}
                >
                  <meshBasicMaterial
                    color={hoveredLegal ? "#d6eee6" : "#9abfb3"}
                    transparent
                    opacity={hoveredLegal ? 0.94 : 0.6}
                    depthWrite={false}
                  />
                </mesh>
              </>
            ) : null}
          </group>
        );
      })}

      {squareLayout.map((square, index) => {
        const cup = topPieces[index];
        if (!cup || index === draggedBoardSquare) {
          return null;
        }

        const isSelected =
          selected?.type === "board" && selected.squareIndex === index;
        const isPickable = movableSquareSet.has(index);

        return (
          <Cup3D
            key={`cup-${index}`}
            x={square.x}
            z={square.z}
            size={cup.size}
            color={cup.color}
            selected={isSelected}
            pickable={isPickable}
            onPointerDown={(pointer) => onCupPointerDown(index, pointer)}
          />
        );
      })}
    </group>
  );
}

function Cup3D({ x, z, size, color, selected, pickable, onPointerDown }) {
  const spec = CUP_SPECS[size];
  const baseY = BOARD_DEPTH + TILE_DEPTH + spec.height / 2 + 0.015;
  const cupColor = color === "white" ? "#fff6e8" : "#261d17";
  const pickupGlow = pickable && !selected;

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
          roughness={0.42}
          metalness={0.02}
          emissive={selected ? "#89694d" : pickupGlow ? "#638f82" : "#000000"}
          emissiveIntensity={selected ? 0.18 : pickupGlow ? 0.22 : 0}
        />
      </mesh>
      {pickupGlow ? (
        <mesh
          position={[0, -spec.height / 2 + 0.012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[spec.radius + 0.045, spec.radius + 0.075, 48]} />
          <meshBasicMaterial
            color="#91baad"
            transparent
            opacity={0.66}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function DropProjectionCup({ x, z, size, color }) {
  const spec = CUP_SPECS[size];
  const baseY = BOARD_DEPTH + TILE_DEPTH + spec.height / 2 + 0.12;
  const cupColor = color === "white" ? "#fff6e8" : "#261d17";

  return (
    <group position={[x, baseY, z]}>
      <mesh
        position={[0, -spec.height / 2 + 0.008, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[spec.radius + 0.05, spec.radius + 0.1, 48]} />
        <meshBasicMaterial
          color="#e7f4d5"
          transparent
          opacity={0.96}
          depthWrite={false}
        />
      </mesh>
      <mesh castShadow={false} raycast={() => null}>
        <cylinderGeometry args={[spec.radius, spec.radius, spec.height, 48]} />
        <meshStandardMaterial
          color={cupColor}
          roughness={0.38}
          metalness={0.02}
          transparent
          opacity={0.84}
          emissive="#95beaf"
          emissiveIntensity={0.34}
        />
      </mesh>
    </group>
  );
}

function DragPreviewCup({ x, z, size, color }) {
  const spec = CUP_SPECS[size];
  const baseY = BOARD_DEPTH + TILE_DEPTH + spec.height / 2 + 0.42;
  const cupColor = color === "white" ? "#fff6e8" : "#261d17";

  return (
    <group position={[x, baseY, z]}>
      <mesh castShadow raycast={() => null}>
        <cylinderGeometry args={[spec.radius, spec.radius, spec.height, 48]} />
        <meshStandardMaterial
          color={cupColor}
          roughness={0.36}
          metalness={0.03}
          transparent
          opacity={0.95}
          emissive="#8a6f55"
          emissiveIntensity={0.2}
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
