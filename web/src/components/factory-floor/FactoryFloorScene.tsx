import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Html, OrbitControls } from '@react-three/drei';
import { useNavigate } from 'react-router';
import type * as THREE from 'three';
import { HEALTH_STYLES } from '../../lib/format';
import type { Device, Reading } from '../../lib/types';

const COLUMNS = 4;
const SPACING = 2.4;
/** Scene state (jitter, blink) recomputes at most this often — a HUD readout, not a physics sim. */
const UPDATE_INTERVAL_S = 1 / 4;

interface MachineBlockProps {
  device: Device;
  reading?: Reading;
  position: [number, number, number];
  onSelect(id: string): void;
}

function MachineBlock({ device, reading, position, onSelect }: MachineBlockProps) {
  const group = useRef<THREE.Group>(null!);
  const mesh = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const acc = useRef(0);

  const offline = device.status === 'offline';
  const stopped = !offline && (device.relayState === false || reading?.running === false);
  const critical = !offline && device.healthStatus === 'critical';
  const vibration = reading?.vibration ?? 0;

  const baseColor = offline || stopped ? '#2b2b2b' : device.healthStatus ? HEALTH_STYLES[device.healthStatus].stroke : '#eaeaea';

  useFrame((state, delta) => {
    if (!group.current) return;
    acc.current += delta;
    if (acc.current < UPDATE_INTERVAL_S) return;
    acc.current = 0;
    const t = state.clock.elapsedTime;

    if (!offline && !stopped && vibration > 0) {
      const amp = Math.min(vibration, 12) * 0.006;
      group.current.position.x = position[0] + (Math.random() - 0.5) * amp * 2;
      group.current.position.z = position[2] + (Math.random() - 0.5) * amp * 2;
    } else {
      group.current.position.x = position[0];
      group.current.position.z = position[2];
    }

    if (critical && mesh.current) {
      const mat = mesh.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 6)) * 1.2;
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh
        ref={mesh}
        position={[0, 0.5, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(device.id);
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={critical ? '#ff2a2a' : '#000000'}
          emissiveIntensity={critical ? 0.6 : 0}
          roughness={0.65}
          metalness={0.1}
          opacity={offline ? 0.45 : 1}
          transparent={offline}
        />
      </mesh>
      {hovered && (
        <Html position={[0, 1.35, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="label border border-line bg-panel px-2 py-1 text-[10px] whitespace-nowrap text-foreground">
            {device.name}
            <span className="ml-1.5 text-muted">{device.healthScore === null ? '—' : Math.round(device.healthScore)}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Rig({ reducedMotion }: { reducedMotion: boolean }) {
  const idleTimer = useRef<number>(0);
  const [idle, setIdle] = useState(true);

  const onStart = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    setIdle(false);
  }, []);
  const onEnd = useCallback(() => {
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  return (
    <OrbitControls
      enablePan={false}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.2}
      minDistance={6}
      maxDistance={16}
      autoRotate={!reducedMotion && idle}
      autoRotateSpeed={0.6}
      onStart={onStart}
      onEnd={onEnd}
    />
  );
}

export default function FactoryFloorScene({
  devices,
  latest,
  reducedMotion,
  active,
}: {
  devices: Device[];
  latest: Record<string, Reading>;
  reducedMotion: boolean;
  active: boolean;
}) {
  const navigate = useNavigate();
  const onSelect = useCallback((id: string) => navigate(`/devices/${id}`), [navigate]);

  const rows = Math.max(1, Math.ceil(devices.length / COLUMNS));
  const positions = devices.map((_, index): [number, number, number] => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = (col - (COLUMNS - 1) / 2) * SPACING;
    const z = row * SPACING - ((rows - 1) * SPACING) / 2;
    return [x, 0, z];
  });

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}
      camera={{ position: [7, 6, 9], fov: 42 }}
      frameloop={active ? 'always' : 'never'}
      onCreated={({ gl }) => gl.setClearColor('#0a0a0a')}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={0.8} />
      <Grid
        args={[40, 40]}
        cellSize={SPACING / 2}
        cellColor="#1f1f1f"
        sectionSize={SPACING * 2}
        sectionColor="#333333"
        fadeDistance={22}
        fadeStrength={1.5}
        infiniteGrid
      />
      {devices.map((device, index) => (
        <MachineBlock key={device.id} device={device} reading={latest[device.id]} position={positions[index]!} onSelect={onSelect} />
      ))}
      <Rig reducedMotion={reducedMotion} />
    </Canvas>
  );
}
