export async function finishBatch(batchId: string, concurrency = 3, onProgress?: (processed: number) => void, retry = false) {
  let first = true;
  for (let step = 0; step < 200; step++) {
    const response = await fetch("/api/batches/" + batchId + (first && retry ? "/retry" : "/process"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Batch processing failed. Resume it from Overview & Batches.");
    onProgress?.(data.result.processedCount);
    if (!data.result.remaining) return data.result;
    first = false;
  }
  throw new Error("Batch paused. Continue from Overview & Batches.");
}
