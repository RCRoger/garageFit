import { useEffect, useRef, useState } from 'react';
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { useSimulationStore } from '@/stores/simulationStore';
import { useFitAnalysis } from '@/hooks/useFitAnalysis';
import type { Obstacle } from '@/types/domain';
import { approachCorridor } from '@/domain/maneuver/maneuver';

const PAD = 64;

interface PanGesture {
  pointerX: number;
  pointerY: number;
  panX: number;
  panY: number;
}

function obstacleWithPosition(obstacle: Obstacle, x: number, y: number): Obstacle {
  return { ...obstacle, x, y };
}

export function SimulatorCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const panGesture = useRef<PanGesture | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const {
    spot, vehicle, placement, obstacles, maneuverSettings, maneuverResult, showGrid, showDimensions, snapToGrid, gridSize,
    setPlacement, updateObstacle, setView,
  } = useSimulationStore();
  const analysis = useFitAnalysis();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const corridor = maneuverResult ? approachCorridor(spot, spot.entrance, maneuverSettings) : null;
  const sceneMinX = corridor ? Math.min(0, ...corridor.map((p) => p.x)) : 0;
  const sceneMinY = corridor ? Math.min(0, ...corridor.map((p) => p.y)) : 0;
  const sceneMaxX = corridor ? Math.max(spot.width, ...corridor.map((p) => p.x)) : spot.width;
  const sceneMaxY = corridor ? Math.max(spot.length, ...corridor.map((p) => p.y)) : spot.length;
  const sceneWidth = sceneMaxX - sceneMinX;
  const sceneHeight = sceneMaxY - sceneMinY;
  // Fit the parking bay; include the approach lane only when a maneuver result is being shown.
  const k = Math.max(0.05, Math.min((size.w - PAD * 2) / sceneWidth, (size.h - PAD * 2) / sceneHeight));
  const baseX = (size.w - sceneWidth * k) / 2 - sceneMinX * k;
  const baseY = (size.h - sceneHeight * k) / 2 - sceneMinY * k;
  const scale = k * zoom;
  const layerX = baseX + pan.x;
  const layerY = baseY + pan.y;
  const gridLines: number[][] = [];
  if (showGrid && gridSize >= 1 && spot.width / gridSize < 400 && spot.length / gridSize < 400) {
    for (let x = 0; x <= spot.width; x += gridSize) gridLines.push([x, 0, x, spot.length]);
    for (let y = 0; y <= spot.length; y += gridSize) gridLines.push([0, y, spot.width, y]);
  }

  const color =
    analysis?.status === 'ok' ? '#10b981' : analysis?.status === 'limited' ? '#f59e0b' : analysis ? '#ef4444' : '#94a3b8';
  const snap = (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : v);

  const zoomAt = (nextZoom: number, pointer?: { x: number; y: number }) => {
    const next = Math.max(0.5, Math.min(4, nextZoom));
    if (pointer) {
      const ratio = next / zoom;
      setPan({
        x: pointer.x - baseX - (pointer.x - baseX - pan.x) * ratio,
        y: pointer.y - baseY - (pointer.y - baseY - pan.y) * ratio,
      });
    }
    setZoom(next);
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    zoomAt(zoom * (e.evt.deltaY > 0 ? 0.9 : 1.1), pointer);
  };

  const beginPan = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!e.evt.shiftKey || e.target !== e.target.getStage()) return;
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    panGesture.current = { pointerX: pointer.x, pointerY: pointer.y, panX: pan.x, panY: pan.y };
    setPanning(true);
    e.evt.preventDefault();
  };
  const movePan = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const start = panGesture.current;
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!start || !pointer) return;
    setPan({ x: start.panX + pointer.x - start.pointerX, y: start.panY + pointer.y - start.pointerY });
  };
  const endPan = () => {
    panGesture.current = null;
    setPanning(false);
  };

  const carW = vehicle.bodyWidth;
  const carL = vehicle.length;
  const bodyShape = [
    -carW * 0.3, -carL / 2,
    carW * 0.3, -carL / 2,
    carW * 0.44, -carL * 0.39,
    carW * 0.48, -carL * 0.25,
    carW * 0.5, carL * 0.25,
    carW * 0.43, carL * 0.41,
    carW * 0.3, carL / 2,
    -carW * 0.3, carL / 2,
    -carW * 0.43, carL * 0.41,
    -carW * 0.5, carL * 0.25,
    -carW * 0.48, -carL * 0.25,
    -carW * 0.44, -carL * 0.39,
  ];

  return (
    <div id="simulator-canvas" ref={ref} className={`relative h-full w-full overflow-hidden bg-white ${panning ? 'cursor-grabbing' : 'cursor-default'}`}>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded border border-slate-200 bg-white/95 p-1 shadow-sm">
        <button aria-label="Alejar" title="Alejar" onClick={() => zoomAt(zoom / 1.2)} className="rounded px-2 py-1 text-sm hover:bg-slate-100">−</button>
        <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button aria-label="Acercar" title="Acercar" onClick={() => zoomAt(zoom * 1.2)} className="rounded px-2 py-1 text-sm hover:bg-slate-100">+</button>
        <button title="Restablecer vista" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded px-2 py-1 text-xs hover:bg-slate-100">Ajustar</button>
        <button
          title="Mostrar u ocultar cotas"
          onClick={() => setView({ showDimensions: !showDimensions })}
          className={`rounded px-2 py-1 text-xs ${showDimensions ? 'bg-slate-100' : ''}`}
        >Cotas</button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 z-10 rounded bg-white/90 px-2 py-1 text-[11px] text-slate-500">
        Rueda: zoom · Mayús + arrastrar: desplazar · Arrastra el coche o los obstáculos
      </div>
      <Stage
        width={size.w}
        height={size.h}
        onWheel={onWheel}
        onMouseDown={beginPan}
        onMouseMove={movePan}
        onMouseUp={endPan}
        onMouseLeave={endPan}
      >
        <Layer x={layerX} y={layerY} scaleX={scale} scaleY={scale}>
          {corridor && (
            <Rect
              x={Math.min(...corridor.map((p) => p.x))}
              y={Math.min(...corridor.map((p) => p.y))}
              width={Math.max(...corridor.map((p) => p.x)) - Math.min(...corridor.map((p) => p.x))}
              height={Math.max(...corridor.map((p) => p.y)) - Math.min(...corridor.map((p) => p.y))}
              fill="#f1f5f9"
              stroke="#94a3b8"
              strokeWidth={2 / scale}
              dash={[8 / scale, 5 / scale]}
              listening={false}
            />
          )}
          {gridLines.map((p, i) => (
            <Line key={`grid-${i}`} points={p} stroke="#e2e8f0" strokeWidth={1 / scale} listening={false} />
          ))}
          <Rect width={spot.width} height={spot.length} stroke="#334155" strokeWidth={3 / scale} fill="rgba(148,163,184,0.08)" listening={false} />
          {corridor && (
            <Text
              text={`Pasillo · ${maneuverSettings.corridorWidth} cm`}
              x={Math.min(...corridor.map((p) => p.x))}
              y={Math.min(...corridor.map((p) => p.y)) + 6 / scale}
              width={Math.max(...corridor.map((p) => p.x)) - Math.min(...corridor.map((p) => p.x))}
              align="center"
              fontSize={12 / scale}
              fill="#64748b"
              listening={false}
            />
          )}
          {showDimensions && (
            <>
              <Line points={[0, -9 / scale, spot.width, -9 / scale]} stroke="#64748b" strokeWidth={1 / scale} listening={false} />
              <Line points={[0, -14 / scale, 0, -4 / scale, spot.width, -4 / scale, spot.width, -14 / scale]} stroke="#64748b" strokeWidth={1 / scale} listening={false} />
              <Text text={`${spot.width} cm`} x={0} y={-30 / scale} width={spot.width} align="center" fontSize={13 / scale} fill="#475569" listening={false} />
              <Line points={[spot.width + 10 / scale, 0, spot.width + 10 / scale, spot.length]} stroke="#64748b" strokeWidth={1 / scale} listening={false} />
              <Line points={[spot.width + 5 / scale, 0, spot.width + 15 / scale, 0, spot.width + 15 / scale, spot.length, spot.width + 5 / scale, spot.length]} stroke="#64748b" strokeWidth={1 / scale} listening={false} />
              <Text text={`${spot.length} cm`} x={spot.width + 17 / scale} y={spot.length / 2} fontSize={13 / scale} fill="#475569" listening={false} />
            </>
          )}

          {analysis?.doorResults.map((door) => (
            <Group key={door.id} listening={false}>
              <Line
                points={door.sweptArea.flatMap((point) => [point.x, point.y])}
                closed
                fill={door.status === 'clear' ? '#22c55e' : '#ef4444'}
                opacity={0.16}
                stroke={door.status === 'clear' ? '#16a34a' : '#dc2626'}
                strokeWidth={1.5 / scale}
                dash={[5 / scale, 3 / scale]}
              />
              <Line
                points={door.finalLeaf.flatMap((point) => [point.x, point.y])}
                closed
                fill={door.status === 'clear' ? '#22c55e' : '#ef4444'}
                opacity={0.45}
                stroke={door.status === 'clear' ? '#15803d' : '#b91c1c'}
                strokeWidth={1 / scale}
              />
            </Group>
          ))}

          {obstacles.map((obstacle, index) => {
            const fill = analysis?.collidingObstacleIds.includes(obstacle.id) ? '#ef4444' : '#64748b';
            const common = {
              key: obstacle.id,
              fill,
              opacity: 0.72,
              stroke: '#334155',
              strokeWidth: 1.5 / scale,
              draggable: true,
              onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
                e.target.x(snap(e.target.x()));
                e.target.y(snap(e.target.y()));
              },
              onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
                updateObstacle(obstacle.id, (current) =>
                  obstacleWithPosition(current, snap(e.target.x()), snap(e.target.y()))),
            };
            return (
              <Group key={obstacle.id}>
                {obstacle.shape === 'rect' ? (
                  <Rect x={obstacle.x} y={obstacle.y} width={obstacle.width} height={obstacle.height} {...common} />
                ) : (
                  <Circle x={obstacle.x} y={obstacle.y} radius={obstacle.radius} {...common} />
                )}
                <Text
                  text={obstacle.kind === 'wall' ? 'Muro' : `O${index + 1}`}
                  x={obstacle.shape === 'rect' ? obstacle.x : obstacle.x - obstacle.radius}
                  y={obstacle.shape === 'rect' ? obstacle.y : obstacle.y - obstacle.radius}
                  width={obstacle.shape === 'rect' ? obstacle.width : obstacle.radius * 2}
                  height={obstacle.shape === 'rect' ? obstacle.height : obstacle.radius * 2}
                  align="center"
                  verticalAlign="middle"
                  fontSize={11 / scale}
                  fill="white"
                  listening={false}
                />
              </Group>
            );
          })}

          {analysis?.nearestObstacle && (
            <>
              <Line
                points={[
                  analysis.nearestObstacle.start.x,
                  analysis.nearestObstacle.start.y,
                  analysis.nearestObstacle.end.x,
                  analysis.nearestObstacle.end.y,
                ]}
                stroke="#2563eb"
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
                listening={false}
              />
              <Text
                text={`${analysis.minObstacleDistance?.toFixed(1)} cm`}
                x={(analysis.nearestObstacle.start.x + analysis.nearestObstacle.end.x) / 2}
                y={(analysis.nearestObstacle.start.y + analysis.nearestObstacle.end.y) / 2 - 15 / scale}
                fontSize={11 / scale}
                fill="#1d4ed8"
                listening={false}
              />
            </>
          )}

          {maneuverResult?.status === 'viable' && maneuverResult.entryPath.length > 1 && (
            <Arrow
              points={maneuverResult.entryPath.flatMap((pose) => [pose.x, pose.y])}
              stroke="#059669"
              fill="#059669"
              strokeWidth={3 / scale}
              pointerLength={12 / scale}
              pointerWidth={10 / scale}
              dash={[10 / scale, 5 / scale]}
              listening={false}
            />
          )}

          <Group
            x={placement.x}
            y={placement.y}
            rotation={placement.angle}
            draggable
            onDragMove={(e) => {
              e.target.x(snap(e.target.x()));
              e.target.y(snap(e.target.y()));
            }}
            onDragEnd={(e) => setPlacement({ x: e.target.x(), y: e.target.y() })}
          >
            {/* Silueta esquemática de carrocería: proporciones derivadas de las dimensiones introducidas. */}
            <Line points={bodyShape} closed fill={color} opacity={0.78} stroke="#334155" strokeWidth={1.5 / scale} />
            <Line
              points={[
                -carW * 0.36, -carL * 0.23,
                -carW * 0.27, -carL * 0.34,
                carW * 0.27, -carL * 0.34,
                carW * 0.36, -carL * 0.23,
                carW * 0.32, -carL * 0.02,
                -carW * 0.32, -carL * 0.02,
              ]}
              closed fill="#dbeafe" stroke="#64748b" strokeWidth={1 / scale} listening={false}
            />
            <Line
              points={[
                -carW * 0.32, carL * 0.04,
                carW * 0.32, carL * 0.04,
                carW * 0.29, carL * 0.26,
                carW * 0.23, carL * 0.34,
                -carW * 0.23, carL * 0.34,
                -carW * 0.29, carL * 0.26,
              ]}
              closed fill="#dbeafe" stroke="#64748b" strokeWidth={1 / scale} listening={false}
            />
            {[-1, 1].map((side) => (
              <Group key={side} listening={false}>
                <Rect
                  x={side * carW * 0.37 - (side > 0 ? 0 : carW * 0.1)}
                  y={-vehicle.wheelbase * 0.38}
                  width={carW * 0.1}
                  height={carL * 0.12}
                  fill="#1e293b"
                  cornerRadius={carW * 0.04}
                />
                <Rect
                  x={side * carW * 0.37 - (side > 0 ? 0 : carW * 0.1)}
                  y={vehicle.wheelbase * 0.25}
                  width={carW * 0.1}
                  height={carL * 0.12}
                  fill="#1e293b"
                  cornerRadius={carW * 0.04}
                />
                <Rect
                  x={side < 0 ? -vehicle.widthMirrorsFolded / 2 : vehicle.widthMirrorsFolded / 2 - carW * 0.07}
                  y={-carL * 0.34}
                  width={carW * 0.07}
                  height={carL * 0.07}
                  fill="#475569"
                  cornerRadius={carW * 0.035}
                />
              </Group>
            ))}
            <Line points={[-carW * 0.47, 0, carW * 0.47, 0]} stroke="#64748b" strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} listening={false} />
            {showDimensions && (
              <>
                <Text text={`${vehicle.widthMirrorsFolded} cm`} x={-vehicle.widthMirrorsFolded / 2} y={carL / 2 + 5 / scale} width={vehicle.widthMirrorsFolded} align="center" fontSize={11 / scale} fill="#334155" listening={false} />
                <Text text={`${vehicle.length} cm`} x={carW / 2 + 4 / scale} y={-carL / 2} fontSize={11 / scale} fill="#334155" listening={false} />
              </>
            )}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
