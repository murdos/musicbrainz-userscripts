import { createAlbumLinkConfig } from '~/userscripts/smartlink_importer/utils/configs/albumlink';
import { createBandLinkConfig } from '~/userscripts/smartlink_importer/utils/configs/bandlink';
import { createBfanConfig } from '~/userscripts/smartlink_importer/utils/configs/bfan';
import { createFanlinkConfig } from '~/userscripts/smartlink_importer/utils/configs/fanlink';
import { createFfmConfig } from '~/userscripts/smartlink_importer/utils/configs/ffm';
import { runSmartLinkImporter } from '~/userscripts/smartlink_importer/utils/runtime';
import { smartLinkSiteForHostname, type SmartLinkSite } from '~/userscripts/smartlink_importer/utils/site-routing';
import type { SmartLinkImporterConfig } from '~/userscripts/smartlink_importer/utils/types';

const configFactories: Record<SmartLinkSite, () => SmartLinkImporterConfig | undefined> = {
    albumlink: createAlbumLinkConfig,
    bandlink: createBandLinkConfig,
    bfan: createBfanConfig,
    fanlink: createFanlinkConfig,
    ffm: createFfmConfig,
};

const site = smartLinkSiteForHostname(window.location.hostname);
const config = site ? configFactories[site]() : undefined;
if (config) void runSmartLinkImporter(config);
