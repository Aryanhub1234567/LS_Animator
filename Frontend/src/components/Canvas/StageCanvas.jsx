import { useMemo, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';

const resetVideo = (videoElement) => {
  videoElement.pause();
  videoElement.currentTime = 0;
};

const StageCanvas = ({ isSpeaking, mouthSize, canvasFormat, mouthPos, setMouthPos, characterSrc, mouthSrc, mouthType, displayScale = 1 }) => {
  const isMouthImage = mouthType?.startsWith('image/');
  const [bodyImg] = useImage(characterSrc || null);
  const [mouthImg] = useImage(isMouthImage ? mouthSrc : null);
  const layerRef = useRef(null);

  const { CANVAS_WIDTH, CANVAS_HEIGHT } = useMemo(() => {
    return canvasFormat === '16:9'
      ? { CANVAS_WIDTH: 1024, CANVAS_HEIGHT: 576 }
      : { CANVAS_WIDTH: 450, CANVAS_HEIGHT: 800 };
  }, [canvasFormat]);

  const videoElement = useMemo(() => {
    if (!mouthSrc || isMouthImage) return null;
    const video = document.createElement('video');
    video.src = mouthSrc;
    video.loop = true;
    video.playsInline = true;
    video.muted = true;
    return video;
  }, [mouthSrc, isMouthImage]);

  useEffect(() => {
    if (!videoElement) return;
    if (isSpeaking) {
      videoElement.play().catch((err) => console.warn("Playback blocked:", err));
    } else {
      resetVideo(videoElement);
    }
  }, [isSpeaking, videoElement]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const anim = new Konva.Animation(() => {}, layer);

    if (isSpeaking) {
      anim.start();
    } else {
      anim.stop();
      layer.batchDraw();
    }
    return () => anim.stop();
  }, [isSpeaking]);

  const characterDimensions = useMemo(() => {
    if (!bodyImg) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, x: 0, y: 0 };
    const scale = Math.min(CANVAS_WIDTH / bodyImg.width, CANVAS_HEIGHT / bodyImg.height);
    const width = bodyImg.width * scale;
    const height = bodyImg.height * scale;
    return {
      width,
      height,
      x: (CANVAS_WIDTH - width) / 2,
      y: (CANVAS_HEIGHT - height) / 2
    };
  }, [bodyImg, CANVAS_WIDTH, CANVAS_HEIGHT]);

  const mouthHeight = mouthSize * 1.77;
  const mouthSource = mouthImg || videoElement;

  return (
    <div
      className="inline-block"
      style={{ width: CANVAS_WIDTH * displayScale, height: CANVAS_HEIGHT * displayScale }}
    >
      <div
        className="overflow-hidden inline-block bg-black shadow-[0_0_0_1px_#334155] origin-top-left"
        style={{ transform: `scale(${displayScale})` }}
      >
        <Stage width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
          <Layer ref={layerRef}>
            {bodyImg && (
              <KonvaImage
                image={bodyImg}
                x={characterDimensions.x}
                y={characterDimensions.y}
                width={characterDimensions.width}
                height={characterDimensions.height}
                draggable={false}
              />
            )}

            {mouthSource && (
              <KonvaImage
                image={mouthSource}
                x={mouthPos.x}
                y={mouthPos.y}
                width={mouthSize}
                height={mouthHeight}
                draggable={true}
                onDragEnd={(e) => {
                  setMouthPos({ x: e.target.x(), y: e.target.y() });
                }}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

export default StageCanvas;
