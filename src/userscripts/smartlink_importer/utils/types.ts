export interface ServiceElement {
    cacheKey: string;
    element: HTMLElement;
    service: string;
    label: string;
    action: string;
    sourceUrl: string;
    skipReason?: string | undefined;
}

export interface SmartLinkImporterConfig {
    /** Short identifier used for DOM IDs, cache isolation, and log messages. */
    id: string;
    siteName: string;
    collectServiceElements: () => ServiceElement[];
    resolveDestination: (element: ServiceElement) => string | Promise<string>;
    mountPanel?: (panel: HTMLElement) => void;
}
