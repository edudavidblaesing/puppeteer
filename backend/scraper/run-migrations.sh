#!/bin/bash
# Run all database migrations in order
# This script is idempotent - safe to run multiple times

set -e

echo "Starting database migrations..."

# Wait for postgres to be ready
until pg_isready -h ${PGHOST:-postgres} -p ${PGPORT:-5432} -U ${PGUSER:-eventuser} 2>/dev/null; do
    echo "Waiting for PostgreSQL to be ready..."
    sleep 2
done

echo "PostgreSQL is ready!"

# Create migrations tracking table if it doesn't exist
psql -h ${PGHOST:-postgres} -p ${PGPORT:-5432} -U ${PGUSER:-eventuser} -d ${PGDATABASE:-socialevents} <<EOSQL
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOSQL

# Run each migration file in order
MIGRATION_DIR="/usr/src/app/migrations"

for migration in $(ls -1 $MIGRATION_DIR/*.sql 2>/dev/null | sort); do
    filename=$(basename "$migration")
    version="${filename%.*}"
    
    # Check if migration has already been applied
    already_applied=$(psql -h ${PGHOST:-postgres} -p ${PGPORT:-5432} -U ${PGUSER:-eventuser} -d ${PGDATABASE:-socialevents} -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version'")
    
    if [ "$already_applied" -eq "0" ]; then
        echo "Applying migration: $filename"
        psql -h ${PGHOST:-postgres} -p ${PGPORT:-5432} -U ${PGUSER:-eventuser} -d ${PGDATABASE:-socialevents} -f "$migration"
        psql -h ${PGHOST:-postgres} -p ${PGPORT:-5432} -U ${PGUSER:-eventuser} -d ${PGDATABASE:-socialevents} -c "INSERT INTO schema_migrations (version) VALUES ('$version')"
        echo "Migration $filename applied successfully"
    else
        echo "Migration $filename already applied, skipping"
    fi
done

echo "All migrations completed!"
