import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

export const ALLOWED_EXTENSIONS = new Set([
  // Documents
  '.pdf', '.docx', '.pptx', '.txt', '.md',
  // Code & Notebooks
  '.py', '.r', '.ipynb', '.sql', '.java', '.cpp', '.c',
  // Datasets
  '.csv', '.sav', '.dta', '.json',
  // Audio
  '.mp3', '.wav', '.m4a',
  // Labs & Compressed
  '.zip', '.pkt', '.gns3'
]);

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface StorageHeadResult {
  exists: boolean;
  sizeBytes?: number;
  mimeType?: string;
  eTag?: string;
}

export class S3StorageProvider {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.R2_BUCKET_NAME || 'fss-elibrary-storage';

    const endpoint = process.env.R2_ENDPOINT || 'http://localhost:9090';
    const forcePathStyle = process.env.R2_S3_FORCE_PATH_STYLE !== 'false';

    this.client = new S3Client({
      endpoint,
      region: process.env.AWS_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'test',
      },
      forcePathStyle,
    });
  }

  getBucketName(): string {
    return this.bucketName;
  }

  async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
    } catch (err: any) {
      if (
        err.name === 'BucketAlreadyOwnedByYou' ||
        err.name === 'BucketAlreadyExists' ||
        err.$metadata?.httpStatusCode === 409
      ) {
        return;
      }
    }
  }

  private isBucketMissing(err: any): boolean {
    return (
      err.name === 'NoSuchBucket' ||
      err.Code === 'NoSuchBucket' ||
      (err.$metadata?.httpStatusCode === 404 && typeof err.message === 'string' && err.message.toLowerCase().includes('bucket'))
    );
  }

  isFileTypeAllowed(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ALLOWED_EXTENSIONS.has(ext);
  }

  async createPresignedPut(
    key: string,
    mimeType: string,
    sizeBytes: number,
    expiresIn = 900
  ): Promise<string> {
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File exceeds maximum permitted size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async createPresignedGet(
    key: string,
    originalFilename?: string,
    expiresIn = 900,
    inline = false
  ): Promise<string> {
    const disposition = inline
      ? (originalFilename ? `inline; filename="${originalFilename}"` : 'inline')
      : (originalFilename ? `attachment; filename="${originalFilename}"` : undefined);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: disposition,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getObjectStream(
    key: string,
    range?: string
  ): Promise<{
    stream: any;
    contentLength?: number;
    contentType?: string;
    contentRange?: string;
    statusCode: number;
  }> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Range: range,
    });

    try {
      const response = await this.client.send(command);
      return {
        stream: response.Body,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        contentRange: response.ContentRange,
        statusCode: range && response.ContentRange ? 206 : 200,
      };
    } catch (err: any) {
      if (this.isBucketMissing(err)) {
        await this.ensureBucketExists();
        const retryRes = await this.client.send(command);
        return {
          stream: retryRes.Body,
          contentLength: retryRes.ContentLength,
          contentType: retryRes.ContentType,
          contentRange: retryRes.ContentRange,
          statusCode: range && retryRes.ContentRange ? 206 : 200,
        };
      }
      throw err;
    }
  }

  async verifyObjectExists(key: string): Promise<StorageHeadResult> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const response = await this.client.send(command);
      return {
        exists: true,
        sizeBytes: response.ContentLength,
        mimeType: response.ContentType,
        eTag: response.ETag,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      // In local S3 mocks, sometimes missing objects return 404 directly
      return { exists: false };
    }
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  async putObjectDirect(key: string, body: Buffer | Uint8Array, mimeType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: mimeType,
    });
    try {
      await this.client.send(command);
    } catch (err: any) {
      if (this.isBucketMissing(err)) {
        await this.ensureBucketExists();
        await this.client.send(command);
        return;
      }
      throw err;
    }
  }
}

let storageProviderInstance: S3StorageProvider | null = null;

export function getStorageProvider(): S3StorageProvider {
  if (!storageProviderInstance) {
    storageProviderInstance = new S3StorageProvider();
  }
  return storageProviderInstance;
}
