import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { ConfigReader } from '@backstage/config';
import { loadConfig } from '@backstage/config-loader';
import { TechdocsGenerator } from '@backstage/plugin-techdocs-node';
import type {
  GeneratorRunOptions,
  ParsedLocationAnnotation,
} from '@backstage/plugin-techdocs-node';
import * as winston from 'winston';

type SiteOptions = GeneratorRunOptions['siteOptions'];

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function createRootLogger() {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.simple(),
    ),
    transports: [new winston.transports.Console()],
  });
}

function createLoggerService(baseLogger: winston.Logger, meta: Record<string, string> = {}) {
  const scopedLogger = Object.keys(meta).length > 0 ? baseLogger.child(meta) : baseLogger;

  return {
    error(message: string, extra?: Error | Record<string, unknown>) {
      scopedLogger.error(message, extra);
    },
    warn(message: string, extra?: Error | Record<string, unknown>) {
      scopedLogger.warn(message, extra);
    },
    info(message: string, extra?: Error | Record<string, unknown>) {
      scopedLogger.info(message, extra);
    },
    debug(message: string, extra?: Error | Record<string, unknown>) {
      scopedLogger.debug(message, extra);
    },
    child(childMeta: Record<string, unknown>) {
      const normalizedMeta = Object.fromEntries(
        Object.entries(childMeta).map(([key, value]) => [key, String(value)]),
      );
      return createLoggerService(scopedLogger, normalizedMeta);
    },
  };
}

function getConfigTargets(argv: string[]) {
  const configTargets: Array<{ path: string }> = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--config') {
      continue;
    }

    const targetPath = argv[index + 1];
    if (targetPath) {
      configTargets.push({ path: targetPath });
      index += 1;
    }
  }

  if (configTargets.length === 0) {
    configTargets.push({ path: 'app-config.yaml' });
  }

  return configTargets;
}

async function loadAppConfig(argv: string[]) {
  const { appConfigs } = await loadConfig({
    configRoot: process.cwd(),
    configTargets: getConfigTargets(argv),
  });

  return ConfigReader.fromConfigs(appConfigs);
}

function requireWorkerToken() {
  const token = process.env.TECHDOCS_WORKER_TOKEN;
  if (!token) {
    throw new Error('TECHDOCS_WORKER_TOKEN must be configured for the TechDocs worker');
  }
  return token;
}

function parseJsonField<T>(rawValue: unknown, fieldName: string): T | undefined {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON in '${fieldName}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function createArchiveFromDirectory(sourceDir: string, destinationPath: string) {
  await tar.create(
    {
      cwd: sourceDir,
      file: destinationPath,
      gzip: true,
      portable: true,
    },
    ['.'],
  );
}

async function main() {
  const port = Number(process.env.PORT || 7008);
  const workerToken = requireWorkerToken();
  const rootLogger = createRootLogger();
  const loggerService = createLoggerService(rootLogger);
  const config = await loadAppConfig(process.argv.slice(2));
  const generator = TechdocsGenerator.fromConfig(config, { logger: loggerService });
  const app = express();

  app.disable('x-powered-by');

  app.get('/healthcheck', (_req, res) => {
    res.status(200).send('ok');
  });

  app.post('/build', async (req, res) => {
    const requestLogger = rootLogger.child({
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    });

    if (req.header('X-Techdocs-Worker-Token') !== workerToken) {
      requestLogger.warn('Rejected TechDocs worker request with invalid token');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      upload.single('archive')(req as any, res as any, error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const requestFile = req.file;
    if (!requestFile) {
      res.status(400).json({ error: 'Missing archive upload' });
      return;
    }

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'techdocs-worker-build-'));
    const inputDir = path.join(tempDir, 'input');
    const outputDir = path.join(tempDir, 'output');
    const outputArchivePath = path.join(tempDir, 'generated-site.tar.gz');

    try {
      const parsedLocationAnnotation = parseJsonField<ParsedLocationAnnotation>(
        req.body.parsedLocationAnnotation,
        'parsedLocationAnnotation',
      );
      const siteOptions = parseJsonField<SiteOptions>(req.body.siteOptions, 'siteOptions');
      const etag =
        typeof req.body.etag === 'string' && req.body.etag.length > 0 ? req.body.etag : undefined;

      await fsp.mkdir(inputDir, { recursive: true });
      await fsp.mkdir(outputDir, { recursive: true });
      await tar.extract({
        cwd: inputDir,
        file: requestFile.path,
        gzip: true,
      });

      requestLogger.info('Starting TechDocs worker build');

      await generator.run({
        inputDir,
        outputDir,
        parsedLocationAnnotation,
        etag,
        logger: requestLogger,
        siteOptions,
      });

      await createArchiveFromDirectory(outputDir, outputArchivePath);

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="generated-site.tar.gz"');
      await pipeline(fs.createReadStream(outputArchivePath), res);

      requestLogger.info('Completed TechDocs worker build');
    } catch (error) {
      requestLogger.error('TechDocs worker build failed', error as Error);
      if (!res.headersSent) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown TechDocs worker error',
        });
      }
    } finally {
      await Promise.all([
        fsp.rm(tempDir, { recursive: true, force: true }),
        fsp.rm(requestFile.path, { force: true }),
      ]);
    }
  });

  const server = app.listen(port, () => {
    rootLogger.info(`TechDocs worker listening on port ${port}`);
  });

  const shutdown = () => {
    rootLogger.info('Shutting down TechDocs worker');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
