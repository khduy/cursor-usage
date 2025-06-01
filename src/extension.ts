import * as vscode from 'vscode';
import { CursorUsageProvider } from './cursorUsageProvider';
import { log } from './utils/logger';

// Constants
const COMMANDS = {
    REFRESH: 'cursorUsage.refresh'
} as const;

const STATUS_BAR_CONFIG = {
    ALIGNMENT: vscode.StatusBarAlignment.Right,
    PRIORITY: 100
} as const;

const ICONS = {
    PULSE: '$(pulse)',
    SYNC_SPIN: '$(sync~spin)'
} as const;

const MESSAGES = {
    LOADING: 'Loading Cursor usage data...',
    REFRESHING: 'Refreshing Cursor usage data...',
    ERROR_LOAD: 'Failed to load Cursor usage data. Click to retry.',
    ERROR_REFRESH: 'Error refreshing usage data. Click to retry.'
} as const;

// Interface definitions
interface UsageData {
    usageInfo: {
        'gpt-4': {
            numRequests: number;
            maxRequestUsage: number | '∞';
        };
        startOfMonth: string;
    };
    lastUpdated: string;
}

interface BillingCycleInfo {
    startDate: Date;
    nextRenewal: Date;
    daysRemaining: number;
}

interface FormattedDates {
    cycleStarted: string;
    renewsOn: string;
    lastUpdatedDate: string;
}

// Global variables
let statusBarItem: vscode.StatusBarItem;
let provider: CursorUsageProvider;

export function activate(context: vscode.ExtensionContext): void {
    log('Cursor Usage extension activating...');

    initializeProvider();
    createStatusBarItem();
    registerCommands(context);
    loadInitialData();

    log('Cursor Usage extension activated successfully');
}

function initializeProvider(): void {
    provider = new CursorUsageProvider();
}

function createStatusBarItem(): void {
    statusBarItem = vscode.window.createStatusBarItem(
        STATUS_BAR_CONFIG.ALIGNMENT,
        STATUS_BAR_CONFIG.PRIORITY
    );
    statusBarItem.text = `${ICONS.PULSE} Cursor Usage`;
    statusBarItem.tooltip = MESSAGES.LOADING;
    statusBarItem.command = COMMANDS.REFRESH;
    statusBarItem.show();
}

function registerCommands(context: vscode.ExtensionContext): void {
    const refreshCommand = vscode.commands.registerCommand(COMMANDS.REFRESH, async () => {
        log('Status bar clicked, refreshing data...');
        await refreshUsageData();
    });

    context.subscriptions.push(refreshCommand, statusBarItem);
}

function loadInitialData(): void {
    updateStatusBar();
}

async function refreshUsageData(): Promise<void> {
    try {
        log('Refreshing usage data...');
        setLoadingState();

        await updateStatusBar();

        log('Usage data refreshed successfully');
    } catch (error: any) {
        log('Error refreshing usage data: ' + error.message, true);
        setErrorState(MESSAGES.ERROR_REFRESH);
    }
}

function setLoadingState(): void {
    statusBarItem.text = `${ICONS.SYNC_SPIN} Refreshing...`;
    statusBarItem.tooltip = MESSAGES.REFRESHING;
}

function setErrorState(message: string): void {
    statusBarItem.text = `${ICONS.PULSE} Cursor: Error`;
    statusBarItem.tooltip = message;
}

function calculateBillingCycle(startOfMonth: string): BillingCycleInfo {
    const startDate = new Date(startOfMonth);
    const nextRenewal = new Date(startDate);
    nextRenewal.setMonth(nextRenewal.getMonth() + 1);

    const now = new Date();
    const daysRemaining = Math.ceil((nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return { startDate, nextRenewal, daysRemaining };
}

function formatDates(billingCycle: BillingCycleInfo, lastUpdated: string): FormattedDates {
    const cycleStarted = billingCycle.startDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });

    const renewsOn = billingCycle.nextRenewal.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const lastUpdatedDate = new Date(lastUpdated).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    return { cycleStarted, renewsOn, lastUpdatedDate };
}

function createDetailedTooltip(data: UsageData): vscode.MarkdownString {
    const { usageInfo, lastUpdated } = data;

    // Calculate billing cycle and format dates
    const billingCycle = calculateBillingCycle(usageInfo.startOfMonth);
    const dates = formatDates(billingCycle, lastUpdated);

    // Build markdown tooltip
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`Renew in ${billingCycle.daysRemaining} days (${dates.renewsOn})\n\n`);
    tooltip.appendMarkdown(`---\n`);
    tooltip.appendMarkdown(`*Last updated: ${dates.lastUpdatedDate}*`);

    return tooltip;
}

async function updateStatusBar(): Promise<void> {
    try {
        log('Updating status bar...');
        const data = await provider.getUsageData();

        if (isValidUsageData(data)) {
            const gpt4Usage = data.usageInfo['gpt-4'];
            const used = gpt4Usage.numRequests || 0;
            const limit = gpt4Usage.maxRequestUsage || '∞';

            statusBarItem.text = `${ICONS.PULSE} Cursor: ${used}/${limit}`;
            statusBarItem.tooltip = createDetailedTooltip(data);

            log(`Status bar updated: ${used}/${limit} requests`);
        } else {
            setErrorState(MESSAGES.ERROR_LOAD);
            log('Failed to get usage data for status bar');
        }
    } catch (error: any) {
        log('Error updating status bar: ' + error.message, true);
        setErrorState(MESSAGES.ERROR_LOAD);
    }
}

function isValidUsageData(data: any): data is UsageData {
    return data &&
        data.usageInfo &&
        data.usageInfo['gpt-4'];
}

export function deactivate(): void {
    log('Cursor Usage extension deactivating...');

    if (statusBarItem) {
        statusBarItem.dispose();
    }
} 