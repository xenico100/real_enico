import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  avatarConfigKey,
  type AvatarConfig,
  type EmoteId,
  type PlayerDirection,
  type PlayerSnapshot,
} from '@enico/protocol';
import { AVATAR_HEIGHT, AVATAR_WIDTH, drawAvatarFrame } from './avatarRenderer';
import type { ActiveEmote, FloatingMessage } from './useRealtimeWorld';

const DIRECTIONS: readonly PlayerDirection[] = ['north', 'south', 'east', 'west'];
const EMOTE_GLYPHS: Record<EmoteId, string> = {
  wave: 'HI!',
  heart: '♥',
  shock: '!!',
  spark: '✦',
};

function makeAvatarTexture(
  avatar: AvatarConfig,
  direction: PlayerDirection,
  step: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_WIDTH;
  canvas.height = AVATAR_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  drawAvatarFrame(context, avatar, direction, step);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

interface AvatarProps {
  player: PlayerSnapshot;
  current: boolean;
  selected: boolean;
  bubble: FloatingMessage | undefined;
  activeEmote: ActiveEmote | undefined;
  onSelect: (id: string) => void;
}

function PixelAvatar({ player, current, selected, bubble, activeEmote, onSelect }: AvatarProps) {
  const group = useRef<THREE.Group>(null);
  const sprite = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const targetPosition = useRef(new THREE.Vector3());
  const activeTextureKey = useRef('');
  const avatarKey = avatarConfigKey(player.avatar);
  const textures = useMemo(() => {
    const result = new Map<string, THREE.CanvasTexture>();
    for (const direction of DIRECTIONS) {
      result.set(`${direction}-0`, makeAvatarTexture(player.avatar, direction, 0));
      result.set(`${direction}-1`, makeAvatarTexture(player.avatar, direction, 1));
    }
    return result;
  }, [avatarKey]);

  useEffect(() => {
    activeTextureKey.current = '';
    return () => {
      for (const texture of textures.values()) texture.dispose();
    };
  }, [textures]);

  useFrame(({ clock }, delta) => {
    if (!group.current || !sprite.current) return;
    targetPosition.current.set(player.x, 0.02, player.z);
    group.current.position.lerp(targetPosition.current, 1 - Math.exp(-delta * 15));

    const step = player.moving ? Math.floor(clock.elapsedTime * 7) % 2 : 0;
    const textureKey = `${player.direction}-${step}`;
    if (activeTextureKey.current !== textureKey) {
      sprite.current.material.map = textures.get(textureKey) ?? null;
      sprite.current.material.needsUpdate = true;
      activeTextureKey.current = textureKey;
    }

    sprite.current.position.y =
      1.06 + (player.moving ? Math.abs(Math.sin(clock.elapsedTime * 14)) * 0.045 : 0);
    if (ring.current) {
      ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.06);
    }
  });

  return (
    <group
      ref={group}
      position={[player.x, 0.02, player.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(player.id);
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <circleGeometry args={[0.47, 16]} />
        <meshBasicMaterial color="#111218" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {(current || selected) ? (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.52, 0.59, 24]} />
          <meshBasicMaterial color={current ? '#b8001f' : '#f3e45d'} depthWrite={false} />
        </mesh>
      ) : null}
      <sprite ref={sprite} scale={[1.65, 2.06, 1]} position={[0, 1.06, 0]}>
        <spriteMaterial transparent alphaTest={0.15} depthWrite={false} />
      </sprite>
      <Html center position={[0, 2.08, 0]} zIndexRange={[30, 0]}>
        <button
          className={current ? 'world-name is-current' : 'world-name'}
          type="button"
          onClick={() => onSelect(player.id)}
        >
          {current ? 'YOU / ' : ''}{player.nickname}
        </button>
      </Html>
      {bubble ? (
        <Html center position={[0, 2.84, 0]} zIndexRange={[40, 0]}>
          <div className="world-bubble">{bubble.text}</div>
        </Html>
      ) : null}
      {activeEmote ? (
        <Html center position={[0.82, 2.15, 0]} zIndexRange={[45, 0]}>
          <div className={`world-emote emote-${activeEmote.emote}`}>
            {EMOTE_GLYPHS[activeEmote.emote]}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function Lamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 2.7, 8]} />
        <meshStandardMaterial color="#26272b" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.75, 0]} castShadow>
        <boxGeometry args={[0.38, 0.28, 0.38]} />
        <meshStandardMaterial color="#d9ff74" emissive="#9ab631" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Bench({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.18, 0.7]} />
        <meshStandardMaterial color="#25262a" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.85, 0.27]} castShadow>
        <boxGeometry args={[2.8, 0.72, 0.16]} />
        <meshStandardMaterial color="#3b3c40" roughness={0.7} />
      </mesh>
      {[-1.05, 1.05].map((offset) => (
        <mesh key={offset} position={[offset, 0.2, 0]} castShadow>
          <boxGeometry args={[0.12, 0.45, 0.55]} />
          <meshStandardMaterial color="#b8001f" />
        </mesh>
      ))}
    </group>
  );
}

function PlazaEnvironment() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[23, 23]} />
        <meshStandardMaterial color="#c9c7be" roughness={0.96} metalness={0.02} />
      </mesh>
      <gridHelper args={[22, 22, '#9d1028', '#aaa8a0']} position={[0, 0.012, 0]} />

      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.1, 1.1, 0.56, 8]} />
          <meshStandardMaterial color="#202126" roughness={0.72} />
        </mesh>
        <mesh position={[0, 2.2, 0]} castShadow>
          <boxGeometry args={[0.72, 3.85, 0.72]} />
          <meshStandardMaterial color="#b8001f" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0, 4.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <octahedronGeometry args={[0.72, 0]} />
          <meshStandardMaterial color="#ff3153" emissive="#b8001f" emissiveIntensity={0.8} />
        </mesh>
        <Html center position={[0, 3.2, 0]}>
          <div className="tower-label">VECK<br /><b>01</b></div>
        </Html>
      </group>

      <group position={[-8.6, 0, -2.5]}>
        <mesh position={[0, 1.45, 0]} castShadow>
          <boxGeometry args={[0.65, 2.9, 5.35]} />
          <meshStandardMaterial color="#222328" roughness={0.88} />
        </mesh>
        {[-1.7, 0, 1.7].map((offset, index) => (
          <mesh key={offset} position={[-0.34, 1.55, offset]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[1.25, 1.75]} />
            <meshBasicMaterial color={index === 1 ? '#b8001f' : index === 0 ? '#e8e3d6' : '#a9c927'} />
          </mesh>
        ))}
      </group>

      <group position={[8.2, 0, -4.7]}>
        {[-0.75, 0.75].map((offset, index) => (
          <group key={offset} position={[0, 0, offset]}>
            <mesh position={[0, 1.15, 0]} castShadow>
              <boxGeometry args={[1.35, 2.3, 1.35]} />
              <meshStandardMaterial color={index ? '#303e46' : '#92132a'} roughness={0.55} metalness={0.2} />
            </mesh>
            <mesh position={[-0.69, 1.35, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[0.78, 0.65]} />
              <meshBasicMaterial color={index ? '#7ad6ec' : '#ffd465'} />
            </mesh>
          </group>
        ))}
      </group>

      <Bench x={-4.6} z={-6.8} />
      <Bench x={4.8} z={6.8} rotation={Math.PI} />

      <group position={[-6.8, 0, 6.4]}>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[1.9, 2, 1.9]} />
          <meshStandardMaterial color="#dedbd1" roughness={0.82} />
        </mesh>
        <mesh position={[0, 1.2, -0.96]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.35, 0.85]} />
          <meshBasicMaterial color="#17181c" />
        </mesh>
        <mesh position={[0, 2.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <boxGeometry args={[1.5, 0.25, 1.5]} />
          <meshStandardMaterial color="#b8001f" />
        </mesh>
      </group>

      <Lamp x={-9.6} z={8.8} />
      <Lamp x={9.6} z={8.8} />
      <Lamp x={-9.6} z={-8.8} />
      <Lamp x={9.6} z={-8.8} />

      {[-11.25, 11.25].map((x) => (
        <mesh key={`wall-x-${x}`} position={[x, 0.16, 0]} receiveShadow>
          <boxGeometry args={[0.28, 0.32, 23]} />
          <meshStandardMaterial color="#4b4c4d" />
        </mesh>
      ))}
      {[-11.25, 11.25].map((z) => (
        <mesh key={`wall-z-${z}`} position={[0, 0.16, z]} receiveShadow>
          <boxGeometry args={[23, 0.32, 0.28]} />
          <meshStandardMaterial color="#4b4c4d" />
        </mesh>
      ))}
    </group>
  );
}

interface WorldSceneProps {
  players: PlayerSnapshot[];
  currentPlayerId: string | null;
  selectedPlayerId: string | null;
  bubbles: Record<string, FloatingMessage>;
  emotes: Record<string, ActiveEmote>;
  onSelectPlayer: (id: string) => void;
}

export function WorldScene({
  players,
  currentPlayerId,
  selectedPlayerId,
  bubbles,
  emotes,
  onSelectPlayer,
}: WorldSceneProps) {
  return (
    <div className="world-canvas" data-testid="world-canvas">
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.25]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [12.5, 15.5, 12.5], zoom: 48, near: 0.1, far: 100 }}
        onPointerMissed={() => onSelectPlayer('')}
      >
        <color attach="background" args={['#b9b7ae']} />
        <fog attach="fog" args={['#b9b7ae', 20, 39]} />
        <ambientLight intensity={1.25} />
        <directionalLight
          castShadow
          color="#fff1dc"
          intensity={2.1}
          position={[7, 15, 4]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />
        <hemisphereLight color="#fff5e8" groundColor="#4d5360" intensity={0.55} />
        <CameraRig />
        <PlazaEnvironment />
        {players.map((player) => (
          <PixelAvatar
            key={player.id}
            player={player}
            current={player.id === currentPlayerId}
            selected={player.id === selectedPlayerId}
            bubble={bubbles[player.id]}
            activeEmote={emotes[player.id]}
            onSelect={onSelectPlayer}
          />
        ))}
      </Canvas>
      <div className="canvas-vignette" />
      <div className="map-stamp">MAP / VECK PLAZA 01</div>
    </div>
  );
}
