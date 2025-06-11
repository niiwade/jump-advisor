import { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

interface HubspotProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export default function HubspotProvider<P extends HubspotProfile>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: "hubspot",
    name: "HubSpot",
    type: "oauth",
    authorization: {
      url: "https://app.hubspot.com/oauth/authorize",
      params: {
        client_id: options.clientId,
        scope: "contacts content",
        redirect_uri: options.callbackUrl,
      },
    },
    token: "https://api.hubapi.com/oauth/v1/token",
    userinfo: {
      url: "https://api.hubapi.com/oauth/v1/access-tokens/",
      async request({ tokens, client }) {
        const profile = await client.userinfo(tokens.access_token as string);
        return profile;
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        email: profile.email,
        name: `${profile.firstName} ${profile.lastName}`,
        image: null,
      };
    },
    options,
  };
}
