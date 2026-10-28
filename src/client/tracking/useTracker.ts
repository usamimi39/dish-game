import { useEffect, useState } from "react";
import { Tracker } from "./tracker";

export function useTracker(enabled: boolean, deviceId: string | null) {
	const [tracker, setTracker] = useState<Tracker | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!enabled) return;
		const t = new Tracker();
		let cancelled = false;
		setError(null);
		t.start(deviceId)
			.then(() => !cancelled && setTracker(t))
			.catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			cancelled = true;
			t.destroy();
			setTracker(null);
		};
	}, [enabled, deviceId]);

	return { tracker, error };
}
