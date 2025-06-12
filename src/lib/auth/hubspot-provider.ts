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
      async request(context: { params: { code: string } }) {
        // HubSpot requires client_id and client_secret in the POST body
        const params = new URLSearchParams({
          code: context.params.code,
          grant_type: "authorization_code",
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.callbackUrl,
        });
        
        const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString(),
        });
        
        const tokens = await response.json();
        return { tokens };
      },
    },
    userinfo: {
      url: "https://api.hubapi.com/oauth/v1/access-tokens/",
      async request({ tokens }: { tokens: { access_token: string } }) {
        // First get the token info
        const tokenResponse = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${tokens.access_token}`, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        });
        
        if (!tokenResponse.ok) {
          throw new Error(`Failed to get token info: ${tokenResponse.status} ${tokenResponse.statusText}`);
        }
        
        const tokenInfo = await tokenResponse.json();
        console.log('HubSpot token info:', JSON.stringify(tokenInfo, null, 2));
        
        // Then get the user info using the HubSpot API
        try {
          // Try to get user info from HubSpot API
          const userResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            console.log('HubSpot user data:', JSON.stringify(userData, null, 2));
            
            // Combine data from both endpoints
            return {
              ...tokenInfo,
              ...userData,
              email: userData.email || tokenInfo.user,  // Ensure we have an email
              user_id: tokenInfo.user_id || userData.user_id || tokenInfo.hub_id,
            };
          }
        } catch (error) {
          console.error('Error fetching HubSpot user data:', error);
        }
        
        // Fallback to just the token info if user info fails
        return {
          ...tokenInfo,
          email: tokenInfo.user,  // Use the user field as email
        };
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
    options,
  };
}
