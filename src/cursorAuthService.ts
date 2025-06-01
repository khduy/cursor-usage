import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import initSqlJs from 'sql.js';
import { log } from './utils/logger';
import { execSync } from 'child_process';

export class CursorAuthService {
    private getCursorDBPath(): string {
        // Check for custom path in settings
        const config = vscode.workspace.getConfiguration('cursorUsage');
        const customPath = config.get<string>('customDatabasePath');
        
        if (customPath && customPath.trim() !== '') {
            log(`Using custom database path: ${customPath}`);
            return customPath;
        }

        const folderName = vscode.env.appName;
        log(`App name: ${folderName}, Platform: ${process.platform}`);

        if (process.platform === 'win32') {
            return path.join(process.env.APPDATA || '', folderName, 'User', 'globalStorage', 'state.vscdb');
        } else if (process.platform === 'linux') {
            const isWSL = vscode.env.remoteName === 'wsl';
            if (isWSL) {
                const windowsUsername = this.getWindowsUsername();
                if (windowsUsername) {
                    log('WSL detected, using Windows filesystem');
                    return path.join('/mnt/c/Users', windowsUsername, 'AppData/Roaming', folderName, 'User/globalStorage/state.vscdb');
                }
            }
            return path.join(os.homedir(), '.config', folderName, 'User', 'globalStorage', 'state.vscdb');
        } else if (process.platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', folderName, 'User', 'globalStorage', 'state.vscdb');
        }
        return path.join(os.homedir(), '.config', folderName, 'User', 'globalStorage', 'state.vscdb');
    }

    private getWindowsUsername(): string | undefined {
        try {
            // Executes cmd.exe and echoes the %USERNAME% variable
            const result = execSync('cmd.exe /C "echo %USERNAME%"', { encoding: 'utf8' });
            const username = result.trim();
            log(`Windows username detected: ${username}`);
            return username || undefined;
        } catch (error) {
            log('Error getting Windows username: ' + error, true);
            return undefined;
        }
    }

    private async exploreDatabaseStructure(db: any): Promise<void> {
        try {
            log('Exploring database structure...');
            
            // Get all tables
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            log('Available tables:');
            if (tables.length > 0) {
                tables[0].values.forEach((row: any) => {
                    log(`  - ${row[0]}`);
                });
            }

            // Look for auth-related keys in ItemTable
            const authKeys = db.exec("SELECT key FROM ItemTable WHERE key LIKE '%auth%' OR key LIKE '%token%' OR key LIKE '%cursor%' LIMIT 20");
            log('Auth-related keys found:');
            if (authKeys.length > 0) {
                authKeys[0].values.forEach((row: any) => {
                    log(`  - ${row[0]}`);
                });
            }

            // Get some sample keys to understand the pattern
            const sampleKeys = db.exec("SELECT key FROM ItemTable LIMIT 10");
            log('Sample keys from ItemTable (first 10):');
            if (sampleKeys.length > 0) {
                sampleKeys[0].values.forEach((row: any) => {
                    log(`  - ${row[0]}`);
                });
            }

        } catch (error) {
            log('Error exploring database structure: ' + error, true);
        }
    }

    public async getSessionToken(): Promise<string> {
        try {
            const dbPath = this.getCursorDBPath();
            log(`Attempting to open database at: ${dbPath}`);

            if (!fs.existsSync(dbPath)) {
                log('Database file does not exist', true);
                throw new Error(`Cursor database not found at: ${dbPath}. Please ensure Cursor is installed and you are logged in.`);
            }

            const dbBuffer = fs.readFileSync(dbPath);
            log(`Database file read, size: ${dbBuffer.length} bytes`);
            
            const SQL = await initSqlJs();
            const db = new SQL.Database(new Uint8Array(dbBuffer));
            log('Database opened successfully');

            const result = db.exec("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'");
            
            if (!result.length || !result[0].values.length) {
                log('No token found with standard key, exploring database...', true);
                
                // Explore database structure for debugging
                await this.exploreDatabaseStructure(db);
                
                db.close();
                throw new Error('Cursor auth token not found in database. Please ensure you are logged into Cursor.');
            }

            const token = result[0].values[0][0] as string;
            log(`Token found, length: ${token.length}`);
            log(`Token starts with: ${token.substring(0, 20)}...`);

            try {
                const decoded = jwt.decode(token, { complete: true });

                if (!decoded || !decoded.payload || !decoded.payload.sub) {
                    log('Invalid JWT structure: ' + JSON.stringify({ decoded }), true);
                    db.close();
                    throw new Error('Invalid JWT token structure');
                }

                const sub = decoded.payload.sub.toString();
                log(`JWT sub field: ${sub}`);
                
                const userId = sub.includes('|') ? sub.split('|')[1] : sub;
                log(`Extracted user ID: ${userId}`);
                
                const sessionToken = `${userId}%3A%3A${token}`;
                log(`Session token created, length: ${sessionToken.length}`);
                
                db.close();
                return sessionToken;
                
            } catch (error: any) {
                log('Error processing token: ' + error.message, true);
                log('Token processing error details: ' + JSON.stringify({
                    name: error.name,
                    message: error.message
                }), true);
                db.close();
                throw new Error(`Failed to process authentication token: ${error.message}`);
            }
        } catch (error: any) {
            log('Error in getSessionToken: ' + error.message, true);
            throw new Error(`Failed to get session token: ${error.message}`);
        }
    }

    public async getUserIdFromToken(): Promise<string> {
        try {
            const sessionToken = await this.getSessionToken();
            // Extract user ID from session token
            const userIdMatch = sessionToken.match(/^([^%]+)/);
            if (!userIdMatch) {
                throw new Error('Could not extract user ID from session token');
            }
            return userIdMatch[1];
        } catch (error: any) {
            log('Failed to get user ID from token: ' + error.message, true);
            throw new Error(`Failed to get user ID from token: ${error.message}`);
        }
    }
} 