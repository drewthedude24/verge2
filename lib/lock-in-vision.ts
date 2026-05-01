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
  gazeHorizontal: number | null;
  gazeVertical: number | null;
  samples: number;
};

export type LockInFrameEvaluation = {
  faceDetected: boolean;
  eyeY: number | null;
  noseY: number | null;
  pitchDegrees: number | null;
  downSignal: boolean;
  gazeHorizontal: number | null;
  gazeVertical: number | null;
  eyesAwaySignal: boolean;
  eyesAwayLabel: "left" | "right" | "up" | "down" | null;
};

const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const LOCK_IN_SUPPRESSED_CONSOLE_PATTERNS = [/Created TensorFlow Lite XNNPACK delegate for CPU/i];

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

function shouldSuppressLockInConsoleArgs(args: unknown[]) {
  const joined = args
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }

      if (value instanceof Error) {
        return value.message;
      }

      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");

  return LOCK_IN_SUPPRESSED_CONSOLE_PATTERNS.some((pattern) => pattern.test(joined));
}

export function detectLockInFrame({
  landmarker,
  video,
  now,
}: {
  landmarker: FaceLandmarker;
  video: HTMLVideoElement;
  now: number;
}) {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  const patchedConsoleError: typeof console.error = (...args) => {
    if (shouldSuppressLockInConsoleArgs(args)) {
      return;
    }

    originalConsoleError(...args);
  };

  const patchedConsoleWarn: typeof console.warn = (...args) => {
    if (shouldSuppressLockInConsoleArgs(args)) {
      return;
    }

    originalConsoleWarn(...args);
  };

  console.error = patchedConsoleError;
  console.warn = patchedConsoleWarn;

  try {
    return landmarker.detectForVideo(video, now);
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
}

export function createEmptyLockInBaseline(): LockInBaseline {
  return {
    eyeY: 0,
    noseY: 0,
    pitchDegrees: null,
    gazeHorizontal: null,
    gazeVertical: null,
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

function averageLandmarkX(landmarks: NormalizedLandmark[], indices: number[]) {
  const values = indices
    .map((index) => landmarks[index]?.x)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeIrisRatio({
  landmarks,
  irisIndices,
  horizontalIndices,
  verticalIndices,
}: {
  landmarks: NormalizedLandmark[];
  irisIndices: number[];
  horizontalIndices: number[];
  verticalIndices: number[];
}) {
  const irisCenterX = averageLandmarkX(landmarks, irisIndices);
  const irisCenterY = averageLandmarkY(landmarks, irisIndices);
  const horizontalValues = horizontalIndices
    .map((index) => landmarks[index]?.x)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const verticalValues = verticalIndices
    .map((index) => landmarks[index]?.y)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (irisCenterX == null || irisCenterY == null || horizontalValues.length < 2 || verticalValues.length < 2) {
    return null;
  }

  const minX = Math.min(...horizontalValues);
  const maxX = Math.max(...horizontalValues);
  const minY = Math.min(...verticalValues);
  const maxY = Math.max(...verticalValues);

  if (maxX - minX < 0.01 || maxY - minY < 0.01) {
    return null;
  }

  return {
    horizontal: (irisCenterX - minX) / (maxX - minX),
    vertical: (irisCenterY - minY) / (maxY - minY),
  };
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
  const nextHorizontal =
    evaluation.gazeHorizontal == null
      ? baseline.gazeHorizontal
      : baseline.gazeHorizontal == null
        ? evaluation.gazeHorizontal
        : baseline.gazeHorizontal * (1 - alpha) + evaluation.gazeHorizontal * alpha;
  const nextVertical =
    evaluation.gazeVertical == null
      ? baseline.gazeVertical
      : baseline.gazeVertical == null
        ? evaluation.gazeVertical
        : baseline.gazeVertical * (1 - alpha) + evaluation.gazeVertical * alpha;

  return {
    eyeY: baseline.samples === 0 ? evaluation.eyeY : baseline.eyeY * (1 - alpha) + evaluation.eyeY * alpha,
    noseY: baseline.samples === 0 ? evaluation.noseY : baseline.noseY * (1 - alpha) + evaluation.noseY * alpha,
    pitchDegrees: nextPitch,
    gazeHorizontal: nextHorizontal,
    gazeVertical: nextVertical,
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
      gazeHorizontal: null,
      gazeVertical: null,
      eyesAwaySignal: false,
      eyesAwayLabel: null,
    };
  }

  const eyeY = averageLandmarkY(landmarks, [33, 133, 263, 362]);
  const noseY = averageLandmarkY(landmarks, [1]);
  const pitchDegrees = readPitchDegrees(matrix);
  const leftIris = computeIrisRatio({
    landmarks,
    irisIndices: [468, 469, 470, 471, 472],
    horizontalIndices: [33, 133],
    verticalIndices: [159, 145],
  });
  const rightIris = computeIrisRatio({
    landmarks,
    irisIndices: [473, 474, 475, 476, 477],
    horizontalIndices: [362, 263],
    verticalIndices: [386, 374],
  });
  const gazeHorizontal =
    leftIris && rightIris ? (leftIris.horizontal + rightIris.horizontal) / 2 : leftIris?.horizontal ?? rightIris?.horizontal ?? null;
  const gazeVertical =
    leftIris && rightIris ? (leftIris.vertical + rightIris.vertical) / 2 : leftIris?.vertical ?? rightIris?.vertical ?? null;

  if (eyeY == null || noseY == null) {
    return {
      faceDetected: false,
      eyeY: null,
      noseY: null,
      pitchDegrees,
      downSignal: false,
      gazeHorizontal,
      gazeVertical,
      eyesAwaySignal: false,
      eyesAwayLabel: null,
    };
  }

  const eyeShift = baseline.samples > 0 ? eyeY - baseline.eyeY : 0;
  const noseShift = baseline.samples > 0 ? noseY - baseline.noseY : 0;
  const pitchShift =
    baseline.samples > 0 && baseline.pitchDegrees != null && pitchDegrees != null ? pitchDegrees - baseline.pitchDegrees : 0;
  const horizontalShift =
    baseline.samples > 0 && baseline.gazeHorizontal != null && gazeHorizontal != null ? gazeHorizontal - baseline.gazeHorizontal : 0;
  const verticalShift =
    baseline.samples > 0 && baseline.gazeVertical != null && gazeVertical != null ? gazeVertical - baseline.gazeVertical : 0;

  const downSignal =
    baseline.samples >= 8 &&
    ((eyeShift > 0.05 && noseShift > 0.055) || noseShift > 0.07 || (pitchShift > 16 && eyeShift > 0.025));
  const horizontalCenterShift = gazeHorizontal == null ? 0 : Math.abs(gazeHorizontal - 0.5);
  const verticalCenterShift = gazeVertical == null ? 0 : Math.abs(gazeVertical - 0.5);
  const eyesAwaySignal =
    baseline.samples >= 6 &&
    baseline.gazeHorizontal != null &&
    baseline.gazeVertical != null &&
    gazeHorizontal != null &&
    gazeVertical != null &&
    (
      Math.abs(horizontalShift) > 0.11 ||
      Math.abs(verticalShift) > 0.1 ||
      horizontalCenterShift > 0.16 ||
      verticalCenterShift > 0.14
    );
  const eyesAwayLabel: LockInFrameEvaluation["eyesAwayLabel"] =
    !eyesAwaySignal
      ? null
      : Math.abs(verticalShift) >= Math.abs(horizontalShift)
        ? verticalShift > 0
          ? "down"
          : "up"
        : horizontalShift > 0
          ? "right"
          : "left";

  return {
    faceDetected: true,
    eyeY,
    noseY,
    pitchDegrees,
    downSignal,
    gazeHorizontal,
    gazeVertical,
    eyesAwaySignal,
    eyesAwayLabel,
  };
}

export function formatLockInPoints(points: number) {
  return Number.isInteger(points) ? `${points}` : points.toFixed(1).replace(/\.0$/, "");
}
