export class Logger {
  private startTime?: number;
  private taskName?: string;

  info(message: string): void {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ℹ️  ${message}\n`);
  }

  success(message: string): void {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ✅ ${message}\n`);
  }

  error(message: string): void {
    const timestamp = new Date().toISOString();
    process.stderr.write(`[${timestamp}] ❌ ${message}\n`);
  }

  warn(message: string): void {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ⚠️  ${message}\n`);
  }

  startTask(name: string): void {
    this.taskName = name;
    this.startTime = Date.now();
    this.info(`Starting: ${name}`);
  }

  endTask(): void {
    if (this.startTime && this.taskName) {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
      this.success(`Completed: ${this.taskName} (${elapsed}s)`);
      this.startTime = undefined;
      this.taskName = undefined;
    }
  }

  progress(current: number, total: number, item?: string): void {
    const percent = Math.floor((current / total) * 100);
    const bar = this.createProgressBar(percent);
    const itemInfo = item ? ` - ${item}` : '';
    process.stdout.write(
      `\r[${bar}] ${current}/${total} (${percent}%)${itemInfo}`,
    );
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  private createProgressBar(percent: number): string {
    const total = 20;
    const filled = Math.floor((percent / 100) * total);
    const empty = total - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

export const logger = new Logger();
