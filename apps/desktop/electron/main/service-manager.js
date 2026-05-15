import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = '3766';

export function createServiceConfig() {
    const port = process.env.DAO_SERVICE_PORT ?? DEFAULT_PORT;
    const sessionToken = crypto.randomBytes(32).toString('hex')

    return {
        port,
        sessionToken,
        baseUrl: `http://127.0.0.1:${port}`
    }
}

export function startLocalService(config) {
    const serviceDir = path.resolve(__dirname, '../../../local-service');

    const child = spawn(
        'go',
        ['run', './cmd/dao-service', '--port', config.port, '--token', config.sessionToken],
        {
            cwd: serviceDir,
            stdio: 'inherit',
            env: {
                ...process.env,
            },
        },
    )

    child.on('exit', (code, signal) => {
        console.log(`dao local service exited with code ${code} and signal ${signal}`);
    })

    return child;
}

export async function waitForServiceHealth(baseUrl, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10_000
    const intervalMs = options.intervalMs ?? 250
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/health`)

            if (response.ok) {
                return
            }
        } catch {
            // Service is still starting.
        }

        await sleep(intervalMs)
    }

    throw new Error(`Timed out waiting for local service at ${baseUrl}`);
}

export function stopLocalService(child) {
    if (!child || child.killed) {
        return
    }

    child.kill()
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}