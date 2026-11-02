import { useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { useSimulationStore } from '@/stores/simulationStore';
import { useFitAnalysis } from '@/hooks/useFitAnalysis';
import type { Obstacle } from '@/types/domain';
import {
  approachCorridor,
  createManeuverMotionTimeline,
  sampleManeuverMotion,
} from '@/domain/maneuver/maneuver';
import { vehicleWidthForClearance } from '@/domain/collision/analysis';
import { usePreferences } from '@/contexts/PreferencesContext';
import { translateError } from '@/i18n';

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
  const { t, theme, language } = usePreferences();
  const ref = useRef<HTMLDivElement>(null);
  const panGesture = useRef<PanGesture | null>(null);
  const playbackProgressRef = useRef(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [playbackDirection, setPlaybackDirection] = useState<'entry' | 'exit'>('entry');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const {
    spot, vehicle, placement, obstacles, maneuverSettings, maneuverResult, showGrid, showDimensions, snapToGrid, gridSize,
    setPlacement, updateObstacle, setView,
  } = useSimulationStore();
  const analysis = useFitAnalysis();
  const hasEntryPlayback = maneuverResult?.status === 'viable' && maneuverResult.entryMotion.length > 1;
  const hasExitPlayback = maneuverResult?.exitStatus === 'viable' && maneuverResult.exitMotion.length > 1;
  const playbackPath = playbackDirection === 'entry'
    ? hasEntryPlayback ? maneuverResult!.entryMotion : []
    : hasExitPlayback ? maneuverResult!.exitMotion : [];
  const playbackTimeline = useMemo(() => createManeuverMotionTimeline(playbackPath), [playbackPath]);
  playbackProgressRef.current = playbackProgress;
  const motionSample = previewActive ? sampleManeuverMotion(playbackTimeline, playbackProgress) : null;
  const animatedPlacement = motionSample?.frame.pose ?? placement;
  const activePathIndex = motionSample?.pathIndex ?? 0;
  const traveledPath = previewActive
    ? [...playbackPath.slice(0, activePathIndex + 1).map((frame) => frame.pose), animatedPlacement]
    : [];

  useEffect(() => {
    setPlaybackProgress(0);
    setPreviewActive(false);
    setIsPlaying(false);
    if (maneuverResult?.exitStatus !== 'viable') setPlaybackDirection('entry');
  }, [maneuverResult]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setIsPlaying(false);
    };
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!isPlaying || reducedMotion || playbackPath.length < 2) return;
    let startedAt: number | undefined;
    let frame = 0;
    const startProgress = playbackProgressRef.current;
    const remainingDuration = playbackTimeline.durationMs * (1 - startProgress);
    const animate = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, startProgress + (now - startedAt) / remainingDuration);
      setPlaybackProgress(progress);
      if (progress >= 1) {
        setIsPlaying(false);
      } else {
        frame = window.requestAnimationFrame(animate);
      }
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, playbackPath.length, playbackTimeline.durationMs, reducedMotion]);

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
  const scenePalette = theme === 'dark'
    ? {
      corridor: '#252e2a', corridorStroke: '#69766d', grid: '#39463f', boundary: '#aab8ae',
      measure: '#a7b3aa', measureText: '#c7d2ca', glass: '#87a8b8', wheel: '#101614',
      outline: '#19231e', nearest: '#81b6ff', nearestText: '#a7ccff',
    }
    : {
      corridor: '#f1f5f9', corridorStroke: '#94a3b8', grid: '#e2e8f0', boundary: '#334155',
      measure: '#64748b', measureText: '#475569', glass: '#dbeafe', wheel: '#1e293b',
      outline: '#334155', nearest: '#2563eb', nearestText: '#1d4ed8',
    };
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
  const mirrorW = vehicleWidthForClearance(vehicle);
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
        <button aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => zoomAt(zoom / 1.2)} className="rounded px-2 py-1 text-sm hover:bg-slate-100">−</button>
        <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => zoomAt(zoom * 1.2)} className="rounded px-2 py-1 text-sm hover:bg-slate-100">+</button>
        <button title={t('resetView')} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded px-2 py-1 text-xs hover:bg-slate-100">{t('fitView')}</button>
        <button
          title={t('toggleDimensions')}
          onClick={() => setView({ showDimensions: !showDimensions })}
          className={`rounded px-2 py-1 text-xs ${showDimensions ? 'bg-slate-100' : ''}`}
        >{t('dimensions')}</button>
      </div>
      {(hasEntryPlayback || hasExitPlayback) && (
        <div className="absolute bottom-10 left-3 z-10 w-[min(320px,90%)] rounded border border-slate-200 bg-white/95 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded border border-slate-200 p-0.5" role="group" aria-label={t('maneuverDirection')}>
              <button
                type="button"
                aria-pressed={playbackDirection === 'entry'}
                disabled={!hasEntryPlayback}
                onClick={() => {
                  setPlaybackDirection('entry');
                  setPlaybackProgress(0);
                  setPreviewActive(false);
                  setIsPlaying(false);
                }}
                className={`rounded px-2 py-1 text-xs ${playbackDirection === 'entry' ? 'bg-[#202a27] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >{t('entry')}</button>
              <button
                type="button"
                aria-pressed={playbackDirection === 'exit'}
                disabled={!hasExitPlayback}
                title={hasExitPlayback ? undefined : maneuverResult?.exitReason ? translateError(language, maneuverResult.exitReason) : undefined}
                onClick={() => {
                  setPlaybackDirection('exit');
                  setPlaybackProgress(0);
                  setPreviewActive(false);
                  setIsPlaying(false);
                }}
                className={`rounded px-2 py-1 text-xs ${playbackDirection === 'exit' ? 'bg-[#202a27] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >{t('exit')}</button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={isPlaying ? t('pausePath') : t('playPath')}
                onClick={() => {
                  if (isPlaying) {
                    setIsPlaying(false);
                    return;
                  }
                  if (playbackProgress >= 1) setPlaybackProgress(0);
                  setPreviewActive(true);
                  setIsPlaying(true);
                }}
                disabled={reducedMotion || playbackPath.length < 2}
                className="rounded bg-[#286b55] px-2 py-1 text-xs font-medium text-white hover:bg-[#205742] disabled:cursor-not-allowed disabled:opacity-50"
              >{isPlaying ? t('pausePath') : t('playPath')}</button>
              <button
                type="button"
                aria-label={t('resetPath')}
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackProgress(0);
                  setPreviewActive(false);
                }}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >{t('start')}</button>
            </div>
          </div>
          <label className="mt-2 block">
            <span className="sr-only">{t('progressOf', { direction: playbackDirection === 'entry' ? t('entry') : t('exit') })}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(playbackProgress * 100)}
              aria-valuetext={`${Math.round(playbackProgress * 100)} %`}
              onChange={(event) => {
                setIsPlaying(false);
                setPreviewActive(true);
                setPlaybackProgress(Number(event.target.value) / 100);
              }}
              className="w-full accent-[#286b55]"
            />
          </label>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{playbackDirection === 'entry' ? t('lane') : t('parkingSpace')}</span>
            <span>{Math.round(playbackProgress * 100)} %</span>
            <span>{playbackDirection === 'entry' ? t('parkingSpace') : t('lane')}</span>
          </div>
          {reducedMotion && (
            <p role="status" className="mt-1 text-[10px] text-slate-500">
              {t('reducedMotionHint')}
            </p>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-3 z-10 rounded bg-white/90 px-2 py-1 text-[11px] text-slate-500">
        {t('simulatorHelp')}
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
              fill={scenePalette.corridor}
              stroke={scenePalette.corridorStroke}
              strokeWidth={2 / scale}
              dash={[8 / scale, 5 / scale]}
              listening={false}
            />
          )}
          {gridLines.map((p, i) => (
            <Line key={`grid-${i}`} points={p} stroke={scenePalette.grid} strokeWidth={1 / scale} listening={false} />
          ))}
          <Rect width={spot.width} height={spot.length} stroke={scenePalette.boundary} strokeWidth={3 / scale} fill={theme === 'dark' ? 'rgba(148,163,184,0.04)' : 'rgba(148,163,184,0.08)'} listening={false} />
          {corridor && (
            <Text
              text={t('corridor', { width: maneuverSettings.corridorWidth })}
              x={Math.min(...corridor.map((p) => p.x))}
              y={Math.min(...corridor.map((p) => p.y)) + 6 / scale}
              width={Math.max(...corridor.map((p) => p.x)) - Math.min(...corridor.map((p) => p.x))}
              align="center"
              fontSize={12 / scale}
              fill={scenePalette.measure}
              listening={false}
            />
          )}
          {showDimensions && (
            <>
              <Line points={[0, -9 / scale, spot.width, -9 / scale]} stroke={scenePalette.measure} strokeWidth={1 / scale} listening={false} />
              <Line points={[0, -14 / scale, 0, -4 / scale, spot.width, -4 / scale, spot.width, -14 / scale]} stroke={scenePalette.measure} strokeWidth={1 / scale} listening={false} />
              <Text text={`${spot.width} cm`} x={0} y={-30 / scale} width={spot.width} align="center" fontSize={13 / scale} fill={scenePalette.measureText} listening={false} />
              <Line points={[spot.width + 10 / scale, 0, spot.width + 10 / scale, spot.length]} stroke={scenePalette.measure} strokeWidth={1 / scale} listening={false} />
              <Line points={[spot.width + 5 / scale, 0, spot.width + 15 / scale, 0, spot.width + 15 / scale, spot.length, spot.width + 5 / scale, spot.length]} stroke={scenePalette.measure} strokeWidth={1 / scale} listening={false} />
              <Text text={`${spot.length} cm`} x={spot.width + 17 / scale} y={spot.length / 2} fontSize={13 / scale} fill={scenePalette.measureText} listening={false} />
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
              stroke: scenePalette.outline,
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
                  text={obstacle.kind === 'wall' ? t('wall') : `O${index + 1}`}
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
                stroke={scenePalette.nearest}
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
                listening={false}
              />
              <Text
                text={`${analysis.minObstacleDistance?.toFixed(1)} cm`}
                x={(analysis.nearestObstacle.start.x + analysis.nearestObstacle.end.x) / 2}
                y={(analysis.nearestObstacle.start.y + analysis.nearestObstacle.end.y) / 2 - 15 / scale}
                fontSize={11 / scale}
                fill={scenePalette.nearestText}
                listening={false}
              />
            </>
          )}

          {playbackPath.length > 1 && (
            <Arrow
              points={playbackPath.flatMap((frame) => [frame.pose.x, frame.pose.y])}
              stroke={playbackDirection === 'entry' ? '#059669' : '#b7791f'}
              fill={playbackDirection === 'entry' ? '#059669' : '#b7791f'}
              strokeWidth={3 / scale}
              pointerLength={12 / scale}
              pointerWidth={10 / scale}
              dash={[10 / scale, 5 / scale]}
              listening={false}
            />
          )}
          {previewActive && traveledPath.length > 1 && (
            <Line
              points={traveledPath.flatMap((pose) => [pose.x, pose.y])}
              stroke={playbackDirection === 'entry' ? '#047857' : '#92400e'}
              strokeWidth={5 / scale}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}
          {previewActive && playbackDirection === 'entry' && (
            <Group x={placement.x} y={placement.y} rotation={placement.angle} listening={false}>
              <Line
                points={bodyShape}
                closed
                fill="rgba(5, 150, 105, 0.06)"
                stroke="#059669"
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
              />
            </Group>
          )}

          <Group
            x={animatedPlacement.x}
            y={animatedPlacement.y}
            rotation={animatedPlacement.angle}
            draggable={!previewActive}
            onDragMove={(e) => {
              e.target.x(snap(e.target.x()));
              e.target.y(snap(e.target.y()));
            }}
            onDragEnd={(e) => setPlacement({ x: e.target.x(), y: e.target.y() })}
          >
            {/* Silueta esquemática de carrocería: proporciones derivadas de las dimensiones introducidas. */}
            <Line points={bodyShape} closed fill={color} opacity={0.78} stroke={scenePalette.outline} strokeWidth={1.5 / scale} />
            <Line
              points={[
                -carW * 0.36, -carL * 0.23,
                -carW * 0.27, -carL * 0.34,
                carW * 0.27, -carL * 0.34,
                carW * 0.36, -carL * 0.23,
                carW * 0.32, -carL * 0.02,
                -carW * 0.32, -carL * 0.02,
              ]}
              closed fill={scenePalette.glass} stroke={scenePalette.measure} strokeWidth={1 / scale} listening={false}
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
              closed fill={scenePalette.glass} stroke={scenePalette.measure} strokeWidth={1 / scale} listening={false}
            />
            {[-1, 1].map((side) => (
              <Group key={side} listening={false}>
                <Group
                  x={side * carW * 0.37}
                  y={-vehicle.wheelbase * 0.38}
                  rotation={previewActive && motionSample
                    ? (motionSample.frame.steeringAngle * 180) / Math.PI
                    : 0}
                >
                  <Rect
                    x={-carW * 0.05}
                    y={-carL * 0.06}
                    width={carW * 0.1}
                    height={carL * 0.12}
                    fill={scenePalette.wheel}
                    cornerRadius={carW * 0.04}
                  />
                </Group>
                <Rect
                  x={side * carW * 0.37 - (side > 0 ? 0 : carW * 0.1)}
                  y={vehicle.wheelbase * 0.25}
                  width={carW * 0.1}
                  height={carL * 0.12}
                  fill={scenePalette.wheel}
                  cornerRadius={carW * 0.04}
                />
                <Rect
                  x={side < 0 ? -mirrorW / 2 : mirrorW / 2 - carW * 0.07}
                  y={-carL * 0.34}
                  width={carW * 0.07}
                  height={carL * 0.07}
                  fill={scenePalette.measureText}
                  cornerRadius={carW * 0.035}
                />
              </Group>
            ))}
            <Line points={[-carW * 0.47, 0, carW * 0.47, 0]} stroke={scenePalette.measure} strokeWidth={1 / scale} dash={[5 / scale, 4 / scale]} listening={false} />
            {showDimensions && (
              <>
                <Text text={`${mirrorW} cm${vehicle.widthMirrorsFolded === null ? ` (${t('body')})` : ''}`} x={-mirrorW / 2} y={carL / 2 + 5 / scale} width={mirrorW} align="center" fontSize={11 / scale} fill={scenePalette.measureText} listening={false} />
                <Text text={`${vehicle.length} cm`} x={carW / 2 + 4 / scale} y={-carL / 2} fontSize={11 / scale} fill={scenePalette.measureText} listening={false} />
              </>
            )}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
