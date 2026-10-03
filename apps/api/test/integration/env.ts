// Loaded before any module: point the app at the test database and disable workers.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.JOBS_ENABLED = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '10000';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR_TEST ?? './storage-test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-test-secret-integration-test-secret';
