import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function replaceFile() {
  try {
    const sourcePath = path.join(__dirname, '..', 'src', 'app', 'api', 'instructions', '[id]', 'route.ts.new');
    const destPath = path.join(__dirname, '..', 'src', 'app', 'api', 'instructions', '[id]', 'route.ts');
    
    // Read the new file content
    const content = await fs.readFile(sourcePath, 'utf-8');
    
    // Write to destination
    await fs.writeFile(destPath, content, 'utf-8');
    
    // Remove the temp file
    await fs.unlink(sourcePath);
    
    console.log('File replaced successfully');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

replaceFile();
