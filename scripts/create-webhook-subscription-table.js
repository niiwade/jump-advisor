// Script to manually create the WebhookSubscription table
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function createWebhookSubscriptionTable() {
  try {
    // Execute raw SQL to create the table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "WebhookSubscription" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "service" TEXT NOT NULL,
        "externalId" TEXT NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        
        CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "WebhookSubscription_externalId_key" UNIQUE ("externalId"),
        CONSTRAINT "WebhookSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `;
    
    // Create indexes
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "WebhookSubscription_userId_idx" ON "WebhookSubscription"("userId")`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "WebhookSubscription_service_idx" ON "WebhookSubscription"("service")`;
    
    console.log('WebhookSubscription table created successfully');
  } catch (error) {
    console.error('Error creating WebhookSubscription table:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createWebhookSubscriptionTable();
