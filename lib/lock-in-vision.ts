import type { FaceLandmarker, Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

export const LOCK_IN_DOWN_WARNING_AFTER_SECONDS = 20;
export const LOCK_IN_PENALTY_AFTER_WARNINGS = 3;
export const LOCK_IN_PENALTY_POINTS = 0.5;

export type LockInPaperMode = "computer_only" | "paper_allowed";
export type LockInMonitorPhase = "off" | "setup" | "requesting_camera" | "calibrating" | "monitoring" | "alert" | "error";

export type LockInBaseline = {
  eyeY: number;
  noseY: number;
  pitchDegrees: number | null;
  samples: number;
};

export type LockInFrameEvaluation = {
  faceDetected: boolean;
  eyeY: number | null;
  noseY: number | null;
  pitchDegrees: number | null;
  downSignal: boolean;
};

const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

export function createEmptyLockInBaseline(): LockInBaseline {
  return {
    eyeY: 0,
    noseY: 0,
    pitchDegrees: null,
    samples: 0,
  };
}

export async function loadLockInFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    })();
  }

  return faceLandmarkerPromise;
}

function averageLandmarkY(landmarks: NormalizedLandmark[], indices: number[]) {
  const values = indices
    .map((index) => landmarks[index]?.y)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readPitchDegrees(matrix: Matrix | null | undefined) {
  const values = matrix?.data;
  if (!values || values.length < 16) {
    return null;
  }

  const r21 = values[9];
  const r22 = values[10];
  if (![r21, r22].every((value) => Number.isFinite(value))) {
    return null;
  }

  return (Math.atan2(-r21, r22) * 180) / Math.PI;
}

export function updateLockInBaseline(baseline: LockInBaseline, evaluation: LockInFrameEvaluation) {
  if (!evaluation.faceDetected || evaluation.eyeY == null || evaluation.noseY == null) {
    return baseline;
  }

  const alpha = baseline.samples >= 12 ? 0.08 : 0.18;
  const nextPitch =
    evaluation.pitchDegrees == null
      ? baseline.pitchDegrees
      : baseline.pitchDegrees == null
        ? evaluation.pitchDegrees
        : baseline.pitchDegrees * (1 - alpha) + evaluation.pitchDegrees * alpha;

  return {
    eyeY: baseline.samples === 0 ? evaluation.eyeY : baseline.eyeY * (1 - alpha) + evaluation.eyeY * alpha,
    noseY: baseline.samples === 0 ? evaluation.noseY : baseline.noseY * (1 - alpha) + evaluation.noseY * alpha,
    pitchDegrees: nextPitch,
    samples: baseline.samples + 1,
  };
}

export function evaluateLockInFrame({
  landmarks,
  matrix,
  baseline,
}: {
  landmarks: NormalizedLandmark[] | null | undefined;
  matrix: Matrix | null | undefined;
  baseline: LockInBaseline;
}): LockInFrameEvaluation {
  if (!landmarks?.length) {
    return {
      faceDetected: false,
      eyeY: null,
      noseY: null,
      pitchDegrees: null,
      downSignal: false,
    };
  }

  const eyeY = averageLandmarkY(landmarks, [33, 133, 263, 362]);
  const noseY = averageLandmarkY(landmarks, [1]);
  const pitchDegrees = readPitchDegrees(matrix);

  if (eyeY == null || noseY == null) {
    return {
      faceDetected: false,
      eyeY: null,
      noseY: null,
      pitchDegrees,
      downSignal: false,
    };
  }

  const eyeShift = baseline.samples > 0 ? eyeY - baseline.eyeY : 0;
  const noseShift = baseline.samples > 0 ? noseY - baseline.noseY : 0;
  const pitchShift =
    baseline.samples > 0 && baseline.pitchDegrees != null && pitchDegrees != null ? pitchDegrees - baseline.pitchDegrees : 0;

  const downSignal =
    baseline.samples >= 8 &&
    ((eyeShift > 0.05 && noseShift > 0.055) || noseShift > 0.07 || (pitchShift > 16 && eyeShift > 0.025));

  return {
    faceDetected: true,
    eyeY,
    noseY,
    pitchDegrees,
    downSignal,
  };
}

export function formatLockInPoints(points: number) {
  return Number.isInteger(points) ? `${points}` : points.toFixed(1).replace(/\.0$/, "");
}
