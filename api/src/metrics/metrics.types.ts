/** Worker'ın sağlık kontrolü: trafik (iş) alabilir mi. */
export type ReadinessCheck = () => Promise<boolean>;
