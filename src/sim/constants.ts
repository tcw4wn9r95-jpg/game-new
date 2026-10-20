/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 10;
export const TICK_MS = 1000 / TICK_RATE;
/** Seconds per tick. */
export const DT = 1 / TICK_RATE;

export type ResourceKind = 'food' | 'wood' | 'gold' | 'stone';
export const RESOURCE_KINDS: ResourceKind[] = ['food', 'wood', 'gold', 'stone'];
