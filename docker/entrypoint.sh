#!/bin/sh
set -e

echo "Starting Boomer AI..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -p 5432 -U boomerai -d boomerai_db; do
    echo "PostgreSQL not ready, waiting..."
    sleep 2
done
echo "PostgreSQL is ready!"

# Check if database is initialized by checking if AppConfig table has data
ROWS=$(echo "SELECT COUNT(*) FROM \"AppConfig\";" | npx prisma db execute --stdin 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

if [ "$ROWS" = "0" ] || [ -z "$ROWS" ]; then
    echo "Database not initialized. Running migrations and seed..."

    # Push schema to database
    npx prisma db push --skip-generate --accept-data-loss

    # Seed the database
    npx prisma db seed

    echo "Database initialized!"
else
    echo "Database already initialized ($ROWS config rows). Skipping seed."
fi

# Determine which server to start based on command
case "$1" in
    app)
        echo "Starting main app server on port 3000..."
        exec node dist/server.js
        ;;
    admin)
        echo "Starting admin server on port 3001..."
        exec node dist/adminServer.js
        ;;
    *)
        echo "Usage: entrypoint.sh {app|admin}"
        exit 1
        ;;
esac
