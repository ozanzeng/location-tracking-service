/** Konumun kabul edilmeme sebebi; `locations_rejected_total` metriğinin `reason` etiketi. */
export enum RejectionReason {
  RATE_LIMITED = 'rate_limited',
  BACKPRESSURE = 'backpressure',
}
