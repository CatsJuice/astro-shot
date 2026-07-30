"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { flushSync } from "react-dom";
import { pinchRatio, pointerDistance } from "./pinch-gesture.mjs";
import { isXhsBuild } from "./site-path";

export type CaptureMode = "video" | "photo" | "long-exposure";
type CaptureKind = CaptureMode;

type StoredCapture = {
  id: string;
  kind: CaptureKind;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  width: number;
  height: number;
  duration: number | null;
};

type GalleryCapture = StoredCapture & {
  url: string;
};

type CameraSystemProps = {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  active: boolean;
  menuOpen: boolean;
  onActiveChange: (active: boolean) => void;
  onCaptureLockChange: (locked: boolean) => void;
  locale: "zh-CN" | "en";
};

type LongExposureSession = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  frame: number;
  startedAt: number;
  lastSample: number;
  samples: number;
};

const DATABASE_NAME = "astroshot-gallery";
const DATABASE_VERSION = 1;
const CAPTURE_STORE = "captures";
const LONG_EXPOSURE_SAMPLE_INTERVAL = 1000 / 8;
const MODAL_CLOSE_DURATION = 150;
const UI_IDLE_TIMEOUT = 2000;

const COPY = {
  "zh-CN": {
    enterCamera: "进入相机模式",
    exitCamera: "退出相机模式",
    video: "视频",
    photo: "照片",
    longExposure: "长曝光",
    takePhoto: "拍摄照片",
    startVideo: "开始录制视频",
    stopVideo: "停止录制视频",
    startLongExposure: "开始长曝光",
    stopLongExposure: "停止长曝光",
    saving: "正在存入图库",
    savedPhoto: "照片已存入图库",
    savedVideo: "视频已存入图库",
    savedLongExposure: "长曝光已存入图库",
    saveFailed: "保存失败，请检查浏览器存储空间",
    recordingFailed: "当前浏览器无法开始录制",
    gallery: "图库",
    closeGallery: "关闭图库",
    backToGallery: "返回图库",
    openGallery: "打开图库",
    videoBadge: "视频",
    longExposureBadge: "长曝光",
    photoBadge: "照片",
    info: "影像信息",
    more: "更多操作",
    downloadOriginal: "下载原图",
    deleteCapture: "删除",
    deleteConfirm: "确定删除这项影像吗？此操作无法撤销。",
    capturedAt: "拍摄时间",
    duration: "时长",
    dimensions: "尺寸",
    fileType: "文件类型",
    zoomHint: "双指或滚轮缩放",
    empty: "还没有拍摄内容",
  },
  en: {
    enterCamera: "Enter camera mode",
    exitCamera: "Exit camera mode",
    video: "Video",
    photo: "Photo",
    longExposure: "Long exposure",
    takePhoto: "Take photo",
    startVideo: "Start video recording",
    stopVideo: "Stop video recording",
    startLongExposure: "Start long exposure",
    stopLongExposure: "Stop long exposure",
    saving: "Saving to gallery",
    savedPhoto: "Photo saved to gallery",
    savedVideo: "Video saved to gallery",
    savedLongExposure: "Long exposure saved to gallery",
    saveFailed: "Could not save. Check browser storage space.",
    recordingFailed: "Recording is not available in this browser",
    gallery: "Gallery",
    closeGallery: "Close gallery",
    backToGallery: "Back to gallery",
    openGallery: "Open gallery",
    videoBadge: "Video",
    longExposureBadge: "Long exposure",
    photoBadge: "Photo",
    info: "Capture info",
    more: "More actions",
    downloadOriginal: "Download original",
    deleteCapture: "Delete",
    deleteConfirm: "Delete this capture? This action cannot be undone.",
    capturedAt: "Captured",
    duration: "Duration",
    dimensions: "Dimensions",
    fileType: "File type",
    zoomHint: "Pinch or scroll to zoom",
    empty: "No captures yet",
  },
} as const;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openCaptureDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(CAPTURE_STORE)) return;
      const store = database.createObjectStore(CAPTURE_STORE, {
        keyPath: "id",
      });
      store.createIndex("createdAt", "createdAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadCaptures() {
  const database = await openCaptureDatabase();
  try {
    const transaction = database.transaction(CAPTURE_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(CAPTURE_STORE).getAll(),
    );
    return (records as StoredCapture[]).sort(
      (first, second) => second.createdAt - first.createdAt,
    );
  } finally {
    database.close();
  }
}

async function storeCapture(capture: StoredCapture) {
  const database = await openCaptureDatabase();
  try {
    const transaction = database.transaction(CAPTURE_STORE, "readwrite");
    transaction.objectStore(CAPTURE_STORE).put(capture);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

async function deleteStoredCapture(id: string) {
  const database = await openCaptureDatabase();
  try {
    const transaction = database.transaction(CAPTURE_STORE, "readwrite");
    transaction.objectStore(CAPTURE_STORE).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Canvas encoding failed"));
      },
      mimeType,
      quality,
    );
  });
}

function captureId() {
  const suffix =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Date.now()}`;
  return `capture-${suffix}`;
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function captureDate(
  capture: GalleryCapture,
  locale: "zh-CN" | "en",
) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(capture.createdAt);
}

function mediaView(
  capture: GalleryCapture,
  className: string,
  controls = false,
) {
  if (capture.kind === "video") {
    return (
      <video
        className={className}
        src={capture.url}
        controls={controls}
        muted={!controls}
        playsInline
        preload="metadata"
      />
    );
  }
  // Blob URLs are generated at runtime from IndexedDB and cannot use next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={capture.url} alt="" draggable={false} />;
}

function CaptureKindIcon({ kind }: { kind: CaptureKind }) {
  if (kind === "video") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="6.5" width="11" height="11" rx="2" />
        <path d="m15.5 10 4-2v8l-4-2" />
      </svg>
    );
  }
  if (kind === "long-exposure") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.7 4.8a7.8 7.8 0 1 0 3.5 11.1 6.7 6.7 0 0 1-3.5-11.1Z" />
        <path d="M18.5 5.2v4M16.5 7.2h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.1 7.2 9.35 5.4h5.3l1.25 1.8h2.35A1.75 1.75 0 0 1 20 8.95v7.3A1.75 1.75 0 0 1 18.25 18H5.75A1.75 1.75 0 0 1 4 16.25v-7.3A1.75 1.75 0 0 1 5.75 7.2H8.1Z" />
      <circle cx="12" cy="12.3" r="3.15" />
    </svg>
  );
}

function captureKindLabel(
  capture: GalleryCapture,
  copy: (typeof COPY)[keyof typeof COPY],
) {
  if (capture.kind === "video") return copy.videoBadge;
  if (capture.kind === "long-exposure") return copy.longExposureBadge;
  return copy.photoBadge;
}

function captureFileExtension(capture: GalleryCapture) {
  if (capture.mimeType.includes("webm")) return "webm";
  if (capture.mimeType.includes("png")) return "png";
  if (capture.mimeType.includes("jpeg")) return "jpg";
  return "webp";
}

function viewTransitionStyle(id: string): CSSProperties {
  return { viewTransitionName: `gallery-${id}` } as CSSProperties;
}

export function CameraSystem({
  sourceCanvasRef,
  active,
  menuOpen,
  onActiveChange,
  onCaptureLockChange,
  locale,
}: CameraSystemProps) {
  const copy = COPY[locale];
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [isCapturing, setIsCapturing] = useState(false);
  const [recordingMode, setRecordingMode] = useState<CaptureMode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [captures, setCaptures] = useState<GalleryCapture[]>([]);
  const [toast, setToast] = useState("");
  const [photoFlash, setPhotoFlash] = useState(false);
  const [galleryMounted, setGalleryMounted] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryClosing, setGalleryClosing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [infoOpen, setInfoOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [uiIdle, setUiIdle] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabPillRef = useRef<HTMLSpanElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const galleryActionsRef = useRef<HTMLDivElement>(null);
  const photoPointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const photoPinchRef = useRef<{
    distance: number;
    zoom: number;
  } | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const galleryLoadedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const modalTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoStartedAtRef = useRef(0);
  const longExposureRef = useRef<LongExposureSession | null>(null);
  const captureModeRef = useRef<CaptureMode | null>(null);
  const stoppingRef = useRef<Promise<void> | null>(null);
  const selectedCapture =
    captures.find((capture) => capture.id === selectedId) ?? null;
  const hideIdleUi = !active && uiIdle;

  useEffect(() => {
    photoPointersRef.current.clear();
    photoPinchRef.current = null;
  }, [selectedId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  useEffect(() => {
    if (galleryLoadedRef.current) return;
    galleryLoadedRef.current = true;
    let cancelled = false;
    loadCaptures()
      .then((records) => {
        if (cancelled) return;
        const loaded = records.map((record) => {
          const url = URL.createObjectURL(record.blob);
          objectUrlsRef.current.add(url);
          return { ...record, url };
        });
        setCaptures(loaded);
      })
      .catch(() => {
        if (!cancelled) showToast(copy.saveFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.saveFailed, showToast]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      if (modalTimerRef.current !== null) {
        window.clearTimeout(modalTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    onCaptureLockChange(
      isCapturing &&
        (recordingMode === "video" || recordingMode === "long-exposure"),
    );
  }, [isCapturing, onCaptureLockChange, recordingMode]);

  useEffect(() => {
    if (active) return;
    let idleTimer = window.setTimeout(
      () => setUiIdle(true),
      UI_IDLE_TIMEOUT,
    );
    const markActivity = () => {
      setUiIdle(false);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(
        () => setUiIdle(true),
        UI_IDLE_TIMEOUT,
      );
    };
    window.addEventListener("pointermove", markActivity, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("click", markActivity, { passive: true });
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("click", markActivity);
    };
  }, [active]);

  useEffect(() => {
    if (!isCapturing) return;
    const startedAt =
      captureModeRef.current === "video"
        ? videoStartedAtRef.current
        : longExposureRef.current?.startedAt ?? Date.now();
    const updateElapsed = () => setElapsed(Date.now() - startedAt);
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 200);
    return () => window.clearInterval(interval);
  }, [isCapturing]);

  const persist = useCallback(
    async (capture: StoredCapture) => {
      setIsSaving(true);
      try {
        await storeCapture(capture);
        const url = URL.createObjectURL(capture.blob);
        objectUrlsRef.current.add(url);
        setCaptures((current) => [{ ...capture, url }, ...current]);
        showToast(
          capture.kind === "video"
            ? copy.savedVideo
            : capture.kind === "long-exposure"
              ? copy.savedLongExposure
              : copy.savedPhoto,
        );
      } catch {
        showToast(copy.saveFailed);
      } finally {
        setIsSaving(false);
      }
    },
    [
      copy.saveFailed,
      copy.savedLongExposure,
      copy.savedPhoto,
      copy.savedVideo,
      showToast,
    ],
  );

  const takePhoto = useCallback(async () => {
    const source = sourceCanvasRef.current;
    if (!source || isSaving) return;
    setPhotoFlash(true);
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => setPhotoFlash(false), 140);
    try {
      const blob = await canvasToBlob(source, "image/webp", 0.94);
      await persist({
        id: captureId(),
        kind: "photo",
        blob,
        mimeType: blob.type,
        createdAt: Date.now(),
        width: source.width,
        height: source.height,
        duration: null,
      });
    } catch {
      showToast(copy.saveFailed);
    }
  }, [copy.saveFailed, isSaving, persist, showToast, sourceCanvasRef]);

  const stopVideo = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const duration = Date.now() - videoStartedAtRef.current;
      const source = sourceCanvasRef.current;
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(videoChunksRef.current, {
            type: recorder.mimeType || "video/webm",
          });
          videoChunksRef.current = [];
          recorderRef.current = null;
          recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
          recorderStreamRef.current = null;
          setIsCapturing(false);
          setRecordingMode(null);
          setElapsed(0);
          captureModeRef.current = null;
          if (blob.size > 0) {
            void persist({
              id: captureId(),
              kind: "video",
              blob,
              mimeType: blob.type,
              createdAt: Date.now(),
              width: source?.width ?? 0,
              height: source?.height ?? 0,
              duration,
            }).finally(resolve);
          } else {
            resolve();
          }
        },
        { once: true },
      );
      recorder.stop();
    });
  }, [persist, sourceCanvasRef]);

  const startVideo = useCallback(() => {
    const source = sourceCanvasRef.current;
    if (!source || typeof MediaRecorder === "undefined") {
      showToast(copy.recordingFailed);
      return;
    }
    try {
      const stream = source.captureStream(30);
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined,
      );
      videoChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) videoChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        captureModeRef.current = null;
        setIsCapturing(false);
        setRecordingMode(null);
        setElapsed(0);
        showToast(copy.recordingFailed);
      };
      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      videoStartedAtRef.current = Date.now();
      captureModeRef.current = "video";
      recorder.start(1000);
      setRecordingMode("video");
      setElapsed(0);
      setIsCapturing(true);
    } catch {
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      recorderStreamRef.current = null;
      recorderRef.current = null;
      captureModeRef.current = null;
      setRecordingMode(null);
      showToast(copy.recordingFailed);
    }
  }, [copy.recordingFailed, showToast, sourceCanvasRef]);

  const stopLongExposure = useCallback(async () => {
    const session = longExposureRef.current;
    if (!session) return;
    window.cancelAnimationFrame(session.frame);
    longExposureRef.current = null;
    setIsCapturing(false);
    setRecordingMode(null);
    setElapsed(0);
    captureModeRef.current = null;
    const duration = Date.now() - session.startedAt;
    try {
      const blob = await canvasToBlob(session.canvas, "image/webp", 0.96);
      await persist({
        id: captureId(),
        kind: "long-exposure",
        blob,
        mimeType: blob.type,
        createdAt: Date.now(),
        width: session.canvas.width,
        height: session.canvas.height,
        duration,
      });
    } catch {
      showToast(copy.saveFailed);
    }
  }, [copy.saveFailed, persist, showToast]);

  const startLongExposure = useCallback(() => {
    const source = sourceCanvasRef.current;
    if (!source) return;
    const accumulation = document.createElement("canvas");
    accumulation.width = source.width;
    accumulation.height = source.height;
    const context = accumulation.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(source, 0, 0, accumulation.width, accumulation.height);
    const session: LongExposureSession = {
      canvas: accumulation,
      context,
      frame: 0,
      startedAt: Date.now(),
      lastSample: 0,
      samples: 1,
    };
    longExposureRef.current = session;
    captureModeRef.current = "long-exposure";
    setRecordingMode("long-exposure");
    setElapsed(0);
    setIsCapturing(true);

    const stackFrame = (time: number) => {
      const current = longExposureRef.current;
      const sourceNow = sourceCanvasRef.current;
      if (!current || !sourceNow) return;
      if (time - current.lastSample >= LONG_EXPOSURE_SAMPLE_INTERVAL) {
        if (
          current.canvas.width !== sourceNow.width ||
          current.canvas.height !== sourceNow.height
        ) {
          current.canvas.width = sourceNow.width;
          current.canvas.height = sourceNow.height;
        }
        current.context.globalCompositeOperation =
          current.samples === 0 ? "source-over" : "lighten";
        current.context.drawImage(
          sourceNow,
          0,
          0,
          current.canvas.width,
          current.canvas.height,
        );
        current.samples += 1;
        current.lastSample = time;
        const preview = previewCanvasRef.current;
        const previewContext = preview?.getContext("2d");
        if (preview && previewContext) {
          if (
            preview.width !== current.canvas.width ||
            preview.height !== current.canvas.height
          ) {
            preview.width = current.canvas.width;
            preview.height = current.canvas.height;
          }
          previewContext.globalCompositeOperation = "copy";
          previewContext.drawImage(current.canvas, 0, 0);
        }
      }
      current.frame = window.requestAnimationFrame(stackFrame);
    };
    session.frame = window.requestAnimationFrame(stackFrame);
  }, [sourceCanvasRef]);

  const stopCapture = useCallback(() => {
    if (stoppingRef.current) return stoppingRef.current;
    const stop =
      captureModeRef.current === "video"
        ? stopVideo()
        : captureModeRef.current === "long-exposure"
          ? stopLongExposure()
          : Promise.resolve();
    stoppingRef.current = stop.finally(() => {
      stoppingRef.current = null;
    });
    return stoppingRef.current;
  }, [stopLongExposure, stopVideo]);

  useEffect(
    () => () => {
      const session = longExposureRef.current;
      if (session) window.cancelAnimationFrame(session.frame);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      onCaptureLockChange(false);
    },
    [onCaptureLockChange],
  );

  const handleCameraToggle = async () => {
    setUiIdle(false);
    if (!active) {
      onActiveChange(true);
      return;
    }
    if (isCapturing) await stopCapture();
    onActiveChange(false);
  };

  const handleShutter = () => {
    if (isSaving) return;
    if (mode === "photo") {
      void takePhoto();
      return;
    }
    if (isCapturing) {
      void stopCapture();
      return;
    }
    if (mode === "video") startVideo();
    else startLongExposure();
  };

  const moveTabPill = useCallback((animate: boolean) => {
    const tabs = tabsRef.current;
    const pill = tabPillRef.current;
    if (!tabs || !pill) return;
    const selected = tabs.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!selected) return;
    if (!animate) pill.style.transition = "none";
    pill.style.transform = `translateX(${selected.offsetLeft}px)`;
    pill.style.width = `${selected.offsetWidth}px`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => moveTabPill(false));
    const resize = () => moveTabPill(false);
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [active, moveTabPill]);

  useEffect(() => {
    if (active) moveTabPill(true);
  }, [active, mode, moveTabPill]);

  const openGallery = () => {
    if (modalTimerRef.current !== null) {
      window.clearTimeout(modalTimerRef.current);
    }
    setGalleryMounted(true);
    setGalleryClosing(false);
    window.requestAnimationFrame(() => setGalleryVisible(true));
  };

  const closeGallery = useCallback(() => {
    setGalleryVisible(false);
    setGalleryClosing(true);
    setSelectedId(null);
    setZoom(1);
    setInfoOpen(false);
    setMoreOpen(false);
    if (modalTimerRef.current !== null) {
      window.clearTimeout(modalTimerRef.current);
    }
    modalTimerRef.current = window.setTimeout(() => {
      setGalleryMounted(false);
      setGalleryClosing(false);
    }, MODAL_CLOSE_DURATION);
  }, []);

  useEffect(() => {
    if (!galleryMounted) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moreOpen) {
        setMoreOpen(false);
        return;
      }
      if (infoOpen) {
        setInfoOpen(false);
        return;
      }
      if (selectedId) {
        setSelectedId(null);
        setZoom(1);
      } else {
        closeGallery();
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [closeGallery, galleryMounted, infoOpen, moreOpen, selectedId]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        galleryActionsRef.current &&
        !galleryActionsRef.current.contains(event.target as Node)
      ) {
        setMoreOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [moreOpen]);

  const transitionToCapture = (nextId: string | null) => {
    const documentWithTransitions = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> };
    };
    const update = () => {
      flushSync(() => {
        setSelectedId(nextId);
        setZoom(1);
        setInfoOpen(false);
        setMoreOpen(false);
      });
    };
    if (documentWithTransitions.startViewTransition) {
      documentWithTransitions.startViewTransition(update);
    } else {
      update();
    }
  };

  const handleZoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!selectedCapture || selectedCapture.kind === "video") return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((current) => Math.min(6, Math.max(1, current + direction * 0.25)));
  };

  const handlePhotoPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!selectedCapture || selectedCapture.kind === "video") return;
    if (
      photoPointersRef.current.size >= 2 &&
      !photoPointersRef.current.has(event.pointerId)
    ) {
      return;
    }
    event.preventDefault();
    photoPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (photoPointersRef.current.size === 2) {
      const [first, second] = [...photoPointersRef.current.values()];
      photoPinchRef.current = {
        distance: pointerDistance(first, second),
        zoom,
      };
    }
  };

  const handlePhotoPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!photoPointersRef.current.has(event.pointerId)) return;
    photoPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = photoPinchRef.current;
    if (!pinch || photoPointersRef.current.size < 2) return;
    event.preventDefault();
    const [first, second] = [...photoPointersRef.current.values()];
    const nextZoom =
      pinch.zoom *
      pinchRatio(pinch.distance, pointerDistance(first, second));
    setZoom(Math.min(6, Math.max(1, nextZoom)));
  };

  const handlePhotoPointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    photoPointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (photoPointersRef.current.size < 2) {
      photoPinchRef.current = null;
    }
  };

  const downloadSelectedCapture = () => {
    if (isXhsBuild) return;
    if (!selectedCapture) return;
    const anchor = document.createElement("a");
    anchor.href = selectedCapture.url;
    anchor.download = `astroshot-${selectedCapture.createdAt}.${captureFileExtension(
      selectedCapture,
    )}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setMoreOpen(false);
  };

  const deleteSelectedCapture = async () => {
    if (!selectedCapture || !window.confirm(copy.deleteConfirm)) return;
    try {
      await deleteStoredCapture(selectedCapture.id);
      objectUrlsRef.current.delete(selectedCapture.url);
      URL.revokeObjectURL(selectedCapture.url);
      setCaptures((current) =>
        current.filter((capture) => capture.id !== selectedCapture.id),
      );
      transitionToCapture(null);
    } catch {
      showToast(copy.saveFailed);
    }
  };

  const shutterLabel =
    mode === "photo"
      ? copy.takePhoto
      : mode === "video"
        ? isCapturing
          ? copy.stopVideo
          : copy.startVideo
        : isCapturing
          ? copy.stopLongExposure
          : copy.startLongExposure;

  return (
    <>
      {isCapturing && recordingMode === "long-exposure" ? (
        <canvas
          ref={previewCanvasRef}
          className="long-exposure-preview"
          aria-hidden="true"
        />
      ) : null}
      <div
        className={`photo-flash${photoFlash ? " active" : ""}`}
        aria-hidden="true"
      />

      <button
        className={`camera-mode-trigger${active ? " active" : ""}${
          hideIdleUi ? " ui-idle" : ""
        }${menuOpen ? " menu-open-hidden" : ""}`}
        inert={menuOpen}
        aria-hidden={menuOpen}
        tabIndex={menuOpen ? -1 : undefined}
        data-liquid-glass="camera-trigger"
        type="button"
        aria-label={active ? copy.exitCamera : copy.enterCamera}
        aria-pressed={active}
        onClick={() => void handleCameraToggle()}
      >
        <span
          className="t-icon-swap camera-trigger-icon"
          data-state={active ? "close" : "camera"}
          aria-hidden="true"
        >
          <svg
            className="t-icon"
            data-icon="camera"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="M8.1 7.2 9.35 5.4h5.3l1.25 1.8h2.35A1.75 1.75 0 0 1 20 8.95v7.3A1.75 1.75 0 0 1 18.25 18H5.75A1.75 1.75 0 0 1 4 16.25v-7.3A1.75 1.75 0 0 1 5.75 7.2H8.1Z" />
            <circle cx="12" cy="12.3" r="3.15" />
          </svg>
          <svg
            className="t-icon"
            data-icon="close"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </span>
      </button>

      <div
        className={`camera-controls${active ? " active" : ""}${
          hideIdleUi ? " ui-idle" : ""
        }${menuOpen ? " menu-open-hidden" : ""}`}
        aria-hidden={!active || menuOpen}
        inert={!active || menuOpen}
      >
        {isCapturing ? (
          <div className="capture-status" aria-live="polite">
            <span className="capture-status-dot" />
            <span>{formatElapsed(elapsed)}</span>
          </div>
        ) : null}
        <button
          className={`camera-shutter ${mode}${isCapturing ? " recording" : ""}`}
          data-liquid-glass="camera-shutter"
          type="button"
          aria-label={isSaving ? copy.saving : shutterLabel}
          disabled={isSaving}
          onClick={handleShutter}
        >
          <span className="shutter-core" aria-hidden="true" />
        </button>
        <div
          ref={tabsRef}
          className="camera-modes t-tabs"
          data-liquid-glass="camera-modes"
          role="tablist"
          aria-label={locale === "zh-CN" ? "拍摄模式" : "Capture mode"}
        >
          <span
            ref={tabPillRef}
            className="camera-mode-pill t-tabs-pill"
            aria-hidden="true"
          />
          {(
            [
              ["video", copy.video],
              ["photo", copy.photo],
              ["long-exposure", copy.longExposure],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="camera-mode-tab t-tab"
              type="button"
              role="tab"
              aria-selected={mode === value}
              disabled={isCapturing || isSaving}
              onClick={() => {
                setUiIdle(false);
                setMode(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {captures.length > 0 ? (
        <button
          className={`gallery-stack${hideIdleUi ? " ui-idle" : ""}${
            menuOpen ? " menu-open-hidden" : ""
          }`}
          type="button"
          aria-label={copy.openGallery}
          aria-hidden={menuOpen}
          inert={menuOpen}
          onClick={openGallery}
        >
          {captures.slice(0, 3).map((capture, index) => (
            <span
              className="gallery-stack-item"
              key={capture.id}
              style={{ "--stack-index": index } as CSSProperties}
              aria-hidden="true"
            >
              {mediaView(capture, "gallery-stack-media")}
            </span>
          ))}
          <span className="gallery-stack-count">{captures.length}</span>
        </button>
      ) : null}

      {galleryMounted ? (
        <div
          className={`gallery-overlay${galleryVisible ? " is-open" : ""}${
            galleryClosing ? " is-closing" : ""
          }`}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeGallery();
          }}
        >
          <section
            className={`gallery-dialog t-modal${
              galleryVisible ? " is-open" : ""
            }${galleryClosing ? " is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-title"
          >
            <header className="gallery-header">
              <h2 id="gallery-title">{copy.gallery}</h2>
              <button
                className="gallery-header-button gallery-close"
                type="button"
                aria-label={
                  selectedCapture ? copy.backToGallery : copy.closeGallery
                }
                onClick={() =>
                  selectedCapture ? transitionToCapture(null) : closeGallery()
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </button>
            </header>

            {selectedCapture ? (
              <div
                className="gallery-detail"
                onWheel={handleZoom}
                data-kind={selectedCapture.kind}
                data-zoomed={zoom > 1}
              >
                <div
                  ref={galleryActionsRef}
                  className="gallery-detail-actions"
                >
                  <button
                    className={`gallery-detail-action${
                      infoOpen ? " active" : ""
                    }`}
                    type="button"
                    aria-label={copy.info}
                    aria-expanded={infoOpen}
                    onClick={() => {
                      setInfoOpen((current) => !current);
                      setMoreOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 10.8v5M12 7.8h.01" />
                    </svg>
                  </button>
                  <button
                    className={`gallery-detail-action${
                      moreOpen ? " active" : ""
                    }`}
                    type="button"
                    aria-label={copy.more}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    onClick={() => {
                      setMoreOpen((current) => !current);
                      setInfoOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="6" cy="12" r="1.25" />
                      <circle cx="12" cy="12" r="1.25" />
                      <circle cx="18" cy="12" r="1.25" />
                    </svg>
                  </button>
                  <div
                    className={`gallery-more-menu t-dropdown${
                      moreOpen ? " is-open" : ""
                    }`}
                    data-origin="top-right"
                    role="menu"
                    aria-hidden={!moreOpen}
                    inert={!moreOpen}
                  >
                    {!isXhsBuild && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={downloadSelectedCapture}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 4v10M8 10l4 4 4-4M5 19h14" />
                        </svg>
                        {copy.downloadOriginal}
                      </button>
                    )}
                    <button
                      className="danger"
                      type="button"
                      role="menuitem"
                      onClick={() => void deleteSelectedCapture()}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
                      </svg>
                      {copy.deleteCapture}
                    </button>
                  </div>
                </div>
                <div
                  className="gallery-detail-media-wrap"
                  style={viewTransitionStyle(selectedCapture.id)}
                  onPointerDown={handlePhotoPointerDown}
                  onPointerMove={handlePhotoPointerMove}
                  onPointerUp={handlePhotoPointerEnd}
                  onPointerCancel={handlePhotoPointerEnd}
                >
                  {selectedCapture.kind === "video" ? (
                    <video
                      className="gallery-detail-media"
                      src={selectedCapture.url}
                      controls
                      autoPlay
                      playsInline
                    />
                  ) : (
                    // Blob URLs are generated at runtime from IndexedDB.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="gallery-detail-media"
                      src={selectedCapture.url}
                      alt=""
                      draggable={false}
                      style={{ transform: `scale(${zoom})` }}
                    />
                  )}
                </div>
                {selectedCapture.kind !== "video" ? (
                  <div className="gallery-zoom-hint">
                    {copy.zoomHint} · {Math.round(zoom * 100)}%
                  </div>
                ) : null}
                <aside
                  className="gallery-info-sheet t-panel-slide"
                  data-open={infoOpen}
                  aria-hidden={!infoOpen}
                  inert={!infoOpen}
                >
                  <div className="gallery-info-heading">
                    <span className="gallery-info-kind">
                      <CaptureKindIcon kind={selectedCapture.kind} />
                    </span>
                    <strong>{captureKindLabel(selectedCapture, copy)}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>{copy.capturedAt}</dt>
                      <dd>{captureDate(selectedCapture, locale)}</dd>
                    </div>
                    {selectedCapture.duration ? (
                      <div>
                        <dt>{copy.duration}</dt>
                        <dd>{formatElapsed(selectedCapture.duration)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>{copy.dimensions}</dt>
                      <dd>
                        {selectedCapture.width} × {selectedCapture.height}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.fileType}</dt>
                      <dd>{selectedCapture.mimeType}</dd>
                    </div>
                  </dl>
                </aside>
              </div>
            ) : (
              <div className="gallery-grid">
                {captures.length === 0 ? (
                  <p className="gallery-empty">{copy.empty}</p>
                ) : (
                  captures.map((capture) => (
                    <button
                      className="gallery-grid-item"
                      type="button"
                      key={capture.id}
                      onClick={() => transitionToCapture(capture.id)}
                    >
                      <span
                        className="gallery-grid-media-wrap"
                        style={viewTransitionStyle(capture.id)}
                      >
                        {mediaView(capture, "gallery-grid-media")}
                        <span
                          className="gallery-kind-badge"
                          aria-label={captureKindLabel(capture, copy)}
                          title={captureKindLabel(capture, copy)}
                        >
                          <CaptureKindIcon kind={capture.kind} />
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}

      <div
        className={`camera-toast${toast ? " active" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </>
  );
}
