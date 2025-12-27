import * as THREE from 'three';

export const Profiler = {
  logs: [] as string[],
  frameHistory: [] as any[],

  // Track detailed metrics
  metrics: {
    maxFrameTime: 0,
    minFPS: 60,
    gcSpikes: 0,
    gpuUploads: 0,
  },

  log(msg: string) {
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    this.logs.push(`[${time}] ${msg}`);
    if (this.logs.length > 200) this.logs.shift();
  },

  captureFrame(renderer: THREE.WebGLRenderer, dt: number) {
    const memory = (performance as any).memory;
    const frameTime = dt * 1000;

    if (frameTime > this.metrics.maxFrameTime) this.metrics.maxFrameTime = frameTime;

    // Log slow frames (>33ms / <30fps)
    if (frameTime > 33) {
      this.frameHistory.push({
        type: 'SLOW_FRAME',
        duration: frameTime.toFixed(1) + 'ms',
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
        heap: memory ? (memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB' : 'N/A',
      });
    }

    // Keep history small
    if (this.frameHistory.length > 20) this.frameHistory.shift();
  },

  getDetailedReport() {
    const memory = (performance as any).memory;
    return JSON.stringify(
      {
        summary: {
          active: 'TRUE',
          metrics: this.metrics,
          nowHeap: memory ? (memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB' : 'N/A',
        },
        slowFrames: this.frameHistory,
        recentLogs: this.logs.slice(-10),
      },
      null,
      2,
    );
  },
};
