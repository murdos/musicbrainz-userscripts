export function nextCacheKey(counters: Map<string, number>, service: string): string {
    const count = (counters.get(service) ?? 0) + 1;
    counters.set(service, count);
    return count === 1 ? service : `${service}:${count}`;
}
