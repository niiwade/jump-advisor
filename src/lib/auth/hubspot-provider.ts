/**
 * HubSpot OAuth Provider for NextAuth.js
 * 
 * Required scopes for contacts access:
 * - crm.schemas.contacts.read
 * - oauth
 */

// Define types for the provider
type HubspotProviderOptions = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

type HubspotProfile = {
  id?: string;
  user_id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

type ProviderConfig = {
  token?: {
    url?: string;
  };
};

type TokenRequestParams = {
  code: string;
  [key: string]: string;
};

type TokenRequestContext = {
  params: TokenRequestParams;
  provider: ProviderConfig;
};

type UserInfoRequestContext = {
  tokens: TokenResponse;
};

// HubSpot OAuth provider implementation
export default function HubspotProvider(options: HubspotProviderOptions) {
  return {
    id: "hubspot",
    name: "HubSpot",
    type: "oauth",
    allowDangerousEmailAccountLinking: true, // Allow linking accounts with the same email
    authorization: {
      url: "https://app.hubspot.com/oauth/authorize",
      params: {
        client_id: options.clientId,
        // Match exactly the scopes configured in the HubSpot app
        scope: "crm.schemas.contacts.read oauth",
        redirect_uri: options.callbackUrl,
      },
    },
    token: {
      url: "https://api.hubapi.com/oauth/v1/token",
      async request({ params, provider }: TokenRequestContext) {
        const response = await fetch((provider as ProviderConfig).token?.url as string, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: options.clientId,
            client_secret: options.clientSecret,
            redirect_uri: options.callbackUrl,
            code: params.code as string,
          }),
        });

        const tokens = await response.json() as TokenResponse;
        return { tokens };
      },
    },
    userinfo: {
      url: "https://api.hubapi.com/oauth/v1/access-tokens/",
      async request({ tokens }: UserInfoRequestContext) {
        const response = await fetch(`${this.url}/${tokens.access_token}`, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        });
        return response.json() as Promise<HubspotProfile>;
      },
    },
    profile(profile: HubspotProfile) {
      // Debug the profile data
      console.log('HubSpot profile data:', JSON.stringify(profile, null, 2));
      
      // Ensure we have an email
      if (!profile.email) {
        throw new Error('HubSpot profile is missing email field');
      }
      
      return {
        id: profile.user_id || profile.id || 'hubspot-user',
        email: profile.email,
        name: profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.email.split('@')[0],
        image: null,
      };
    },
  };
}
