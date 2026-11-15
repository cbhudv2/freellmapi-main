import dotenv from 'dotenv';

// Docker Compose injects production values directly. Loading one root file
// keeps local development convenient without retaining desktop embedder paths.
dotenv.config({ path: process.env.LLMAPI_ENV_PATH ?? '.env' });
