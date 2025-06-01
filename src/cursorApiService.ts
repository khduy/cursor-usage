import fetch from 'node-fetch';
import { log } from './utils/logger';

export interface UsageData {
    'gpt-4': {
        numRequests: number;
        numRequestsTotal: number;
        numTokens: number;
        maxRequestUsage: number | null;
        maxTokenUsage: number | null;
    };
    'gpt-3.5-turbo': {
        numRequests: number;
        numRequestsTotal: number;
        numTokens: number;
        maxRequestUsage: number | null;
        maxTokenUsage: number | null;
    };
    'gpt-4-32k': {
        numRequests: number;
        numRequestsTotal: number;
        numTokens: number;
        maxRequestUsage: number | null;
        maxTokenUsage: number | null;
    };
    startOfMonth: string;
}

export class CursorApiService {
    private readonly BASE_URL = 'https://www.cursor.com/api';

    private async makeAuthenticatedRequest<T>(
        endpoint: string,
        sessionToken: string,
        options: Record<string, any> = {}
    ): Promise<T> {
        const url = `${this.BASE_URL}${endpoint}`;
        
        log(`Making API request to: ${url}`);
        log(`Session token length: ${sessionToken.length}`);
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
                'User-Agent': 'VSCode Extension',
                ...options.headers
            }
        });

        log(`API response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            log(`API request failed with status ${response.status}: ${errorText}`, true);
            throw new Error(`API request failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        log(`API response received successfully`);
        return data as T;
    }

    public async getUsageInfo(sessionToken: string): Promise<UsageData> {
        try {
            log('Fetching usage info...');
            
            // Extract user ID from session token for the usage endpoint
            const userIdMatch = sessionToken.match(/^([^%]+)/);
            if (!userIdMatch) {
                log('Could not extract user ID from session token', true);
                throw new Error('Could not extract user ID from session token');
            }
            const userId = userIdMatch[1];
            log(`Extracted user ID for usage API: ${userId}`);

            const result = await this.makeAuthenticatedRequest<UsageData>(
                `/usage?user=${userId}`, 
                sessionToken
            );
            
            log('Usage info fetched successfully');
            log(`GPT-4 requests: ${result['gpt-4']?.numRequests || 0}/${result['gpt-4']?.maxRequestUsage || 'unlimited'}`);
            
            return result;
        } catch (error: any) {
            log('Failed to fetch usage info: ' + error.message, true);
            throw new Error(`Failed to fetch usage info: ${error.message}`);
        }
    }
} 