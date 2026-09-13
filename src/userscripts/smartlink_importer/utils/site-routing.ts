export type SmartLinkSite = 'albumlink' | 'bandlink' | 'bfan' | 'fanlink' | 'ffm' | 'promolinks' | 'songlink';

const DOMAINS_BY_SITE: Readonly<Record<SmartLinkSite, readonly string[]>> = {
    albumlink: ['album.link'],
    bandlink: ['band.link'],
    bfan: ['bfan.link'],
    fanlink: ['fanlink.tv'],
    ffm: ['ffm.to', 'orcd.co'],
    promolinks: ['promolinks.me'],
    songlink: ['song.link'],
};

export function smartLinkSiteForHostname(hostname: string): SmartLinkSite | undefined {
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    for (const [site, domains] of Object.entries(DOMAINS_BY_SITE) as Array<[SmartLinkSite, readonly string[]]>) {
        if (domains.some(domain => normalized === domain || normalized.endsWith(`.${domain}`))) return site;
    }
    return undefined;
}
