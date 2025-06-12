import { ingestEmails } from './lib/rag/ingestion';

// Test the ingestEmails function
async function testIngestEmails() {
  try {
    // Use a test user ID
    const userId = "cmbt9rbq90004i4g81hic7cxn";
    
    console.log('Starting email ingestion test...');
    const result = await ingestEmails(userId);
    
    console.log('Email ingestion result:', JSON.stringify(result, null, 2));
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run the test
testIngestEmails();
