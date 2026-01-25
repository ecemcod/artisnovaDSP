const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class MigrationRunner {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.migrationsDir = path.join(__dirname, 'migrations');
    }

    async run() {
        const db = new sqlite3.Database(this.dbPath);
        
        try {
            // Ensure migrations table exists
            await this.createMigrationsTable(db);
            
            // Get applied migrations
            const appliedMigrations = await this.getAppliedMigrations(db);
            
            // Get available migrations
            const availableMigrations = this.getAvailableMigrations();
            
            // Run pending migrations
            for (const migration of availableMigrations) {
                if (!appliedMigrations.includes(migration.version)) {
                    console.log(`Running migration ${migration.version}: ${migration.name}`);
                    await this.runMigration(db, migration);
                    console.log(`Migration ${migration.version} completed successfully`);
                }
            }
            
            console.log('All migrations completed successfully');
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        } finally {
            db.close();
        }
    }

    async rollback(targetVersion = null) {
        const db = new sqlite3.Database(this.dbPath);
        
        try {
            const appliedMigrations = await this.getAppliedMigrations(db);
            const availableMigrations = this.getAvailableMigrations();
            
            // Find migrations to rollback
            const migrationsToRollback = appliedMigrations
                .filter(version => targetVersion === null || version > targetVersion)
                .sort((a, b) => b - a); // Rollback in reverse order
            
            for (const version of migrationsToRollback) {
                const migration = availableMigrations.find(m => m.version === version);
                if (migration && migration.rollback) {
                    console.log(`Rolling back migration ${version}: ${migration.name}`);
                    await this.runRollback(db, migration);
                    console.log(`Rollback ${version} completed successfully`);
                }
            }
            
            console.log('Rollback completed successfully');
        } catch (error) {
            console.error('Rollback failed:', error);
            throw error;
        } finally {
            db.close();
        }
    }

    createMigrationsTable(db) {
        return new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    getAppliedMigrations(db) {
        return new Promise((resolve, reject) => {
            db.all('SELECT version FROM schema_migrations ORDER BY version', (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => row.version));
            });
        });
    }

    getAvailableMigrations() {
        const files = fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        return files.map(file => {
            const match = file.match(/^(\d+)_(.+)\.sql$/);
            if (!match) {
                throw new Error(`Invalid migration filename: ${file}`);
            }
            
            const version = parseInt(match[1]);
            const name = match[2].replace(/_/g, ' ');
            const filePath = path.join(this.migrationsDir, file);
            
            return {
                version,
                name,
                filePath,
                sql: fs.readFileSync(filePath, 'utf8')
            };
        });
    }

    runMigration(db, migration) {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Execute migration SQL
                db.exec(migration.sql, (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    
                    // Record migration as applied
                    db.run(
                        'INSERT INTO schema_migrations (version) VALUES (?)',
                        [migration.version],
                        (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            db.run('COMMIT', (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        }
                    );
                });
            });
        });
    }

    runRollback(db, migration) {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Execute rollback SQL if available
                if (migration.rollback) {
                    db.exec(migration.rollback, (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        this.removeFromMigrations(db, migration.version, resolve, reject);
                    });
                } else {
                    this.removeFromMigrations(db, migration.version, resolve, reject);
                }
            });
        });
    }

    removeFromMigrations(db, version, resolve, reject) {
        db.run(
            'DELETE FROM schema_migrations WHERE version = ?',
            [version],
            (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }
                
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            }
        );
    }
}

// CLI interface
if (require.main === module) {
    const command = process.argv[2];
    const dbPath = process.argv[3] || path.join(__dirname, 'history.db');
    
    const runner = new MigrationRunner(dbPath);
    
    switch (command) {
        case 'migrate':
            runner.run().catch(console.error);
            break;
        case 'rollback':
            const targetVersion = process.argv[4] ? parseInt(process.argv[4]) : null;
            runner.rollback(targetVersion).catch(console.error);
            break;
        default:
            console.log('Usage: node migration-runner.js <migrate|rollback> [db_path] [target_version]');
            process.exit(1);
    }
}

module.exports = MigrationRunner;