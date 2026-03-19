import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import { TechdocsGenerator, techdocsGeneratorExtensionPoint } from '@backstage/plugin-techdocs-node';
import type {
  GeneratorRunOptions,
  ParsedLocationAnnotation,
} from '@backstage/plugin-techdocs-node';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

type RemoteBuildSiteOptions = GeneratorRunOptions['siteOptions'];

class RemoteTechdocsGenerator extends TechdocsGenerator {
  private readonly workerUrl: string;
  private readonly timeoutMs: number;
  private readonly workerToken: string;
  private readonly inflightBuilds = new Map<string, Promise<void>>();

  constructor(config: Config, logger: LoggerService) {
    super({
      config,
      logger,
      scmIntegrations: ScmIntegrations.fromConfig(config),
    });

    this.workerUrl = config.getString('techdocs.generator.remote.serviceUrl');
    this.timeoutMs = config.getOptionalNumber('techdocs.generator.remote.timeoutMs') ?? 300_000;

    const tokenEnvName =
      config.getOptionalString('techdocs.generator.remote.tokenEnvName') ??
      'TECHDOCS_WORKER_TOKEN';
    const workerToken = process.env[tokenEnvName];
    if (!workerToken) {
      throw new Error(
        `TechDocs remote worker token env '${tokenEnvName}' is not configured`,
      );
    }
    this.workerToken = workerToken;
  }

  override async run(options: GeneratorRunOptions): Promise<void> {
    const buildKey = this.getBuildKey(options.parsedLocationAnnotation, options.siteOptions);
    const activeBuild = this.inflightBuilds.get(buildKey);
    if (activeBuild) {
      options.logger.info(`Reusing inflight TechDocs worker build for ${buildKey}`);
      await activeBuild;
      return;
    }

    const buildPromise = this.executeRemoteBuild(options);
    this.inflightBuilds.set(buildKey, buildPromise);

    try {
      await buildPromise;
    } finally {
      this.inflightBuilds.delete(buildKey);
    }
  }

  private getBuildKey(
    parsedLocationAnnotation?: ParsedLocationAnnotation,
    siteOptions?: RemoteBuildSiteOptions,
  ): string {
    if (parsedLocationAnnotation) {
      return `${parsedLocationAnnotation.type}:${parsedLocationAnnotation.target}`;
    }
    return `site:${siteOptions?.name ?? 'unknown'}`;
  }

  private async executeRemoteBuild(options: GeneratorRunOptions): Promise<void> {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'techdocs-remote-generator-'));
    const sourceArchivePath = path.join(tempDir, 'prepared-source.tar.gz');
    const generatedArchivePath = path.join(tempDir, 'generated-site.tar.gz');

    try {
      options.logger.info(`Sending TechDocs build to remote worker ${this.workerUrl}`);

      await tar.create(
        {
          cwd: options.inputDir,
          file: sourceArchivePath,
          gzip: true,
          portable: true,
        },
        ['.'],
      );

      const formData = new FormData();
      const archiveBuffer = await fsp.readFile(sourceArchivePath);

      formData.append(
        'archive',
        new Blob([archiveBuffer], { type: 'application/gzip' }),
        'prepared-source.tar.gz',
      );
      formData.append(
        'parsedLocationAnnotation',
        JSON.stringify(options.parsedLocationAnnotation ?? null),
      );
      formData.append('etag', options.etag ?? '');
      formData.append('siteOptions', JSON.stringify(options.siteOptions ?? null));

      const response = await fetch(`${this.workerUrl.replace(/\/$/, '')}/build`, {
        method: 'POST',
        headers: {
          'X-Techdocs-Worker-Token': this.workerToken,
        },
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Remote TechDocs worker failed with ${response.status}: ${errorText || response.statusText}`,
        );
      }

      if (!response.body) {
        throw new Error('Remote TechDocs worker returned an empty response body');
      }

      await pipeline(
        Readable.fromWeb(response.body as any),
        fs.createWriteStream(generatedArchivePath),
      );

      await tar.extract({
        cwd: options.outputDir,
        file: generatedArchivePath,
        gzip: true,
      });

      options.logger.info('Remote TechDocs worker build completed');
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  }
}

export const remoteTechdocsGeneratorModule = createBackendModule({
  pluginId: 'techdocs',
  moduleId: 'remote-generator',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        techdocsGenerator: techdocsGeneratorExtensionPoint,
      },
      async init({ config, logger, techdocsGenerator }) {
        if (!config.getOptionalBoolean('techdocs.generator.remote.enabled')) {
          logger.info('TechDocs remote worker generator is disabled');
          return;
        }

        techdocsGenerator.setTechdocsGenerator(new RemoteTechdocsGenerator(config, logger));
        logger.info('TechDocs remote worker generator enabled');
      },
    });
  },
});

export default remoteTechdocsGeneratorModule;
