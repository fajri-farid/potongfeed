import {
  renderAllTileSlices,
  type CanvasFactory,
  type RenderCanvasLike,
} from "@/lib/tile-renderer";
import type {
  SplitterWorkerRequest,
  SplitterWorkerResponse,
  WorkerErrorCode,
} from "@/types/editor";

interface MinimalWorkerScope {
  onmessage: ((event: MessageEvent<SplitterWorkerRequest>) => void) | null;
  postMessage: (message: SplitterWorkerResponse) => void;
}

const workerScope = globalThis as unknown as MinimalWorkerScope;
const activeJobs = new Map<string, AbortController>();

function postWorkerError(jobId: string, code: WorkerErrorCode, message: string): void {
  workerScope.postMessage({
    type: "error",
    jobId,
    code,
    message,
  });
}

async function handleSplitRequest(
  request: Extract<SplitterWorkerRequest, { type: "split" }>,
): Promise<void> {
  if (
    typeof OffscreenCanvas === "undefined" ||
    typeof OffscreenCanvas.prototype?.convertToBlob !== "function" ||
    typeof createImageBitmap !== "function"
  ) {
    postWorkerError(
      request.jobId,
      "OFFSCREEN_UNSUPPORTED",
      "Browser tidak mendukung OffscreenCanvas di Web Worker.",
    );
    return;
  }

  const controller = new AbortController();
  activeJobs.set(request.jobId, controller);

  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(request.file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(request.file);
    }

    if (controller.signal.aborted) {
      postWorkerError(request.jobId, "CANCELLED", "Proses pemotongan dibatalkan.");
      return;
    }

    const createOffscreenCanvas: CanvasFactory = (width, height) =>
      new OffscreenCanvas(width, height) as unknown as RenderCanvasLike;

    const rendered = await renderAllTileSlices({
      source: bitmap,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      splitPlan: request.splitPlan,
      transform: request.transform,
      exportSettings: request.exportSettings,
      createCanvas: createOffscreenCanvas,
      yieldBetweenTiles: true,
      signal: controller.signal,
      onProgress: (completed, total, currentFilename) => {
        workerScope.postMessage({
          type: "progress",
          jobId: request.jobId,
          completed,
          total,
          currentFilename,
        });
      },
    });

    workerScope.postMessage({
      type: "complete",
      jobId: request.jobId,
      tiles: rendered.tiles,
      actualFormat: rendered.actualFormat,
      usedFallbackFormat: rendered.usedFallbackFormat,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.message === "CANCELLED")) {
      postWorkerError(request.jobId, "CANCELLED", "Proses pemotongan dibatalkan.");
    } else if (!bitmap) {
      postWorkerError(
        request.jobId,
        "DECODE_FAILED",
        "Gambar sumber gagal didekodekan di Web Worker.",
      );
    } else {
      postWorkerError(
        request.jobId,
        "ENCODE_FAILED",
        error instanceof Error ? error.message : "Gagal memotong tile di Web Worker.",
      );
    }
  } finally {
    bitmap?.close();
    activeJobs.delete(request.jobId);
  }
}

workerScope.onmessage = (event: MessageEvent<SplitterWorkerRequest>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  if (message.type === "cancel") {
    activeJobs.get(message.jobId)?.abort();
    return;
  }

  if (message.type === "split") {
    void handleSplitRequest(message);
  }
};
