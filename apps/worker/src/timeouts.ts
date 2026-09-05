export async function bounded<T>(work: Promise<T>, timeoutMs = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Dependency timeout')), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
