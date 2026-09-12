import { getGmApi } from '~/lib/userscript-api';

/**
 * Follow a provider link and return its final destination URL.
 *
 * This must use the userscript manager’s privileged request API. Provider redirects cross origins and generally do not expose CORS headers, so native `fetch` either rejects the request or returns an opaque response without an accessible final URL.
 */
export function followRedirect(sourceUrl: string): Promise<string> {
    const request = getGmApi('xmlHttpRequest');
    if (!request) return Promise.reject(new Error('No userscript cross-origin request API is available'));

    return new Promise((resolve, reject) => {
        const failed = (): void => {
            reject(new Error(`Could not resolve ${sourceUrl}`));
        };
        request({
            method: 'GET',
            url: sourceUrl,
            timeout: 20_000,
            onload: response => {
                const destination = response.finalUrl;
                if (response.status >= 200 && response.status < 400 && destination) resolve(destination);
                else failed();
            },
            onerror: failed,
            ontimeout: failed,
        });
    });
}
