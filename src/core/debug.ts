export const Profiler = {
  logs: [] as string[],
  metrics: {} as Record<string, number>,

  log(msg: string) {
    this.logs.push(`[${performance.now().toFixed(1)}] ${msg}`);
    if (this.logs.length > 50) this.logs.shift();
  },

  record(key: string, duration: number) {
    if (!this.metrics[key]) this.metrics[key] = duration;
    else this.metrics[key] = this.metrics[key] * 0.95 + duration * 0.05; // Smoothing
  },

  getReport() {
    let report = '=== GEO-FIGHTERS DEBUG REPORT ===\n';
    report += `Time: ${new Date().toISOString()}\n`;
    report += '--- Average Frame Times (ms) ---\n';
    const sorted = Object.entries(this.metrics).sort((a, b) => b[1] - a[1]);
    for (const [key, val] of sorted) {
      report += `${key.padEnd(20)}: ${val.toFixed(2)}ms\n`;
    }
    report += '\n--- Recent Events ---\n';
    report += this.logs.join('\n');
    return report;
  },
};
