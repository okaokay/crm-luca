export type PortalKind = 'FEED_PULL';

export type PortalRequirement =
  | 'price'
  | 'image'
  | 'giComuneIstat'
  | 'giListingId'
  | 'location'
  | 'description'
  | 'reference';

export type PortalConfigMode = 'CENTRALIZZATO';

export type PortalRegistryItem = {
  id: string;
  label: string;
  kind: PortalKind;
  modeLabel: string;
  implemented: boolean;
  configMode: PortalConfigMode;
  feedPath?: string | null;
  requirements: PortalRequirement[];
};

export const PORTAL_REGISTRY: PortalRegistryItem[] = [
  {
    id: 'ONECLICKANNUNCI',
    label: '1clickannunci',
    kind: 'FEED_PULL',
    modeLabel: 'Feed (pull HTTP)',
    implemented: true,
    configMode: 'CENTRALIZZATO',
    feedPath: '/feeds/1clickannunci.xml',
    requirements: ['giComuneIstat', 'description', 'reference']
  }
];

