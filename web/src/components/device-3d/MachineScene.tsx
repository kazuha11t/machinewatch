import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type * as THREE from 'three';
import { HEALTH_STYLES } from '../../lib/format';
import type { HealthStatus } from '../../lib/types';

const UPDATE_INTERVAL_S = 1 / 4;
/** Discrete temperature bands (not a continuous gradient) — matches the health-status colour system. */
const TEMP_WARN = 70;
const TEMP_HOT = 85;

function temperatureColor(temperature: number | null | undefined): string {
  if (temperature === null || temperature === undefined) return '#eaeaea';
  if (temperature >= TEMP_HOT) return '#ff2a2a';
  if (temperature >= TEMP_WARN) return '#d9a441';
  return '#eaeaea';
}

function MachineBody({ temperature, vibration, running }: { temperature: number | null | undefined; vibration: number | null | undefined; running: boolean }) {
  const group = useRef<THREE.Group>(null!);
  const acc = useRef(0);
  const color = temperatureColor(temperature);

  useFrame((_state, delta) => {
    if (!group.current) return;
    acc.current += delta;
    if (acc.current < UPDATE_INTERVAL_S) return;
    acc.current = 0;
    if (running && vibration) {
      const amp = Math.min(vibration, 12) * 0.01;
      group.current.position.x = (Math.random() - 0.5) * amp;
      group.current.position.z = (Math.random() - 0.5) * amp;
      group.current.rotation.z = (Math.random() - 0.5) * amp * 0.4;
    } else {
      group.current.position.x = 0;
      group.current.position.z = 0;
      group.current.rotation.z = 0;
    }
  });

  return (
    <group ref={group}>
      {/* Base plate */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[2.2, 0.3, 1.4]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Motor housing */}
      <mesh position={[-0.3, 0.75, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.9, 20]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Coupling / shaft housing */}
      <mesh position={[0.75, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 16]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.5} metalness={0.35} />
      </mesh>
      {/* Feet */}
      {[-0.85, 0.85].map((x) =>
        [-0.55, 0.55].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.05, z]}>
            <boxGeometry args={[0.25, 0.1, 0.25]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
        )),
      )}
    </group>
  );
}

function HealthGauge({ score, status }: { score: number | null; status: HealthStatus | null }) {
  const fraction = score === null ? 0 : Math.min(Math.max(score, 0), 100) / 100;
  const color = status ? HEALTH_STYLES[status].stroke : '#7a7a7a';
  const arc = Math.max(fraction * Math.PI * 2, 0.001);

  return (
    <group position={[2.1, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.65, 0.05, 12, 48]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.7} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.65, 0.07, 12, 48, arc]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.4} />
      </mesh>
    </group>
  );
}

export default function MachineScene({
  temperature,
  vibration,
  running,
  healthScore,
  healthStatus,
  active,
}: {
  temperature: number | null | undefined;
  vibration: number | null | undefined;
  running: boolean;
  healthScore: number | null;
  healthStatus: HealthStatus | null;
  active: boolean;
}) {
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<number>(0);

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}
      camera={{ position: [3.2, 2.4, 3.6], fov: 40 }}
      frameloop={active ? 'always' : 'never'}
      onCreated={({ gl }) => gl.setClearColor('#0a0a0a')}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={0.9} />
      <MachineBody temperature={temperature} vibration={vibration} running={running} />
      <HealthGauge score={healthScore} status={healthStatus} />
      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={9}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={idle}
        autoRotateSpeed={0.8}
        onStart={() => {
          window.clearTimeout(idleTimer.current);
          setIdle(false);
        }}
        onEnd={() => {
          idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
        }}
      />
    </Canvas>
  );
}
