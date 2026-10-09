const DEFAULT_MIRRORS = ['https://de1.api.radio-browser.info/json', 'https://nl1.api.radio-browser.info/json', 'https://at1.api.radio-browser.info/json'];
/** Hedge a stalled directory request; never wait indefinitely for one mirror. */
export async function fetchRadioDirectory<T>(path: string): Promise<T> {
  const configured = process.env.RADIO_BROWSER_API_BASE;
  const mirrors = configured ? [configured] : DEFAULT_MIRRORS;
  const controllers = mirrors.map(() => new AbortController());
  const timers: ReturnType<typeof setTimeout>[] = [];
  const deadline = setTimeout(() => controllers.forEach(controller => controller.abort()), 6500);
  try {
    return await Promise.any(mirrors.map(async (base, index) => {
      if (index) await new Promise<void>(resolve => { timers.push(setTimeout(resolve, index * 700)); });
      if (controllers[index].signal.aborted) throw new Error('Directory request cancelled');
      const response = await fetch(`${base}${path}`, { signal: controllers[index].signal, headers: { 'User-Agent': 'WaveAtlas/1.0' }, next: { revalidate: 300 } });
      if (!response.ok) throw new Error(`Radio directory ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid radio directory response');
      return data as T;
    }));
  } finally { clearTimeout(deadline); timers.forEach(clearTimeout); controllers.forEach(controller => controller.abort()); }
}
