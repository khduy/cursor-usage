export function log(message: string, isError: boolean = false): void {
    const timestamp = new Date().toISOString();
    const prefix = '[CursorUsage]';
    const fullMessage = `${timestamp} ${prefix} ${message}`;
    
    if (isError) {
        console.error(fullMessage);
    } else {
        console.log(fullMessage);
    }
} 