/**
 * Migration System for Project Schema Changes
 * 
 * Django/Alembic-style versioned migrations for evolving project format.
 * Migrations run automatically on project load.
 */

import type { Project } from '@/types/project'

/**
 * Migration interface - each migration transforms project from one schema version to the next
 */
export interface Migration {
    /** Schema version this migration upgrades TO */
    version: number
    /** Short name for logging */
    name: string
    /** Description of what this migration does */
    description: string
    /** Transform function - returns new project (should not mutate input) */
    migrate: (project: Project) => Project
}

/**
 * Migration Runner - manages and executes versioned migrations
 */
export class MigrationRunner {
    private migrations: Migration[] = []

    /**
     * Register a migration. Migrations must be registered in version order.
     */
    register(migration: Migration): this {
        this.migrations.push(migration)
        // Keep sorted by version
        this.migrations.sort((a, b) => a.version - b.version)
        return this
    }

    /**
     * Get current schema version of a project.
     * schemaVersion must be present on all projects.
     */
    getCurrentVersion(project: Project): number {
        const version = (project as any).schemaVersion
        if (typeof version !== 'number') {
            throw new Error('Project schemaVersion is missing or invalid')
        }
        return version
    }

    /**
     * Get the highest migration version available
     */
    getLatestVersion(): number {
        if (this.migrations.length === 0) return 0
        return this.migrations[this.migrations.length - 1].version
    }

    /**
     * Run all pending migrations on a project
     * Returns the migrated project (new object, original not mutated)
     */
    migrateProject(project: Project): Project {
        const currentVersion = this.getCurrentVersion(project)
        const pendingMigrations = this.migrations.filter(m => m.version > currentVersion)

        if (pendingMigrations.length === 0) {
            return project
        }

        let migratedProject = { ...project }

        for (const migration of pendingMigrations) {
            console.log(`[Migration] Running ${migration.name} (v${migration.version}): ${migration.description}`)
            migratedProject = migration.migrate(migratedProject)
                // Set schema version after each migration
                ; (migratedProject as any).schemaVersion = migration.version
        }

        console.log(`[Migration] Project migrated from v${currentVersion} to v${this.getLatestVersion()}`)
        return migratedProject
    }

    /**
     * Check if project needs migration
     */
    needsMigration(project: Project): boolean {
        return this.getCurrentVersion(project) < this.getLatestVersion()
    }
}

// Import and register all migrations
import { migration001 } from './migrations/001_timeline_space_effects'

/**
 * Singleton migration runner with all migrations registered
 */
export const migrationRunner = new MigrationRunner()
    .register(migration001)
