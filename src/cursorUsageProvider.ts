import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { CursorAuthService } from './cursorAuthService';
import { CursorApiService } from './cursorApiService';
import { log } from './utils/logger';

export class CursorUsageProvider {
    private authService: CursorAuthService;
    private apiService: CursorApiService;

    constructor() {
        this.authService = new CursorAuthService();
        this.apiService = new CursorApiService();
        log('CursorUsageProvider initialized');
    }

    public async getUsageData(): Promise<any> {
        try {
            log('Fetching fresh data from API...');
            
            // Get auth token
            log('Getting session token...');
            const sessionToken = await this.authService.getSessionToken();
            log('Session token obtained, length: ' + sessionToken.length);
            
            // Fetch usage info only
            log('Fetching usage info...');
            const usageInfo = await this.apiService.getUsageInfo(sessionToken);

            log('Usage info received: ' + (usageInfo ? 'Yes' : 'No'));
            log('GPT-4 usage: ' + (usageInfo?.['gpt-4']?.numRequests || 'Unknown'));

            const data = {
                usageInfo,
                lastUpdated: new Date().toISOString()
            };

            log('Fresh data fetched successfully');
            return data;

        } catch (error: any) {
            log('Error fetching usage data: ' + error.message, true);
            throw error;
        }
    }
} 