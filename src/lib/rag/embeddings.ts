import { OpenAI } from "openai";

// Initialize OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Maximum token limit for text-embedding-ada-002 model
const MAX_TOKEN_LIMIT = 4000; // Setting very conservatively below the actual limit of 8192

// More conservative token estimation (3 chars ~= 1 token to be safe)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3);
}

// Function to truncate text to fit within token limit
function truncateText(text: string): string {
  // If text is likely under the limit, return as is
  if (estimateTokenCount(text) <= MAX_TOKEN_LIMIT) {
    return text;
  }
  
  // Otherwise, truncate to approximately MAX_TOKEN_LIMIT tokens
  // This is a simple approach - just take the first N characters
  // We use a more conservative multiplier (3 instead of 4) to ensure we stay under the limit
  console.log(`Text too long (est. ${estimateTokenCount(text)} tokens), truncating to ~${MAX_TOKEN_LIMIT} tokens`);
  return text.substring(0, MAX_TOKEN_LIMIT * 3);
}

// Generate embeddings for text
export async function generateEmbedding(text: string) {
  try {
    // Truncate text if it's too long
    const processedText = truncateText(text);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: processedText,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate embedding");
  }
}
