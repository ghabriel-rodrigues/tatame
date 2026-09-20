// Runs before each spec file's imports: `ConfigModule.forRoot` validates the
// environment when the AppModule graph is first imported, which happens
// before createTestApp() can point DATABASE_URL at the per-suite fresh
// database. Seed placeholders here; the typed APP_CONFIG provider re-reads
// process.env at application instantiation, when the real values are set.
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??=
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env['JWT_ACCESS_SECRET'] ??= 'e2e-jwt-secret-with-32-characters!!';
delete process.env['RESEND_API_KEY'];
