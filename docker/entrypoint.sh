#!/bin/sh
set -e

echo "Starting Boomer AI..."

# Initialize database if it doesn't exist
if [ ! -f /app/data/app.db ]; then
    echo "Initializing database..."
    npx prisma db push --skip-generate
    echo "Seeding database..."
    npx prisma db seed
    echo "Database initialized successfully!"
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
