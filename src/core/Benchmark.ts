interface BenchmarkApi {
  trace(name: string): () => void;
  endFrame(): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const DUMB: BenchmarkApi = {
  trace: () => noop,
  endFrame() {},
};

function createBenchmark(): BenchmarkApi {
  if (
    typeof window === 'undefined' ||
    !new URLSearchParams(window.location.search).has('benchmark')
  ) {
    return DUMB;
  }

  const systemTimes = new Map<string, number[]>();
  let frameCount = 0;

  return {
    trace(name: string): () => void {
      const start = performance.now();
      return () => {
        const elapsed = performance.now() - start;
        let times = systemTimes.get(name);
        if (!times) {
          times = [];
          systemTimes.set(name, times);
        }
        times.push(elapsed);
      };
    },
    endFrame() {
      frameCount++;
      if (frameCount % 60 !== 0) return;

      const lines: string[] = [];
      for (const [name, times] of systemTimes) {
        const sum = times.reduce((a, b) => a + b, 0);
        const avg = sum / times.length;
        const max = Math.max(...times);
        lines.push(`${name}: avg=${avg.toFixed(3)}ms max=${max.toFixed(3)}ms (${times.length})`);
      }
      lines.sort();
      console.log(`[BENCHMARK] Frame ${frameCount}:`);
      lines.forEach((l) => console.log(`  ${l}`));
      systemTimes.clear();
    },
  };
}

export const benchmark = createBenchmark();
