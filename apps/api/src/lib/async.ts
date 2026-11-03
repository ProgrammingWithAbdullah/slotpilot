/** Tracks fire-and-forget work so tests and graceful shutdown can wait for it. */
export class BackgroundTasks {
  private readonly inflight = new Set<Promise<void>>();

  run(task: () => Promise<unknown>, onError: (err: unknown) => void): void {
    const p: Promise<void> = task()
      .then(() => undefined)
      .catch(onError)
      .finally(() => this.inflight.delete(p));
    this.inflight.add(p);
  }

  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }
}
