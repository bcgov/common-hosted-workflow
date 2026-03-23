interface TeamsLinkData {
  channelId: string | null;
  groupId: string | null;
  tenantId: string | null;
}

export function parseTeamsLink(urlString: string): TeamsLinkData {
  try {
    const url = new URL(urlString.trim());
    const params = url.searchParams;

    // The channel ID is located in the path: /l/channel/<channelId>/<title>
    // We split the path and filter out empty strings to find it.
    const pathParts = url.pathname.split('/').filter((part) => part.length > 0);

    // Standard structure: ["l", "channel", "CHANNEL_ID", "TITLE"]
    const channelId = pathParts.length >= 3 ? decodeURIComponent(pathParts[2]) : null;

    return {
      channelId,
      groupId: params.get('groupId'),
      tenantId: params.get('tenantId'),
    };
  } catch (error) {
    console.error('Invalid URL provided', error);
    return { channelId: null, groupId: null, tenantId: null };
  }
}
