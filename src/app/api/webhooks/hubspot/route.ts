import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processHubspotEvent } from "@/lib/webhooks/hubspot-handler";
import crypto from "crypto";

/**
 * HubSpot Webhook Handler
 * 
 * This endpoint receives notifications from HubSpot when contacts or deals change.
 * It processes the updates and syncs the changes to our database.
 * 
 * Documentation: https://developers.hubspot.com/docs/api/webhooks
 */
export async function POST(req: Request) {
  try {
    // Get the raw request body for signature verification
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    
    // Get headers for verification
    const headers = Object.fromEntries(req.headers);
    const hubspotSignature = headers["x-hubspot-signature"];
    
    // Verify the webhook signature
    const isValid = verifyHubspotSignature(
      hubspotSignature as string, 
      process.env.HUBSPOT_CLIENT_SECRET as string,
      rawBody
    );
    
    if (!isValid) {
      console.error("Invalid HubSpot webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    
    // Extract the subscription ID from the request
    const subscriptionId = headers["x-hubspot-subscription-id"] as string;
    if (!subscriptionId) {
      console.error("Missing subscription ID in HubSpot webhook");
      return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });
    }
    
    // Find the user associated with this subscription
    const subscription = await prisma.webhookSubscription.findFirst({
      where: {
        externalId: subscriptionId,
        service: "HUBSPOT"
      },
      include: {
        user: true,
      },
    });
    
    if (!subscription?.user) {
      console.error(`No user found for HubSpot subscription: ${subscriptionId}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Process each event in the webhook payload
    const events = Array.isArray(body) ? body : [body];
    
    for (const event of events) {
      // Process the event asynchronously
      processHubspotEvent(subscription.user.id, event)
        .catch(error => console.error("Error processing HubSpot event:", error));
    }
    
    // Respond immediately to the webhook
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling HubSpot webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Verify the HubSpot webhook signature
 * 
 * @param signature The signature from the X-HubSpot-Signature header
 * @param clientSecret The HubSpot client secret
 * @param requestBody The raw request body
 * @returns Whether the signature is valid
 */
function verifyHubspotSignature(
  signature: string,
  clientSecret: string,
  requestBody: string
): boolean {
  if (!signature || !clientSecret) {
    return false;
  }
  
  const hmac = crypto.createHmac("sha256", clientSecret);
  hmac.update(requestBody);
  const calculatedSignature = hmac.digest("hex");
  
  return crypto.timingSafeEqual(
    Buffer.from(calculatedSignature),
    Buffer.from(signature)
  );
}
