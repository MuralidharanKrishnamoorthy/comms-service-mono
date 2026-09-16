export function createRateLimiter(windowMs) {
    const hits = new Map();
    const within = (key, now) => (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    const prune = (now) => {
        for (const [key, recorded] of hits) {
            if (recorded.every((at) => now - at >= windowMs))
                hits.delete(key);
        }
    };
    return {
        reserve(quotas) {
            const now = Date.now();
            prune(now);
            const current = quotas.map((quota) => ({ ...quota, recorded: within(quota.key, now) }));
            if (current.some(({ recorded, max }) => recorded.length >= max)) {
                for (const { key, recorded } of current)
                    hits.set(key, recorded);
                return null;
            }
            for (const { key, recorded } of current) {
                recorded.push(now);
                hits.set(key, recorded);
            }
            return () => {
                for (const { key } of current) {
                    const recorded = hits.get(key);
                    if (!recorded)
                        continue;
                    const index = recorded.indexOf(now);
                    if (index !== -1)
                        recorded.splice(index, 1);
                    if (recorded.length === 0)
                        hits.delete(key);
                }
            };
        },
        reset(key) {
            hits.delete(key);
        },
    };
}
