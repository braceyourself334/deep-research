import * as process from 'process';
import { ResearchProgress } from './deep-research';

export interface OutputManagerOptions {
  headless?: boolean;
  onOutput?: (message: string) => void;
  onProgress?: (progress: ResearchProgress) => void;
}

export class OutputManager {
  private progressLines: number = 4;
  private progressArea: string[] = [];
  private initialized: boolean = false;
  private headless: boolean;
  private onOutput?: (message: string) => void;
  private onProgress?: (progress: ResearchProgress) => void;
  
  constructor(options: OutputManagerOptions = {}) {
    this.headless = options.headless ?? false;
    this.onOutput = options.onOutput;
    this.onProgress = options.onProgress;
    
    if (!this.headless) {
      process.stdout.write('\n'.repeat(this.progressLines));
      this.initialized = true;
    }
  }
  
  log(...args: any[]) {
    const message = args.join(' ');
    
    if (this.onOutput) {
      this.onOutput(message);
    }
    
    if (!this.headless) {
      if (this.initialized) {
        process.stdout.write(`\x1B[${this.progressLines}A`);
        process.stdout.write('\x1B[0J');
      }
      console.log(...args);
      if (this.initialized) {
        this.drawProgress();
      }
    }
  }
  
  updateProgress(progress: ResearchProgress) {
    if (this.onProgress) {
      this.onProgress(progress);
    }
    
    if (!this.headless) {
      this.progressArea = [
        `Depth:    [${this.getProgressBar(progress.totalDepth - progress.currentDepth, progress.totalDepth)}] ${Math.round((progress.totalDepth - progress.currentDepth) / progress.totalDepth * 100)}%`,
        `Breadth:  [${this.getProgressBar(progress.totalBreadth - progress.currentBreadth, progress.totalBreadth)}] ${Math.round((progress.totalBreadth - progress.currentBreadth) / progress.totalBreadth * 100)}%`,
        `Queries:  [${this.getProgressBar(progress.completedQueries, progress.totalQueries)}] ${Math.round(progress.completedQueries / progress.totalQueries * 100)}%`,
        progress.currentQuery ? `Current:  ${progress.currentQuery}` : ''
      ];
      this.drawProgress();
    }
  }
  
  private getProgressBar(value: number, total: number): string {
    const width = process.stdout.columns ? Math.min(30, process.stdout.columns - 20) : 30;
    const filled = Math.round((width * value) / total);
    return '█'.repeat(filled) + ' '.repeat(width - filled);
  }
  
  private drawProgress() {
    if (!this.initialized || this.progressArea.length === 0) return;
    
    // Move cursor to progress area
    const terminalHeight = process.stdout.rows || 24;
    process.stdout.write(`\x1B[${terminalHeight - this.progressLines};1H`);
    // Draw progress bars
    process.stdout.write(this.progressArea.join('\n'));
    // Move cursor back to content area
    process.stdout.write(`\x1B[${terminalHeight - this.progressLines - 1};1H`);
  }
}
