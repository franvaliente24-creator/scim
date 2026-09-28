# Deploy to scim.greatsolomonmpservices.com

This package works as a standard PHP 8.2+ upload and also includes a Dockerfile for HostForge managed deployment.

1. In HostForge, make sure the `scim.greatsolomonmpservices.com` subdomain points to its own document root and select PHP 8.2 or newer.
2. Create one MariaDB/MySQL database and a database user with full privileges for that database.
3. Import `init.sql` using phpMyAdmin or the database import feature.
4. Rename `config.example.php` to `config.php` and enter the database host, name, user, and password.
5. Upload every file and folder in this package to the **document root for the scim subdomain**. Do not upload the enclosing package folder itself.
6. Visit `https://scim.greatsolomonmpservices.com`, then sign in with `admin@greatsolomon.test` and `Welcome123!`.

The demo login should be replaced with real users and password hashes before production use. HTTPS must remain enabled.

## HostForge application setup

When deploying from a GitHub repository, set database credentials as HostForge environment variables rather than adding `config.php` to Git:

- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`

HostForge detects the included Dockerfile, builds the application, and exposes port `80`.
